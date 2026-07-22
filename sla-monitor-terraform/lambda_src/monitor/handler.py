import json
import os
import ssl
import socket
import time
import logging
import decimal
from urllib.parse import urlparse

import boto3
import requests
from boto3.dynamodb.conditions import Key, Attr
from botocore.exceptions import ClientError

from templates import build_down_email, build_up_email




dynamodb = boto3.resource("dynamodb")
ssm = boto3.client("ssm")
ses = boto3.client("ses")

projects_table = dynamodb.Table(os.environ["PROJECTS_TABLE_NAME"])
checks_table = dynamodb.Table(os.environ["CHECKS_TABLE_NAME"])

FAILURE_THRESHOLD_DEFAULT = int(os.environ.get("FAILURE_THRESHOLD_DEFAULT", "3"))
HTTP_TIMEOUT_SECONDS = int(os.environ.get("HTTP_TIMEOUT_SECONDS", "10"))
MAX_REDIRECTS = 3
SES_SENDER_PARAM_PATH = os.environ["SES_SENDER_PARAM_PATH"]
# Cert expiry is slow-moving per-project state; refresh it at most this often
# rather than on every per-minute check.
CERT_REFRESH_SECONDS = int(os.environ.get("CERT_REFRESH_SECONDS", "21600"))  # 6h

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


def classify_error(exc: Exception) -> str:
    """Map a requests exception to a coarse failure cause.

    requests uses multiple inheritance — ConnectTimeout is both a ConnectionError
    and a Timeout, and SSLError subclasses ConnectionError — so the specific bases
    must be tested before the general ConnectionError.
    """
    if isinstance(exc, requests.exceptions.Timeout):
        return "timeout"
    if isinstance(exc, requests.exceptions.SSLError):
        return "tls"
    if isinstance(exc, requests.exceptions.ConnectionError):
        text = str(exc).lower()
        dns_markers = (
            "nameresolution", "failed to resolve", "name or service not known",
            "nodename nor servname", "temporary failure in name resolution", "getaddrinfo",
        )
        return "dns" if any(m in text for m in dns_markers) else "conn"
    return "conn"


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
        with socket.create_connection((host, port), timeout=timeout) as sock:
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


def perform_http_check(url: str) -> dict:
    session = requests.Session()
    session.max_redirects = MAX_REDIRECTS
    start_time = time.time()
    try:
        response   = session.get(url, timeout=HTTP_TIMEOUT_SECONDS, allow_redirects=True)
        latency_ms = int((time.time() - start_time) * 1000)
        http_status = response.status_code
        if http_status == 200:
            status     = "success"
            error_type = None
        else:
            status     = "failure"
            error_type = "http"  # a response came back, just not a healthy one
    except requests.exceptions.RequestException as exc:
        latency_ms  = HTTP_TIMEOUT_SECONDS * 1000
        http_status = 0
        status      = "failure"
        error_type  = classify_error(exc)
    finally:
        session.close()

    return {
        "status": status,
        "latency_ms": latency_ms,
        "http_status_code": http_status,
        "error_type": error_type,
    }


def refresh_certificate_if_stale(project: dict) -> None:
    """Refresh the project's cached TLS cert fields at most every CERT_REFRESH_SECONDS.

    Cert data is stored on the project row (slow-moving state), not on every
    per-minute check row (which TTLs out at 90 days).
    """
    url = project.get("url", "")
    if not url.lower().startswith("https"):
        return
    last_checked = int(project.get("cert_checked_at") or 0)
    if (int(time.time()) - last_checked) <= CERT_REFRESH_SECONDS:
        return

    cert = probe_certificate(url)
    if not cert:
        return

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
    # consistent read), the N-check window, and one check before the window.
    response = checks_table.query(
        KeyConditionExpression=Key("project_id").eq(project_id),
        ScanIndexForward=False,
        Limit=failure_threshold + 2,
        ConsistentRead=True,
    )
    return response.get("Items", [])


def detect_transition(items: list[dict], failure_threshold: int) -> str | None:
    if not items:
        return None

    current = items[0]

    # DOWN: the last N checks (including the current one) all failed, and the
    # check before that window succeeded — or doesn't exist, meaning the
    # project has been down since its very first checks.
    window = items[:failure_threshold]
    if len(window) == failure_threshold and all(c["status"] == "failure" for c in window):
        before = items[failure_threshold] if len(items) > failure_threshold else None
        if before is None or before["status"] == "success":
            return "down"

    # UP: the current check succeeded immediately after a failure run long
    # enough to have triggered a DOWN alert. Anything shorter never alerted,
    # so a recovery email would be noise; and only the first success after
    # the run fires, so a sustained recovery doesn't repeat the email.
    if current["status"] == "success":
        run = 0
        for check in items[1:]:
            if check["status"] == "failure":
                run += 1
            else:
                break
        if run >= failure_threshold:
            return "up"

    return None


def get_first_failure_timestamp(items: list[dict]) -> int:
    # Oldest failure in the consecutive run that starts at the current check.
    first_failure_ts = None
    for item in items:
        if item["status"] == "failure":
            first_failure_ts = int(item["timestamp"])
        else:
            break
    return first_failure_ts if first_failure_ts is not None else int(time.time() * 1000)


def check_project(project: dict) -> None:
    project_id = project["project_id"]
    failure_threshold = int(project.get("failure_threshold", FAILURE_THRESHOLD_DEFAULT))
    notification_email = project.get("notification_email")


    check_result = perform_http_check(project["url"])
    now_ms = int(time.time() * 1000)
    ttl_seconds = int(time.time()) + 7_776_000  # 90 days : dynamodb ttl expects seconds


    check_record = {
        "project_id": project_id,
        "timestamp": now_ms,
        "status": check_result["status"],
        "latency_ms": check_result["latency_ms"],
        "http_status_code": check_result["http_status_code"],
        "ttl": ttl_seconds,
    }
    # Only stored on failures — success has no cause and a null attribute is noise.
    if check_result.get("error_type"):
        check_record["error_type"] = check_result["error_type"]
    checks_table.put_item(Item=check_record)

    logger.info(
        f"Checked {project['name']} ({project['url']}) — "
        f"status={check_result['status']}, latency={check_result['latency_ms']}ms, "
        f"http_status={check_result['http_status_code']}, error_type={check_result['error_type']}"
    )

    # Slow-moving cert state, refreshed on its own cadence. Isolated so a write
    # failure here can never suppress the alerting below.
    try:
        refresh_certificate_if_stale(project)
    except Exception as exc:
        logger.warning(f"Cert refresh failed for {project_id}: {exc}")


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
    logger.info("Monitor Lambda invoked")

    projects = load_active_projects()

    if not projects:
        logger.info("No active projects — exiting")
        return {"statusCode": 200, "body": json.dumps({"message": "No active projects"} , cls=DecimalEncoder)}

    logger.info(f"Processing {len(projects)} active project(s)")

    for index, project in enumerate(projects):
        # Stop before the runtime kills us mid-check: a truncated run would be
        # retried by the async invoke and write duplicate check rows.
        if context.get_remaining_time_in_millis() < (HTTP_TIMEOUT_SECONDS + 5) * 1000:
            skipped = [p["project_id"] for p in projects[index:]]
            logger.warning(f"Out of time — skipped {len(skipped)} project(s) this cycle: {skipped}")
            break

        try:
            check_project(project)
        except Exception as e:
            # One broken project (bad URL, throttle, malformed record) must not
            # take down monitoring for every other tenant.
            logger.error(f"Check failed for project {project.get('project_id')}: {e}")



    logger.info("Monitor Lambda completed successfully")
    return {"statusCode": 200, "body": json.dumps({"message": "OK"}, cls=DecimalEncoder)}
