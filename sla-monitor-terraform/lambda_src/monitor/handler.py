import ipaddress
import json
import os
import random
import re
import ssl
import socket
import time
import logging
import decimal
from concurrent.futures import ThreadPoolExecutor, wait
from datetime import datetime, timedelta, timezone
from urllib.parse import urljoin, urlparse

import boto3
import requests
import urllib3
from boto3.dynamodb.conditions import Key, Attr
from botocore.config import Config
from botocore.exceptions import ClientError
from requests.adapters import HTTPAdapter
from urllib3.connection import HTTPConnection, HTTPSConnection
from urllib3.connectionpool import HTTPConnectionPool, HTTPSConnectionPool
from urllib3.exceptions import ConnectTimeoutError, NameResolutionError, NewConnectionError

from templates import build_down_email, build_up_email




dynamodb = boto3.resource("dynamodb")
# An alert's SSM and SES calls get one retry and short timeouts, so a hung one ends in
# 2 × (1 + 2) s plus at most 1 s of backoff: 7 s, inside ALERT_RESERVE_SECONDS.
ALERT_CONFIG = Config(connect_timeout=1, read_timeout=2, retries={"total_max_attempts": 2})
ssm = boto3.client("ssm", config=ALERT_CONFIG)
ses = boto3.client("ses", config=ALERT_CONFIG)

projects_table = dynamodb.Table(os.environ["PROJECTS_TABLE_NAME"])
checks_table = dynamodb.Table(os.environ["CHECKS_TABLE_NAME"])

FAILURE_THRESHOLD_DEFAULT = int(os.environ.get("FAILURE_THRESHOLD_DEFAULT", "3"))
HTTP_TIMEOUT_SECONDS = int(os.environ.get("HTTP_TIMEOUT_SECONDS", "10"))
MAX_REDIRECTS = 3
# requests' default UA draws a 403 from some sites (Wikipedia); kept plain, as every site sees it.
USER_AGENT = "SLA-Monitor/1.0"
# A check reads at most this much of a body, on the wire: enough to time a normal
# page, never enough to exhaust a 256 MB Lambda.
MAX_BODY_BYTES = 1 << 20  # 1 MiB
# Which HTTP statuses count as "up" when a project does not override them.
# Stored per project and snapshotted onto every check, so editing it later never
# reinterprets checks that were already recorded.
DEFAULT_ACCEPTED_STATUSES = "200-399"
# Covers Cloudflare and AWS WAF. Both mean "your client was stopped", which says
# nothing about whether the site is serving real users.
CHALLENGE_HEADERS = ("cf-mitigated", "x-amzn-waf-action")
SES_SENDER_PARAM_PATH = os.environ["SES_SENDER_PARAM_PATH"]
# Cert expiry is slow-moving per-project state; refresh it at most this often
# rather than on every per-minute check.
CERT_REFRESH_SECONDS = int(os.environ.get("CERT_REFRESH_SECONDS", "21600"))  # 6h
# Targets are probed in parallel so a few slow sites cannot starve the rest of the
# scan. Kept small: a 256 MB Lambda has a fraction of a vCPU, and more concurrent
# TLS handshakes would inflate the very latencies being measured.
CHECK_WORKERS = 8
# Probing stops when this much time is left, so every finished check still gets
# written and alerted on: a run killed mid-way is retried by the async invoke and
# would write its checks twice. An alert alone costs an SSM and an SES call.
WRITE_RESERVE_SECONDS = 12
# No alert starts with less than this left, so a hung SSM or SES call still ends before
# the timeout: a run killed mid-alert loses the rest of that minute's alerts for good.
ALERT_RESERVE_SECONDS = 8
# Each check is also tallied per UTC day on its project row (d20261125_up, …), so
# day verdicts never have to read a month of checks. Older days are pruned.
DAILY_KEEP_DAYS = 45
DAY_KEY = re.compile(r"^d(\d{8})_(up|down|inconclusive)$")
# A project's check is stored at most once per this gap. EventBridge delivers a
# tick at least once and a failed run is retried, so the same minute can run
# twice; this catches a duplicate landing within 30 s of another run.
MIN_RUN_GAP_MS = 30_000
DAY_STATUS = {"success": "up", "failure": "down"}

logger = logging.getLogger()
logger.setLevel(logging.INFO)

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, decimal.Decimal):
            # Preserve integers as int, floats as float
            if obj % 1 == 0:
                return int(obj)
            return float(obj)
        return super().default(obj)




def get_sender_email() -> str:
    response = ssm.get_parameter(Name=SES_SENDER_PARAM_PATH, WithDecryption=True)
    return response["Parameter"]["Value"]


def send_email(to_address: str, subject: str, html_body: str) -> None:
    sender = get_sender_email()
    ses.send_email(
        Source=sender,
        Destination={"ToAddresses": [to_address]},
        Message={
            "Subject": {"Data": subject, "Charset": "UTF-8"},
            "Body": {"Html": {"Data": html_body, "Charset": "UTF-8"}},
        },
    )


class AddressRefused(Exception):
    """The target resolved to an address that isn't public, so the monitor didn't connect.

    Not an OSError on purpose: urllib3 and requests would wrap one as a connection
    error, which reads as down, and refusing says nothing about the target.
    """


def is_public(address: str) -> bool:
    """A public IPv4 address. Only IPv4 is resolved, since a Lambda outside a VPC has no
    outbound IPv6. Multicast is excluded by hand because is_global lets it through."""
    ip = ipaddress.ip_address(address)
    return ip.version == 4 and ip.is_global and not ip.is_multicast


def connect_public(host: str, port: int, timeout) -> socket.socket:
    """Resolve once, refuse unless every address is public, and connect to exactly those.

    The check and the connect use the same lookup, so DNS can't change in between
    (rebinding). A mix of public and private answers is refused outright: no real
    site has one, and it is what a rebinding setup looks like.
    """
    infos = socket.getaddrinfo(host, port, socket.AF_INET, socket.SOCK_STREAM)
    addresses = list(dict.fromkeys(info[4][0] for info in infos))
    if not all(is_public(address) for address in addresses):
        raise AddressRefused(host)
    error = None
    for address in addresses:
        try:
            return socket.create_connection((address, port), timeout)  # a literal: no second lookup
        except OSError as exc:
            error = exc
    raise error or OSError(f"No address for {host}")


class _PublicOnly:
    """urllib3's own _new_conn, with connect_public resolving and connecting. TLS still
    verifies the hostname, since only the socket underneath changes."""

    def _new_conn(self):
        try:
            sock = connect_public(self._dns_host, self.port, self.timeout)
        except socket.gaierror as e:
            raise NameResolutionError(self.host, self, e) from e
        except TimeoutError as e:
            raise ConnectTimeoutError(self, f"Connection to {self.host} timed out. (connect timeout={self.timeout})") from e
        except OSError as e:
            raise NewConnectionError(self, f"Failed to establish a new connection: {e}") from e
        for option in self.socket_options or ():
            sock.setsockopt(*option)
        return sock


class PublicHTTPConnection(_PublicOnly, HTTPConnection):
    pass


class PublicHTTPSConnection(_PublicOnly, HTTPSConnection):
    pass


class PublicHTTPPool(HTTPConnectionPool):
    ConnectionCls = PublicHTTPConnection


class PublicHTTPSPool(HTTPSConnectionPool):
    ConnectionCls = PublicHTTPSConnection


class PublicOnlyAdapter(HTTPAdapter):
    """Every connection a session opens, each redirect hop included, goes through connect_public."""

    def init_poolmanager(self, *args, **kwargs):
        super().init_poolmanager(*args, **kwargs)
        self.poolmanager.pool_classes_by_scheme = {"http": PublicHTTPPool, "https": PublicHTTPSPool}


def classify_error(exc: Exception) -> str:
    """Map a requests or urllib3 exception to a coarse failure cause.

    requests uses multiple inheritance — ConnectTimeout is both a ConnectionError
    and a Timeout, and SSLError subclasses ConnectionError — so the specific bases
    must be tested before the general ConnectionError.
    """
    # The body is read through urllib3 directly, so its own exceptions arrive unwrapped.
    if isinstance(exc, (requests.exceptions.Timeout, urllib3.exceptions.TimeoutError)):
        return "timeout"
    if isinstance(exc, (requests.exceptions.SSLError, urllib3.exceptions.SSLError)):
        return "tls"
    if isinstance(exc, requests.exceptions.ConnectionError):
        text = str(exc).lower()
        dns_markers = (
            "nameresolution", "failed to resolve", "name or service not known",
            "nodename nor servname", "temporary failure in name resolution", "getaddrinfo",
        )
        return "dns" if any(m in text for m in dns_markers) else "conn"
    return "conn"


def parse_accepted_statuses(spec: str | None) -> list[tuple[int, int]]:
    """'200-399,404' -> [(200, 399), (404, 404)].

    Malformed input falls back to the default rather than raising: a bad value
    should never turn a working monitor into a crash loop. The write path
    (project_manager) rejects malformed values before they are stored.
    """
    ranges: list[tuple[int, int]] = []
    for part in str(spec or DEFAULT_ACCEPTED_STATUSES).split(","):
        part = part.strip()
        if not part:
            continue
        try:
            if "-" in part:
                low, high = part.split("-", 1)
                ranges.append((int(low), int(high)))
            else:
                code = int(part)
                ranges.append((code, code))
        except ValueError:
            logger.warning(f"Ignoring malformed accepted_status entry {part!r}")
    if not ranges:
        return [(200, 399)]
    return ranges


def is_status_accepted(http_status: int, ranges: list[tuple[int, int]]) -> bool:
    return any(low <= http_status <= high for low, high in ranges)


def is_bot_challenge(headers) -> bool:
    """True when the response is a challenge/CAPTCHA page rather than the site."""
    for header in CHALLENGE_HEADERS:
        if str(headers.get(header, "")).lower() in ("challenge", "captcha"):
            return True
    return False


def classify_response(http_status: int, headers, ranges: list[tuple[int, int]]) -> tuple[str, str | None]:
    """Turn an HTTP response we actually received into (status, error_type).

    Accepted codes are tested first, so a monitor that deliberately accepts 403
    keeps a real signal instead of being treated as blocked.
    """
    if is_status_accepted(http_status, ranges):
        return "success", None
    if is_bot_challenge(headers):
        return "inconclusive", "blocked"
    return "failure", "http"


def probe_certificate(url: str, timeout: int = 5) -> dict | None:
    """Best-effort TLS certificate read for HTTPS URLs.

    Returns {cert_expiry_days, cert_issuer} or None for http:// URLs and any
    failure. Never raises — cert probing must not break the health check.
    """
    try:
        parsed = urlparse(url)
        if parsed.scheme != "https":
            return None
        host = parsed.hostname
        port = parsed.port or 443
        ctx = ssl.create_default_context()
        with connect_public(host, port, timeout) as sock:
            with ctx.wrap_socket(sock, server_hostname=host) as tls:
                cert = tls.getpeercert()
        not_after = ssl.cert_time_to_seconds(cert["notAfter"])
        days = int((not_after - time.time()) // 86400)
        issuer = {k: v for rdn in cert.get("issuer", ()) for (k, v) in rdn}
        return {
            "cert_expiry_days": days,
            "cert_issuer": issuer.get("commonName") or issuer.get("organizationName") or "",
        }
    except Exception as exc:
        logger.warning(f"Cert probe failed for {url}: {exc}")
        return None


class CheckSession(requests.Session):
    """A session that never resolves redirects itself. Even with allow_redirects=False,
    requests runs this to fill in response.next, and it reads the redirect's whole body
    into memory first; fetch follows redirects by hand instead."""

    def resolve_redirects(self, *args, **kwargs):
        return iter(())


def drain(response, start_time: float) -> None:
    """Read and discard the body, at most MAX_BODY_BYTES and within the check's deadline.

    Bytes come off the wire undecompressed (raw.read1), so a gzip bomb never
    inflates. The deadline is checked between reads, and a read can block no
    longer than its hop's socket timeout (the time that was left), so a body
    dripping a byte at a time is cut near HTTP_TIMEOUT_SECONDS.
    """
    read = 0
    while read < MAX_BODY_BYTES:
        if time.time() - start_time > HTTP_TIMEOUT_SECONDS:
            raise requests.exceptions.ReadTimeout("The body did not finish within the check's deadline")
        chunk = response.raw.read1(16384)
        if not chunk:
            return
        read += len(chunk)


def fetch(session, url: str, start_time: float):
    """GET, following up to MAX_REDIRECTS redirects by hand.

    requests would read each redirect's whole body into memory, decompressed;
    here every response, a redirect's included, goes through drain.
    """
    for _ in range(MAX_REDIRECTS + 1):
        # One budget for the whole answer: each hop gets only the time left.
        left = HTTP_TIMEOUT_SECONDS - (time.time() - start_time)
        if left <= 0:
            raise requests.exceptions.ReadTimeout("The check ran out of time across redirects")
        response = session.get(url, timeout=left, allow_redirects=False, stream=True)
        try:
            drain(response, start_time)
        finally:
            response.close()
        target = session.get_redirect_target(response)
        if not target:  # not a redirect, or one with an empty Location: requests stops there too
            return response
        url = urljoin(response.url, target)
    raise requests.exceptions.TooManyRedirects(f"Exceeded {MAX_REDIRECTS} redirects")


def perform_http_check(url: str, accepted_statuses: str | None = None) -> dict:
    ranges = parse_accepted_statuses(accepted_statuses)
    session = CheckSession()
    # No proxy or .netrc from the environment: the address check must see the target itself.
    session.trust_env = False
    session.headers["User-Agent"] = USER_AGENT
    adapter = PublicOnlyAdapter()
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    start_time = time.time()
    try:
        response   = fetch(session, url, start_time)
        latency_ms = int((time.time() - start_time) * 1000)
        http_status = response.status_code
        status, error_type = classify_response(http_status, response.headers, ranges)
    except AddressRefused:
        # The site or one of its redirects resolved to a private or reserved address.
        # The monitor refused to connect, which says nothing about the target.
        latency_ms = int((time.time() - start_time) * 1000)
        http_status = 0
        status = "inconclusive"
        error_type = "private"
    except (requests.exceptions.RequestException, urllib3.exceptions.HTTPError) as exc:
        latency_ms  = HTTP_TIMEOUT_SECONDS * 1000
        http_status = 0
        # A timeout, refused connection or TLS failure is evidence about the
        # target, so it stays a failure. Only our own inability to form a
        # verdict (a challenge page, a probe-side error) is inconclusive.
        status      = "failure"
        error_type  = classify_error(exc)
    finally:
        session.close()

    return {
        "status": status,
        "latency_ms": latency_ms,
        "http_status_code": http_status,
        "error_type": error_type,
        # latency_ms is a placeholder when no response came, so the probe's real start is kept too.
        "probe_started_at": int(start_time * 1000),
    }


def certificate_due(project: dict) -> bool:
    """True when an HTTPS project's cached TLS cert fields are older than CERT_REFRESH_SECONDS.

    Cert data is stored on the project row (slow-moving state), not on every
    per-minute check row (which TTLs out at 90 days).
    """
    if not project.get("url", "").lower().startswith("https"):
        return False
    return int(time.time()) - int(project.get("cert_checked_at") or 0) > CERT_REFRESH_SECONDS


def save_certificate(project: dict, cert: dict) -> None:
    projects_table.update_item(
        Key={"project_id": project["project_id"]},
        UpdateExpression="SET cert_expiry_days = :d, cert_issuer = :i, cert_checked_at = :t",
        ExpressionAttributeValues={
            ":d": cert["cert_expiry_days"],
            ":i": cert["cert_issuer"],
            ":t": int(time.time()),
        },
    )
    logger.info(
        f"Refreshed cert for {project.get('name')}: expires in "
        f"{cert['cert_expiry_days']}d (issuer={cert['cert_issuer']})"
    )




def fetch_recent_checks(project_id: str, failure_threshold: int) -> list[dict]:
    # Newest first: the current check (written moments ago — hence the
    # consistent read), the N-check window, and enough history to see where the
    # run before it started. Inconclusive checks lengthen that history, so the
    # window is wider than the threshold.
    response = checks_table.query(
        KeyConditionExpression=Key("project_id").eq(project_id),
        ScanIndexForward=False,
        Limit=(failure_threshold * 2) + 5,
        ConsistentRead=True,
    )
    return response.get("Items", [])


def _is_failure(check: dict) -> bool:
    return check.get("status") == "failure"


def _is_success(check: dict) -> bool:
    return check.get("status") == "success"


def detect_transition(items: list[dict], failure_threshold: int) -> str | None:
    if not items:
        return None

    current = items[0]

    # DOWN: the last N checks (including the current one) all failed, and the
    # run starts here — the check before the window is not a failure, or does
    # not exist, meaning the project has been down since its first checks.
    # An inconclusive check inside the window breaks it, so a blocked probe can
    # never manufacture a DOWN alert.
    window = items[:failure_threshold]
    if len(window) == failure_threshold and all(_is_failure(c) for c in window):
        before = items[failure_threshold] if len(items) > failure_threshold else None
        if before is None or not _is_failure(before):
            return "down"

    # UP: the current check succeeded immediately after a failure run long
    # enough to have triggered a DOWN alert. Anything shorter never alerted,
    # so a recovery email would be noise; and only the first success after
    # the run fires, so a sustained recovery doesn't repeat the email.
    # Inconclusive checks are skipped, not counted: a transient block between
    # the outage and the recovery must not swallow the recovery email.
    if _is_success(current):
        run = 0
        for check in items[1:]:
            if _is_failure(check):
                run += 1
            elif _is_success(check):
                break
        if run >= failure_threshold:
            return "up"

    return None


def get_first_failure_timestamp(items: list[dict]) -> int:
    # Oldest failure in the consecutive run that starts at the current check.
    # Inconclusive checks are skipped, for the same reason as in detect_transition.
    first_failure_ts = None
    for item in items:
        if _is_failure(item):
            first_failure_ts = int(item["timestamp"])
        elif _is_success(item):
            break
    return first_failure_ts if first_failure_ts is not None else int(time.time() * 1000)


def run_check(project: dict) -> dict:
    """The HTTP check, timestamped when it returns. Runs in a worker thread, so it
    makes no AWS calls (boto3 resources are not thread-safe) and keeps no state."""
    result = perform_http_check(project["url"], project.get("accepted_status") or DEFAULT_ACCEPTED_STATUSES)
    result["timestamp"] = int(time.time() * 1000)
    return result


def write_check(project: dict, check_result: dict) -> None:
    check_record = {
        "project_id": project["project_id"],
        "timestamp": check_result["timestamp"],
        "status": check_result["status"],
        "latency_ms": check_result["latency_ms"],
        "http_status_code": check_result["http_status_code"],
        # Snapshot of the rule that judged this check. Editing a project's
        # accepted statuses later must not rewrite history.
        "accepted_status": project.get("accepted_status") or DEFAULT_ACCEPTED_STATUSES,
        "ttl": check_result["timestamp"] // 1000 + 7_776_000,  # 90 days: dynamodb ttl expects seconds
    }
    # Only stored on failures — success has no cause and a null attribute is noise.
    if check_result.get("error_type"):
        check_record["error_type"] = check_result["error_type"]
    # Stage times, epoch ms like `timestamp` (the probe's end): when the run began,
    # when this probe began, and just before this row's PutItem.
    check_record.update({k: check_result[k] for k in ("run_started_at", "probe_started_at") if k in check_result})
    check_record["write_started_at"] = int(time.time() * 1000)
    checks_table.put_item(Item=check_record)

    logger.info(
        f"Checked {project['name']} ({project['url']}) — "
        f"status={check_result['status']}, latency={check_result['latency_ms']}ms, "
        f"http_status={check_result['http_status_code']}, error_type={check_result['error_type']}"
    )


def claim_and_count(project: dict, check_result: dict) -> None:
    """Claim this run for the project and add the check to its UTC day's tally, in
    one conditional update of the project row (ADD creates the counter).

    Raises ConditionalCheckFailedException when another invocation checked the
    project less than MIN_RUN_GAP_MS before this run started, or the row is gone.
    """
    day = datetime.fromtimestamp(check_result["timestamp"] / 1000, timezone.utc)
    run = check_result["run_started_at"]
    names = {
        "#pid": "project_id",
        "#count": f"d{day:%Y%m%d}_{DAY_STATUS.get(check_result['status'], 'inconclusive')}",
        "#since": "daily_since",
        "#run": "last_run_at",
    }
    expression = "ADD #count :one SET #since = if_not_exists(#since, :day), #run = :run"
    # Prune the old days this row actually holds; deleting one fixed day would
    # leave behind any day the monitor happened to skip.
    cutoff = f"{day - timedelta(days=DAILY_KEEP_DAYS):%Y%m%d}"
    old = [key for key in project if (match := DAY_KEY.match(key)) and match.group(1) < cutoff]
    if old:
        names.update({f"#old{i}": key for i, key in enumerate(old)})
        expression += " REMOVE " + ", ".join(f"#old{i}" for i in range(len(old)))
    projects_table.update_item(
        Key={"project_id": project["project_id"]},
        UpdateExpression=expression,
        # Never create a row for a project that no longer exists, and never store
        # a second check for a run another invocation already made.
        # `#run = :run` lets the SDK's own retry of this call through, when the first try landed.
        ConditionExpression="attribute_exists(#pid) AND (attribute_not_exists(#run) OR #run < :floor OR #run = :run)",
        ExpressionAttributeNames=names,
        ExpressionAttributeValues={":one": 1, ":day": f"{day:%Y-%m-%d}", ":run": run, ":floor": run - MIN_RUN_GAP_MS},
    )


def alert_on_transition(project: dict, check_result: dict) -> None:
    project_id = project["project_id"]
    failure_threshold = int(project.get("failure_threshold", FAILURE_THRESHOLD_DEFAULT))
    notification_email = project.get("notification_email")

    recent_checks = fetch_recent_checks(project_id, failure_threshold)
    transition = detect_transition(recent_checks, failure_threshold)

    if transition is None:
        return
    if not notification_email:
        logger.warning(f"No notification email on project {project_id} — skipping {transition} alert")
        return

    if transition == "down":
        first_failure_ts = get_first_failure_timestamp(recent_checks)
        subject, html_body = build_down_email(
            project, first_failure_ts, check_result["http_status_code"], check_result.get("error_type")
        )
        try:
            send_email(notification_email, subject, html_body)
            logger.info(f"DOWN alert sent for project {project_id}")
        except ClientError as e:
            logger.error(f"Failed to send DOWN email for project {project_id}: {e}")

    elif transition == "up":
        subject, html_body = build_up_email(project)
        try:
            send_email(notification_email, subject, html_body)
            logger.info(f"UP alert sent for project {project_id}")
        except ClientError as e:
            logger.error(f"Failed to send UP email for project {project_id}: {e}")




def load_active_projects() -> list[dict]:
    projects = []
    scan_kwargs = {"FilterExpression": Attr("active").eq(True)}
    while True:
        response = projects_table.scan(**scan_kwargs)
        projects.extend(response.get("Items", []))
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            return projects
        scan_kwargs["ExclusiveStartKey"] = last_key


#invoked by EventBridge rule every 1minute
def lambda_handler(event: dict, context) -> dict:
    run_started_at = int(time.time() * 1000)
    logger.info("Monitor Lambda invoked")

    projects = load_active_projects()

    if not projects:
        logger.info("No active projects — exiting")
        return {"statusCode": 200, "body": json.dumps({"message": "No active projects"} , cls=DecimalEncoder)}

    logger.info(f"Processing {len(projects)} active project(s)")

    # shortcut: 8 workers finish about 8 timeouts inside the probe window; past that,
    # some checks are skipped each cycle. Shuffled, so no project is starved every
    # time. Add workers (and memory) if a real fleet gets there.
    random.shuffle(projects)
    # Every target is probed in parallel; all AWS calls then happen on this thread.
    # Not a `with` block: that would wait for a straggler instead of abandoning it.
    pool = ThreadPoolExecutor(max_workers=min(len(projects), CHECK_WORKERS))
    checks = [pool.submit(run_check, project) for project in projects]
    certs = [
        pool.submit(probe_certificate, project["url"]) if certificate_due(project) else None
        for project in projects
    ]
    budget = context.get_remaining_time_in_millis() / 1000 - WRITE_RESERVE_SECONDS
    wait([f for f in checks + certs if f], timeout=max(budget, 0))
    pool.shutdown(wait=False, cancel_futures=True)

    def finished(future) -> bool:
        return future is not None and future.done() and not future.cancelled()

    def time_left() -> bool:
        # Stop before the runtime kills us mid-write: a killed run is retried by the
        # async invoke, which probes every site again.
        return context.get_remaining_time_in_millis() > 2_000

    # Evidence first: every finished check is stored before any alert is
    # evaluated, so a slow SES call can never cost a check.
    written, skipped = [], []
    for project, check, cert in zip(projects, checks, certs):
        if not finished(check) or not time_left():
            skipped.append(project["project_id"])
            continue
        try:
            result = check.result()
            result["run_started_at"] = run_started_at
        except Exception as e:
            # One broken project (bad URL, malformed record) must not take down
            # monitoring for every other tenant.
            logger.error(f"Check failed for project {project.get('project_id')}: {e}")
            continue
        try:
            claim_and_count(project, result)
        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                # A duplicate delivery or a retry (another run stored this project's
                # check moments ago), or the row is gone: store nothing, alert on nothing.
                logger.info(f"Claimed by another run, or no project row — skipping {project['project_id']}")
                continue
            logger.warning(f"Daily rollup failed for {project['project_id']}: {e}")
        except Exception as exc:
            # Bookkeeping only: a failed claim or tally must never cost a check.
            logger.warning(f"Daily rollup failed for {project['project_id']}: {exc}")
        try:
            write_check(project, result)
            written.append((project, result))
        except Exception as e:
            # shortcut: the claim and tally are already in, so a failed write leaves the day's
            # tally one high and the run claimed; a TransactWriteItems would make them atomic.
            logger.error(f"Check failed for project {project.get('project_id')}: {e}")
            continue
        # Slow-moving cert state on its own cadence; a failure here never touches the check.
        if finished(cert) and cert.result():
            try:
                save_certificate(project, cert.result())
            except Exception as exc:
                logger.warning(f"Cert refresh failed for {project['project_id']}: {exc}")

    if skipped:
        # shortcut: a site slower than the whole probe window is skipped, so it reads
        # STALE rather than DOWN; add a per-request total deadline if real sites hit this.
        logger.warning(f"Out of time — skipped {len(skipped)} project(s) this cycle: {skipped}")

    for project, result in written:
        if context.get_remaining_time_in_millis() < ALERT_RESERVE_SECONDS * 1000:
            logger.warning(f"Out of time — transitions not evaluated for project {project['project_id']} onwards")
            break
        try:
            alert_on_transition(project, result)
        except Exception as e:
            logger.error(f"Alerting failed for project {project['project_id']}: {e}")


    logger.info("Monitor Lambda completed successfully")
    return {"statusCode": 200, "body": json.dumps({"message": "OK"}, cls=DecimalEncoder)}
