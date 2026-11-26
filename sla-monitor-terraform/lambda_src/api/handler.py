import json
import logging
import os
import re
import time
import decimal
from datetime import datetime, timedelta, timezone

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)


_dynamodb = None
_users_table = None
_projects_table = None
_checks_table = None
_reports_table = None
_project_gsi_name = None

s3_client = boto3.client("s3")
lambda_client = boto3.client("lambda")
REPORTS_BUCKET_NAME = os.environ.get("REPORTS_BUCKET_NAME", "")
REPORT_GENERATOR_FUNCTION_NAME = os.environ.get("REPORT_GENERATOR_FUNCTION_NAME", "")


def _rebuild_report_artifact(project_id: str, report_id: str) -> None:
    """Ask the report generator to (re)create a report's S3 files. Used as a self-heal
    when the artifact is missing — e.g. a row produced by older code. Best-effort:
    any failure just leaves the caller to return a clean 404."""
    if not REPORT_GENERATOR_FUNCTION_NAME:
        return
    try:
        lambda_client.invoke(
            FunctionName=REPORT_GENERATOR_FUNCTION_NAME,
            InvocationType="RequestResponse",
            Payload=json.dumps({"project_id": project_id, "report_id": report_id}).encode("utf-8"),
        )
    except ClientError:
        pass


class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, decimal.Decimal):
            # Preserve integers as int, floats as float
            if obj % 1 == 0:
                return int(obj)
            return float(obj)
        return super().default(obj)



# The monitor rule runs at rate(1 minute); used to say how many checks a window
# should have contained, so missing evidence is visible instead of implied.
CHECK_INTERVAL_SECONDS = 60
# The monitor tallies every check per UTC day on its project row (d20261125_up, …).
DAY_KEY = re.compile(r"^d(\d{8})_(up|down|inconclusive)$")
DAILY_LIST_DAYS = 14
DAILY_DETAIL_DAYS = 30
# Fields a report row keeps for its own document (report_generator build_report);
# the report list leaves them out.
REPORT_DETAIL_KEYS = {"daily", "incidents", "causes", "previous", "target", "monitor"}


def _get_tables():
    global _dynamodb, _users_table, _projects_table, _checks_table, _reports_table, _project_gsi_name
    if _dynamodb is None:
        _dynamodb = boto3.resource("dynamodb")
        _users_table = _dynamodb.Table(os.environ["USERS_TABLE_NAME"])
        _projects_table = _dynamodb.Table(os.environ["PROJECTS_TABLE_NAME"])
        _checks_table = _dynamodb.Table(os.environ["CHECKS_TABLE_NAME"])
        _reports_table = _dynamodb.Table(os.environ["REPORTS_TABLE_NAME"])
        _project_gsi_name = os.environ["PROJECT_GSI_NAME"]
    return _users_table, _projects_table, _checks_table, _reports_table, _project_gsi_name


# Incidents live behind a dedicated lazy accessor rather than the 5-tuple above:
# _get_tables() is unpacked positionally at every call site, so widening it would
# break each one.
_incidents_table = None


def _get_incidents_table():
    global _incidents_table
    if _incidents_table is None:
        _incidents_table = boto3.resource("dynamodb").Table(os.environ["INCIDENTS_TABLE_NAME"])
    return _incidents_table


CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
}


def success(status_code: int, body: dict | list):
    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": json.dumps(body, cls=DecimalEncoder),
    }


def error_response(status_code: int, message: str):
    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": json.dumps({"error": message}, cls=DecimalEncoder),
    }




def get_user_id(event: dict) -> str:
    claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
    return claims["sub"]


def handle_get_health() -> dict:
    return success(200, {"status": "ok"})



def _without_rollup(item: dict) -> dict:
    """A project row minus the monitor's per-day counters, which are internal."""
    return {key: value for key, value in item.items() if not DAY_KEY.match(key)}


def get_project_or_403(project_id: str, user_id: str) -> dict | None:
    _, projects_table, _, _, _ = _get_tables()
    response = projects_table.get_item(Key={"project_id": project_id})
    project = response.get("Item")
    if not project or project.get("user_id") != user_id:
        return None
    return project




def handle_get_me(event: dict) -> dict:
    user_id = get_user_id(event)
    users_table, _, _, _, _ = _get_tables()

    result = users_table.get_item(Key={"user_id": user_id})
    user = result.get("Item")

    if not user:
        return error_response(404, "User not found")

    return success(200, user)


def _parse_hours(query_params: dict) -> int | None:
    """The `hours` query parameter clamped to 1-72, or None when it is not an integer."""
    try:
        hours = int(query_params.get("hours", 24))
    except (TypeError, ValueError):
        return None
    return min(max(hours, 1), 72)


def _status_window(checks_table, project_id: str, hours: int) -> dict:
    """A project's checks over the last `hours` and their summary: the /status payload."""
    now_ms = int(time.time() * 1000)
    from_ms = now_ms - (hours * 3600 * 1000)

    checks = []
    query_kwargs = {
        "KeyConditionExpression": "project_id = :pid AND #ts BETWEEN :from_ts AND :now_ts",
        "ExpressionAttributeNames": {"#ts": "timestamp"},
        "ExpressionAttributeValues": {
            ":pid": project_id,
            ":from_ts": from_ms,
            ":now_ts": now_ms,
        },
        "ScanIndexForward": True,
    }
    # A 72h window is ~4,300 items — enough to cross the 1MB page limit.
    while True:
        response = checks_table.query(**query_kwargs)
        checks.extend(response.get("Items", []))
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break
        query_kwargs["ExclusiveStartKey"] = last_key

    current_status = checks[-1].get("status") if checks else "unknown"

    up = sum(1 for c in checks if c.get("status") == "success")
    down = sum(1 for c in checks if c.get("status") == "failure")
    inconclusive = len(checks) - up - down
    conclusive = up + down
    expected = max(hours * 3600 // CHECK_INTERVAL_SECONDS, 1)

    summary = {
        "window_hours": hours,
        "checks_total": len(checks),
        "checks_up": up,
        "checks_down": down,
        "checks_inconclusive": inconclusive,
        "checks_expected": expected,
        # None, not 0.0: "no conclusive checks" is not "0% uptime".
        "uptime_pct": round((up / conclusive) * 100, 2) if conclusive else None,
        "coverage_pct": round(min(conclusive / expected, 1) * 100, 2),
    }

    return {
        "project_id": project_id,
        "current_status": current_status,
        "summary": summary,
        "checks": checks,
    }


def _incidents_between(project_id: str, from_sec: int, to_sec: int) -> list[dict]:
    """Incidents that started inside [from_sec, to_sec], newest first."""
    incidents = []
    query_kwargs = {
        "KeyConditionExpression": "project_id = :pid AND start_time BETWEEN :from_ts AND :now_ts",
        "ExpressionAttributeValues": {":pid": project_id, ":from_ts": from_sec, ":now_ts": to_sec},
        "ScanIndexForward": False,
    }
    while True:
        response = _get_incidents_table().query(**query_kwargs)
        incidents.extend(response.get("Items", []))
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            return incidents
        query_kwargs["ExclusiveStartKey"] = last_key


def _incident_before(project_id: str, from_sec: int) -> list[dict]:
    """The last incident that began before `from_sec`: it can still run into a window starting there."""
    response = _get_incidents_table().query(
        KeyConditionExpression="project_id = :pid AND start_time < :from_ts",
        ExpressionAttributeValues={":pid": project_id, ":from_ts": from_sec},
        ScanIndexForward=False,
        Limit=1,
    )
    return response.get("Items", [])


def _daily(project: dict, days: int, now_sec: int) -> dict:
    """The project's last `days` UTC days, oldest first: the monitor's check
    tallies, and the seconds of confirmed outage (incidents) inside each day."""
    tallies: dict[str, dict] = {}
    for key, value in project.items():
        match = DAY_KEY.match(key)
        if match:
            tallies.setdefault(match.group(1), {})[match.group(2)] = int(value)

    first = datetime.fromtimestamp(now_sec, timezone.utc).date() - timedelta(days=days - 1)
    from_sec = int(datetime(first.year, first.month, first.day, tzinfo=timezone.utc).timestamp())
    incidents = _incidents_between(project["project_id"], from_sec, now_sec)
    spans = [
        (int(i["start_time"]), int(i["end_time"]) if i.get("end_time") is not None else now_sec)
        for i in incidents + _incident_before(project["project_id"], from_sec)
    ]

    out = []
    for offset in range(days):
        day = first + timedelta(days=offset)
        start = from_sec + offset * 86400
        end = min(start + 86400, now_sec)
        counts = tallies.get(f"{day:%Y%m%d}", {})
        out.append({
            "date": day.isoformat(),
            "up": counts.get("up", 0),
            "down": counts.get("down", 0),
            "inconclusive": counts.get("inconclusive", 0),
            "outage_sec": sum(max(0, min(span_end, end) - max(span_start, start)) for span_start, span_end in spans),
        })
    return {"since": project.get("daily_since"), "days": out}


def handle_get_projects(event: dict) -> dict:
    user_id = get_user_id(event)
    _, projects_table, checks_table, _, PROJECT_GSI_NAME = _get_tables()

    # ?include=status embeds each project's /status payload, so the dashboard
    # needs one request per poll instead of one per project.
    query_params = event.get("queryStringParameters") or {}
    include_status = query_params.get("include") == "status"
    hours = _parse_hours(query_params) if include_status else None
    if include_status and hours is None:
        return error_response(400, "hours must be an integer")
    if hours:
        # Every project's window shares one response; at 72 h ten projects could pass Lambda's 6 MB limit.
        hours = min(hours, 24)

    projects = []
    query_kwargs = {
        "IndexName": PROJECT_GSI_NAME,
        "KeyConditionExpression": "user_id = :uid",
        "ExpressionAttributeValues": {":uid": user_id},
    }
    while True:
        response = projects_table.query(**query_kwargs)
        projects.extend(response.get("Items", []))
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break
        query_kwargs["ExclusiveStartKey"] = last_key


    enriched = []
    for project in projects:
        status = _status_window(checks_table, project["project_id"], hours) if include_status else None
        if status and status["checks"]:
            # The window ends now, so its newest check is the newest check overall.
            checks = status["checks"][-1:]
        else:
            checks_response = checks_table.query(
                KeyConditionExpression="project_id = :pid",
                ExpressionAttributeValues={":pid": project["project_id"]},
                ScanIndexForward=False, #newest
                Limit=1,
            )
            checks = checks_response.get("Items", [])

        enriched_project = {
            "project_id": project["project_id"],
            "name": project["name"],
            "url": project["url"],
            "active": project["active"],
            "created_at": project["created_at"],
        }

        if checks:
            last_check = checks[0]
            enriched_project["current_status"] = last_check["status"]
            enriched_project["last_latency_ms"] = last_check["latency_ms"]
            enriched_project["last_checked_at"] = last_check.get("timestamp")
        else:
            enriched_project["current_status"] = "unknown"
            enriched_project["last_latency_ms"] = None
            enriched_project["last_checked_at"] = None

        if status:
            status["daily"] = _daily(project, DAILY_LIST_DAYS, int(time.time()))
            enriched_project["status"] = status

        enriched.append(enriched_project)

    return success(200, enriched)


def handle_get_projects_status(event: dict) -> dict:
    user_id = get_user_id(event)
    project_id = event["pathParameters"]["project_id"]
    _, _, checks_table, _, _ = _get_tables()

    project = get_project_or_403(project_id, user_id)
    if not project:
        return error_response(403, "Forbidden")


    hours = _parse_hours(event.get("queryStringParameters") or {})
    if hours is None:
        return error_response(400, "hours must be an integer")

    status = _status_window(checks_table, project_id, hours)
    status["daily"] = _daily(project, DAILY_DETAIL_DAYS, int(time.time()))
    return success(200, status)


def handle_get_project(event: dict) -> dict:
    user_id = get_user_id(event)
    project_id = event["pathParameters"]["project_id"]
    _, projects_table, _, _, _ = _get_tables()

    project = get_project_or_403(project_id, user_id)
    if not project:
        return error_response(403, "Forbidden")

    return success(200, _without_rollup(project))


def handle_get_projects_reports(event: dict) -> dict:
    user_id = get_user_id(event)
    project_id = event["pathParameters"]["project_id"]
    _, _, _, reports_table, _ = _get_tables()


    project = get_project_or_403(project_id, user_id)
    if not project:
        return error_response(403, "Forbidden")

    reports = []
    query_kwargs = {
        "KeyConditionExpression": "project_id = :pid",
        "ExpressionAttributeValues": {":pid": project_id},
    }
    while True:
        response = reports_table.query(**query_kwargs)
        reports.extend(response.get("Items", []))
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break
        query_kwargs["ExclusiveStartKey"] = last_key

    # The page polls this list; the document's own detail stays in the report file.
    return success(200, [{k: v for k, v in r.items() if k not in REPORT_DETAIL_KEYS} for r in reports])


def _reliability_metrics(incidents: list[dict], thresholds: dict, from_sec: int, now_sec: int) -> dict:
    """Derive SRE reliability metrics from a project's incidents over a window.

    DynamoDB numbers arrive as Decimal; coerce to int/float here so the math is
    plain and the returned dict is JSON-safe. An ongoing (unresolved) incident
    accrues downtime up to `now_sec`. Downtime and the longest outage count only
    the part of an incident inside the window; MTTR uses whole durations.
    """
    window_sec = max(now_sec - from_sec, 1)
    resolved = [i for i in incidents if i.get("resolved") is True]
    open_incidents = [i for i in incidents if not i.get("resolved")]

    incident_count = len(incidents)
    durations = [
        int(i["duration_seconds"]) - max(from_sec - int(i["start_time"]), 0)
        for i in resolved if i.get("duration_seconds") is not None
    ]

    # By design there is at most one open incident; it counts up to now, from
    # the window's start if it began before it.
    open_downtime = 0
    if open_incidents:
        open_start = max(int(open_incidents[0]["start_time"]), from_sec)
        open_downtime = max(now_sec - open_start, 0)

    total_downtime = sum(durations) + open_downtime
    # An incident closed because monitoring stopped was cut off, not repaired:
    # it still counts as downtime, but not toward the time to recover.
    repairs = [
        int(i["duration_seconds"]) for i in resolved
        if i.get("duration_seconds") is not None and not i.get("closed_reason")
    ]
    mttr_sec = round(sum(repairs) / len(repairs)) if repairs else 0

    longest_candidates = list(durations)
    if open_incidents:
        longest_candidates.append(open_downtime)
    longest_outage_sec = max(longest_candidates) if longest_candidates else 0

    # MTBF as uptime ÷ failures — well-defined at a single incident, unlike the
    # gap-between-starts variant.
    uptime_sec = max(window_sec - total_downtime, 0)
    mtbf_sec = round(uptime_sec / incident_count) if incident_count > 0 else None

    downtime_pct = round(total_downtime / window_sec * 100, 2)

    min_uptime = float(thresholds.get("min_uptime_pct", 99.9))
    allowed = window_sec * (1 - min_uptime / 100)
    consumed = total_downtime
    if allowed <= 0:
        # min_uptime_pct == 100 leaves no budget at all: any downtime is a breach.
        burn_pct = 0.0 if consumed == 0 else 100.0
    else:
        burn_pct = round(consumed / allowed * 100, 2)

    return {
        "incident_count": incident_count,
        "open_incident": len(open_incidents) > 0,
        "mttr_sec": mttr_sec,
        "mtbf_sec": mtbf_sec,
        "longest_outage_sec": longest_outage_sec,
        "total_downtime_sec": total_downtime,
        "downtime_pct": downtime_pct,
        "error_budget": {
            "min_uptime_pct": min_uptime,
            "allowed_downtime_sec": round(allowed),
            "consumed_downtime_sec": consumed,
            "remaining_sec": round(allowed - consumed),
            "burn_pct": burn_pct,
            "ok": consumed <= allowed,
        },
    }


def handle_get_projects_incidents(event: dict) -> dict:
    user_id = get_user_id(event)
    project_id = event["pathParameters"]["project_id"]

    project = get_project_or_403(project_id, user_id)
    if not project:
        return error_response(403, "Forbidden")

    query_params = event.get("queryStringParameters") or {}
    try:
        days = int(query_params.get("days", 30))
    except (TypeError, ValueError):
        return error_response(400, "days must be an integer")
    days = min(max(days, 1), 365)

    now_sec = int(time.time())
    from_sec = now_sec - (days * 86400)

    incidents = _incidents_between(project_id, from_sec, now_sec)
    # An outage that began before the window still counts if it ran into it (or is still open).
    incidents += [
        i for i in _incident_before(project_id, from_sec)
        if not i.get("resolved") or int(i.get("end_time") or 0) > from_sec
    ]

    metrics = _reliability_metrics(incidents, project.get("thresholds", {}), from_sec, now_sec)

    return success(200, {
        "project_id": project_id,
        "window_days": days,
        "incidents": incidents,
        "metrics": metrics,
    })


def handle_report_download(event: dict) -> dict:
    """Return a short-lived pre-signed S3 URL for a report's HTML or JSON file."""
    user_id = get_user_id(event)
    project_id = event["pathParameters"]["project_id"]
    report_id = event["pathParameters"]["report_id"]

    project = get_project_or_403(project_id, user_id)
    if not project:
        return error_response(403, "Forbidden")

    query_params = event.get("queryStringParameters") or {}
    fmt = (query_params.get("format") or "html").lower()
    if fmt not in ("html", "json"):
        return error_response(400, "format must be 'html' or 'json'")

    key = f"reports/{project_id}/{report_id}.{fmt}"
    content_type = "text/html" if fmt == "html" else "application/json"

    # Confirm the artifact exists so we 404 cleanly instead of handing back a URL
    # that resolves to a NoSuchKey error. If it's missing but the report row exists,
    # self-heal by asking the report generator to rebuild the files, then re-check.
    def _exists() -> bool:
        try:
            s3_client.head_object(Bucket=REPORTS_BUCKET_NAME, Key=key)
            return True
        except ClientError as e:
            # "403": without s3:ListBucket, S3 reports a missing key as
            # AccessDenied rather than 404 — treat it as absent either way.
            if e.response["Error"]["Code"] in ("403", "404", "NoSuchKey", "NotFound", "AccessDenied"):
                return False
            raise

    if not _exists():
        # Only ask for a rebuild when the report row actually exists — otherwise
        # a bogus report_id would trigger a pointless synchronous Lambda invoke.
        _, _, _, reports_table, _ = _get_tables()
        row = reports_table.get_item(
            Key={"project_id": project_id, "report_id": report_id}
        ).get("Item")
        if not row:
            return error_response(404, "Report not found")
        _rebuild_report_artifact(project_id, report_id)
        if not _exists():
            return error_response(404, "Report file not found")

    url = s3_client.generate_presigned_url(
        "get_object",
        Params={
            "Bucket": REPORTS_BUCKET_NAME,
            "Key": key,
            "ResponseContentType": content_type,
            "ResponseContentDisposition": f'attachment; filename="{report_id}.{fmt}"',
        },
        ExpiresIn=300,
    )
    return success(200, {"url": url, "expires_in": 300})


def lambda_handler(event: dict, context) -> dict:
    method = event["requestContext"]["http"]["method"]
    path = event["requestContext"]["http"]["path"]
    path_params = event.get("pathParameters") or {}

    try:
        if method == "GET" and path == "/health":
            return handle_get_health()

        if method == "GET" and path == "/me":
            return handle_get_me(event)

        if method == "GET" and path == "/projects":
            return handle_get_projects(event)

        # GET /projects/{project_id}/reports/{report_id}/download
        if method == "GET" and path_params.get("report_id"):
            return handle_report_download(event)

        if method == "GET" and path_params.get("project_id"):
            project_id = path_params["project_id"]

            if path == f"/projects/{project_id}":
                return handle_get_project(event)

            if path == f"/projects/{project_id}/status":
                return handle_get_projects_status(event)

            if path == f"/projects/{project_id}/reports":
                return handle_get_projects_reports(event)

            if path == f"/projects/{project_id}/incidents":
                return handle_get_projects_incidents(event)

        return error_response(404, "Not found")

    except ClientError as e:
        logger.error(f"AWS error on {method} {path}: {e}")
        return error_response(500, "Internal error")

    except Exception:
        logger.exception(f"Unhandled error on {method} {path}")
        return error_response(500, "Internal error")