import json
import math
import os
import re
import logging
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Any

import boto3
from botocore.exceptions import ClientError

from templates import build_html_report, build_report_email




dynamodb = boto3.resource("dynamodb")
ssm = boto3.client("ssm")
ses = boto3.client("ses")
s3 = boto3.client("s3")

projects_table = dynamodb.Table(os.environ["PROJECTS_TABLE_NAME"])
checks_table = dynamodb.Table(os.environ["CHECKS_TABLE_NAME"])
incidents_table = dynamodb.Table(os.environ["INCIDENTS_TABLE_NAME"])
reports_table = dynamodb.Table(os.environ["REPORTS_TABLE_NAME"])

REPORTS_BUCKET_NAME = os.environ["REPORTS_BUCKET_NAME"]
SES_SENDER_PARAM_PATH = os.environ["SES_SENDER_PARAM_PATH"]

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def floats_to_decimal(obj):
    """Recursively convert floats to Decimal for DynamoDB compatibility."""
    if isinstance(obj, float):
        return Decimal(str(obj))  # str() avoids float precision noise
    if isinstance(obj, dict):
        return {k: floats_to_decimal(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [floats_to_decimal(i) for i in obj]
    return obj


def decimals_to_native(obj):
    """Inverse of floats_to_decimal: make a DynamoDB item JSON-safe (Decimal -> int/float)."""
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    if isinstance(obj, dict):
        return {k: decimals_to_native(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [decimals_to_native(i) for i in obj]
    return obj


def get_sender_email() -> str:
    response = ssm.get_parameter(Name=SES_SENDER_PARAM_PATH, WithDecryption=True)
    return response["Parameter"]["Value"]


def send_report_email(to_address: str, subject: str, html_body: str) -> None:
    sender = get_sender_email()
    ses.send_email(
        Source=sender,
        Destination={"ToAddresses": [to_address]},
        Message={
            "Subject": {"Data": subject, "Charset": "UTF-8"},
            "Body": {"Html": {"Data": html_body, "Charset": "UTF-8"}},
        },
    )






# The monitor rule runs at rate(1 minute). Coverage compares the checks that
# produced a verdict against the checks this schedule should have produced.
CHECK_INTERVAL_SECONDS = 60
# Below this share of conclusive evidence an SLO is reported as unproven rather
# than passed or failed: 100% availability over 3% of the expected checks is not
# a result.
SLO_MIN_COVERAGE_PCT = 95.0


def compute_availability_metrics(checks: list[dict], expected_checks: int | None = None) -> dict[str, Any]:
    """Availability over conclusive evidence only, plus how much evidence there was.

    An inconclusive check (bot challenge, probe-side error) is neither an up nor
    a down minute, so it leaves the numerator and the denominator alone and only
    costs coverage.
    """
    total = len(checks)
    up = sum(1 for c in checks if c.get("status") == "success")
    down = sum(1 for c in checks if c.get("status") == "failure")
    inconclusive = total - up - down
    conclusive = up + down

    # max() with conclusive keeps coverage at 100% if the interval assumption is
    # ever off; missing checks still count as missing.
    expected = max(int(expected_checks or total), conclusive, 1)

    return {
        "uptime_pct": round((up / conclusive) * 100, 2) if conclusive else 0.0,
        "coverage_pct": round((conclusive / expected) * 100, 2),
        "checks_total": total,
        "checks_up": up,
        "checks_down": down,
        "checks_inconclusive": inconclusive,
        "checks_expected": expected,
    }


def compute_performance_metrics(checks: list[dict]) -> dict[str, float | None]:
    # DynamoDB returns numbers as Decimal; cast to float so the report is JSON-safe.
    latencies = sorted(float(c["latency_ms"]) for c in checks if c["status"] == "success")

    if not latencies:
        # avg/p95 stay 0.0 for the stored verdict; the document shows "n/a" when nothing passed.
        return {"avg_latency_ms": 0.0, "p95_latency_ms": 0.0, "p50_latency_ms": None, "p99_latency_ms": None, "max_latency_ms": None}

    def nearest_rank(q: float) -> float:
        # The smallest value with at least q of the passes at or below it.
        return latencies[max(0, math.ceil(len(latencies) * q) - 1)]

    return {
        "avg_latency_ms": round(sum(latencies) / len(latencies), 1),
        "p95_latency_ms": nearest_rank(0.95),
        "p50_latency_ms": nearest_rank(0.50),
        "p99_latency_ms": nearest_rank(0.99),
        "max_latency_ms": latencies[-1],
    }


def checks_by_cause(checks: list[dict]) -> list[dict]:
    """Checks that did not pass, per recorded cause: failed (down) and inconclusive (no evidence)."""
    counts: dict[str, dict[str, int]] = {}
    for check in checks:
        if check.get("status") in ("failure", "inconclusive"):
            row = counts.setdefault(str(check.get("error_type") or "unknown"), {"failed": 0, "inconclusive": 0})
            row["failed" if check["status"] == "failure" else "inconclusive"] += 1
    return [{"cause": cause, **row} for cause, row in sorted(counts.items(), key=lambda kv: -sum(kv[1].values()))]


def _incident_end(incident: dict) -> int | None:
    if incident.get("end_time") is not None:
        return int(incident["end_time"])
    if incident.get("resolved"):
        return int(incident["start_time"]) + int(incident.get("duration_seconds") or 0)
    return None


def incident_rows(incidents: list[dict], from_sec: int, to_sec: int) -> list[dict]:
    """The window's incidents as the document lists them, oldest first, with their time inside it."""
    rows = []
    for incident in sorted(incidents, key=lambda i: int(i["start_time"])):
        rows.append({
            "start": int(incident["start_time"]),
            "end": _incident_end(incident),
            "in_window_sec": compute_reliability_metrics([incident], from_sec, to_sec)["total_downtime_sec"],
            "cause": str(incident["cause"]) if incident.get("cause") else None,
            "resolved": incident.get("resolved") is True,
            "closed_reason": str(incident["closed_reason"]) if incident.get("closed_reason") else None,
        })
    return rows


# A DynamoDB item tops out at 400 KB; a monitor flapping for 30 days can open thousands of incidents.
MAX_LISTED_INCIDENTS = 200


def _listed_incidents(rows: list[dict]) -> dict:
    """The incidents the document lists: all of them, or the open ones and the longest
    up to the cap, back in time order, with a count of the rest."""
    if len(rows) <= MAX_LISTED_INCIDENTS:
        return {"incidents": rows, "incidents_omitted": 0}
    kept = sorted(rows, key=lambda r: (r["resolved"], -r["in_window_sec"]))[:MAX_LISTED_INCIDENTS]
    return {"incidents": sorted(kept, key=lambda r: r["start"]), "incidents_omitted": len(rows) - len(kept)}


def daily_rows(checks: list[dict], incidents: list[dict], from_sec: int, to_sec: int) -> list[dict]:
    """One row per UTC day the window touches (the first and last may be partial)."""
    first_day = from_sec - from_sec % 86400
    last_day = first_day + (to_sec - 1 - first_day) // 86400 * 86400
    tallies: dict[int, dict[str, int]] = {}
    for check in checks:
        # The window query includes its closing instant; keep such a check in the last day shown.
        day = min(first_day + (int(check["timestamp"]) // 1000 - first_day) // 86400 * 86400, last_day)
        tally = tallies.setdefault(day, {"success": 0, "failure": 0, "inconclusive": 0})
        tally[check.get("status") if check.get("status") in tally else "inconclusive"] += 1
    rows = []
    for day in range(first_day, to_sec, 86400):
        start, end = max(day, from_sec), min(day + 86400, to_sec)
        tally = tallies.get(day, {"success": 0, "failure": 0, "inconclusive": 0})
        conclusive = tally["success"] + tally["failure"]
        rows.append({
            "start": start,
            "end": end,
            "checks_up": tally["success"],
            "checks_down": tally["failure"],
            "checks_inconclusive": tally["inconclusive"],
            "uptime_pct": round(tally["success"] / conclusive * 100, 2) if conclusive else None,
            "downtime_sec": compute_reliability_metrics(incidents, start, end)["total_downtime_sec"],
        })
    return rows


def compute_reliability_metrics(incidents: list[dict], from_sec: int, to_sec: int) -> dict[str, Any]:
    """Incident count and downtime inside [from_sec, to_sec]. An incident that began
    before the window, ran past its end, or is still open counts only its part inside."""
    downtime = 0
    for incident in incidents:
        # DynamoDB numbers arrive as Decimal; coerce to int.
        start = int(incident["start_time"])
        if incident.get("end_time") is not None:
            end = int(incident["end_time"])
        elif incident.get("resolved"):
            end = start + int(incident.get("duration_seconds") or 0)
        else:
            end = to_sec  # still open: down until the window closes
        downtime += max(0, min(end, to_sec) - max(start, from_sec))
    return {
        "incident_count": len(incidents),
        "total_downtime_sec": downtime,
    }


def evaluate_sla(
    thresholds: dict,
    uptime_pct: float,
    avg_latency_ms: float,
    coverage_pct: float = 100.0,
) -> tuple[bool, str, str]:
    """Return (sla_pass, severity, slo_status).

    sla_pass and severity stay as they were so existing payloads keep working.
    slo_status is the three-valued verdict: too little evidence is "unproven",
    never "missed".
    """
    min_uptime = thresholds.get("min_uptime_pct", 99.9)
    max_latency = thresholds.get("max_avg_latency_ms", 300)

    sla_pass = (uptime_pct >= min_uptime) and (avg_latency_ms <= max_latency)

    if sla_pass:
        severity = "healthy"
    elif uptime_pct >= 99.0:
        severity = "degraded"
    elif uptime_pct >= 95.0:
        severity = "major"
    else:
        severity = "critical"

    if coverage_pct < SLO_MIN_COVERAGE_PCT:
        slo_status = "unproven"
    elif sla_pass:
        slo_status = "met"
    else:
        slo_status = "missed"

    return sla_pass, severity, slo_status




def build_report(
    project: dict,
    checks: list[dict],
    incidents: list[dict],
    report_id: str,
    window: tuple[int, int],
    expected_checks: int | None = None,
) -> dict:

    avail = compute_availability_metrics(checks, expected_checks)
    perf = compute_performance_metrics(checks)
    rel = compute_reliability_metrics(incidents, *window)

    thresholds = project.get("thresholds", {})
    sla_pass, severity, slo_status = evaluate_sla(
        thresholds,
        avail["uptime_pct"],
        perf["avg_latency_ms"],
        avail["coverage_pct"],
    )

    generated_at = datetime.now(timezone.utc).isoformat()

    report = {
        "project_id": project["project_id"],
        "report_id": report_id,
        "uptime_pct": avail["uptime_pct"],
        "coverage_pct": avail["coverage_pct"],
        "checks_total": avail["checks_total"],
        "checks_up": avail["checks_up"],
        "checks_down": avail["checks_down"],
        "checks_inconclusive": avail["checks_inconclusive"],
        "checks_expected": avail["checks_expected"],
        "avg_latency_ms": perf["avg_latency_ms"],
        "p95_latency_ms": perf["p95_latency_ms"],
        "incident_count": rel["incident_count"],
        "total_downtime_sec": rel["total_downtime_sec"],
        "severity": severity,
        "sla_pass": sla_pass,
        "slo_status": slo_status,
        "generated_at": generated_at,
        # Everything else the document shows, kept with the row so that a rebuilt
        # file matches the one first issued, whatever the project has become since.
        "window_start": window[0],
        "window_end": window[1],
        "monitor": {"name": str(project.get("name", "")), "url": str(project.get("url", ""))},
        "target": decimals_to_native({
            "min_uptime_pct": thresholds.get("min_uptime_pct", 99.9),
            "max_avg_latency_ms": thresholds.get("max_avg_latency_ms", 300),
            "failure_threshold": project.get("failure_threshold", 3),
            "accepted_status": project.get("accepted_status") or "200-399",
        }),
        "p50_latency_ms": perf["p50_latency_ms"],
        "p99_latency_ms": perf["p99_latency_ms"],
        "max_latency_ms": perf["max_latency_ms"],
        "causes": checks_by_cause(checks),
        "daily": daily_rows(checks, incidents, *window),
        **_listed_incidents(incident_rows(incidents, *window)),
    }

    return report




def upload_report_files(report: dict, project: dict) -> None:
    project_id = project["project_id"]
    # report_id is unique per report (weekly ISO week, or on-demand), so it doubles
    # as the filename — any report is then downloadable by id.
    base_key = f"reports/{project_id}/{report['report_id']}"


    json_key = f"{base_key}.json"
    s3.put_object(
        Bucket=REPORTS_BUCKET_NAME,
        Key=json_key,
        Body=json.dumps(report),
        ContentType="application/json",
    )


    html_key = f"{base_key}.html"
    html_body = build_html_report(report, project)
    s3.put_object(
        Bucket=REPORTS_BUCKET_NAME,
        Key=html_key,
        Body=html_body,
        ContentType="text/html",
    )

    logger.info(f"Uploaded report files to s3://{REPORTS_BUCKET_NAME}/{base_key}.*")


def query_checks_paginated(project_id: str, from_ms: int, to_ms: int) -> list[dict]:

    all_checks = []
    last_key = None

    while True:
        kwargs = {
            "KeyConditionExpression": "project_id = :pid AND #ts BETWEEN :from_ts AND :now_ts",
            "ExpressionAttributeNames": {"#ts": "timestamp"},
            "ExpressionAttributeValues": {
                ":pid": project_id,
                ":from_ts": from_ms,
                ":now_ts": to_ms,
            },
        }
        if last_key:
            kwargs["ExclusiveStartKey"] = last_key

        response = checks_table.query(**kwargs)
        all_checks.extend(response.get("Items", []))

        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break

    return all_checks


def query_incidents_paginated(project_id: str, from_sec: int, to_sec: int) -> list[dict]:
    """Incidents that overlap [from_sec, to_sec]: those that began inside it, plus the
    last one that began before it if it was still open when the window started."""
    incidents = []
    query_kwargs = {
        "KeyConditionExpression": "project_id = :pid AND start_time BETWEEN :from_sec AND :to_sec",
        "ExpressionAttributeValues": {":pid": project_id, ":from_sec": from_sec, ":to_sec": to_sec},
    }
    while True:
        response = incidents_table.query(**query_kwargs)
        incidents.extend(response.get("Items", []))
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break
        query_kwargs["ExclusiveStartKey"] = last_key

    # Incidents never overlap, so only the latest earlier one can run into the window.
    earlier = incidents_table.query(
        KeyConditionExpression="project_id = :pid AND start_time < :from_ts",
        ExpressionAttributeValues={":pid": project_id, ":from_ts": from_sec},
        ScanIndexForward=False,
        Limit=1,
    ).get("Items", [])
    return [i for i in earlier if not i.get("resolved") or int(i.get("end_time") or 0) > from_sec] + incidents






def previous_week(project_id: str, week_start: datetime) -> dict | None:
    """Last week's headline figures, for the weekly report's comparison column."""
    year, week, _ = (week_start - timedelta(days=7)).isocalendar()
    try:
        row = reports_table.get_item(Key={"project_id": project_id, "report_id": f"{year}-W{week:02d}"}).get("Item")
    except ClientError as e:
        logger.warning(f"  Previous week's report unavailable for {project_id}: {e}")
        return None
    if not row:
        return None
    keys = ("report_id", "uptime_pct", "avg_latency_ms", "coverage_pct", "total_downtime_sec")
    return decimals_to_native({key: row[key] for key in keys if key in row})


def generate_for_project(
    project: dict,
    report_id: str,
    window_start: datetime,
    window_end: datetime,
    report_kind: str,
    send_email: bool,
) -> dict:
    """Compute, store, archive (and optionally email) one project's report for a window."""
    project_id = project["project_id"]
    from_ms = int(window_start.timestamp() * 1000)
    to_ms = int(window_end.timestamp() * 1000)
    from_sec, to_sec = from_ms // 1000, to_ms // 1000

    checks = query_checks_paginated(project_id, from_ms, to_ms)
    incidents = query_incidents_paginated(project_id, from_sec, to_sec)
    logger.info(f"  {project_id}: {len(checks)} checks, {len(incidents)} incidents ({report_kind})")

    if not checks and report_kind == "Weekly Report":
        # A project with no checks in the window (created after it, or paused the
        # whole week) has nothing to report — a "critical 0% uptime" email for a
        # week that never happened would just be wrong.
        logger.info(f"  {project_id}: no checks in window — skipping weekly report")
        return None

    report = build_report(
        project,
        checks,
        incidents,
        report_id,
        (from_sec, to_sec),
        expected_checks=int((window_end - window_start).total_seconds() // CHECK_INTERVAL_SECONDS),
    )
    report["report_kind"] = report_kind
    if report_kind == "Weekly Report":
        report["previous"] = previous_week(project_id, window_start)
    # report holds native floats/ints (JSON-safe for S3/email); convert floats ->
    # Decimal only for the DynamoDB write.
    reports_table.put_item(Item=floats_to_decimal(report))
    logger.info(f"  Stored report {report_id}: uptime={report['uptime_pct']}%, sla_pass={report['sla_pass']}")

    try:
        upload_report_files(report, project)
    except ClientError as e:
        logger.error(f"  S3 upload failed for project {project_id}: {e}")

    if send_email:
        subject, html_body = build_report_email(project, report, window_start, window_end)
        try:
            send_report_email(project["notification_email"], subject, html_body)
            logger.info(f"  Report email sent to {project['notification_email']}")
        except ClientError as e:
            logger.error(f"  Email failed for project {project_id}: {e}")

    return report


def load_active_projects() -> list[dict]:
    projects = []
    scan_kwargs = {
        "FilterExpression": "active = :active",
        "ExpressionAttributeValues": {":active": True},
    }
    while True:
        response = projects_table.scan(**scan_kwargs)
        projects.extend(response.get("Items", []))
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            return projects
        scan_kwargs["ExclusiveStartKey"] = last_key


def _run_scheduled() -> dict:
    """Weekly path: every active project, the last completed Mon–Mon week."""
    projects = load_active_projects()

    if not projects:
        logger.info("No active projects — exiting")
        return {"statusCode": 200, "body": json.dumps({"message": "No active projects"})}

    now_utc = datetime.now(timezone.utc)
    week_end = (now_utc - timedelta(days=now_utc.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    week_start = week_end - timedelta(days=7)
    iso_year, iso_week, _ = week_start.isocalendar()
    report_id = f"{iso_year}-W{iso_week:02d}"
    logger.info(
        f"Weekly window {week_start.isoformat()} .. {week_end.isoformat()} "
        f"({report_id}), {len(projects)} project(s)"
    )

    for project in projects:
        try:
            generate_for_project(project, report_id, week_start, week_end, "Weekly Report", send_email=True)
        except Exception:
            # One project's failure must not abort reports for the others.
            logger.exception(f"Failed weekly report for {project.get('project_id')} — skipping")
            continue

    logger.info("Report Generator (scheduled) completed successfully")
    return {"statusCode": 200, "body": json.dumps({"message": "OK"})}


def _run_on_demand(project_id: str, event: dict) -> dict:
    """On-demand path: one project, a trailing 1/7/30-day window, no email."""
    days = int(event.get("days", 7))
    if days not in (1, 7, 30):
        days = 7

    project = projects_table.get_item(Key={"project_id": project_id}).get("Item")
    if not project:
        logger.warning(f"On-demand report requested for unknown project {project_id}")
        return {"statusCode": 404, "body": json.dumps({"message": "Project not found"})}

    window_end = datetime.now(timezone.utc)
    window_start = window_end - timedelta(days=days)
    report_id = f"{days}d-{window_end.strftime('%Y-%m-%d')}"
    report_kind = f"On-Demand · {days}-Day"
    logger.info(
        f"On-demand {report_id} for {project_id}: "
        f"{window_start.isoformat()} .. {window_end.isoformat()}"
    )

    generate_for_project(project, report_id, window_start, window_end, report_kind, send_email=False)
    logger.info(f"On-demand report {report_id} completed for {project_id}")
    return {"statusCode": 200, "body": json.dumps({"message": "OK", "report_id": report_id})}


def _window_from_report_id(report_id: str):
    """Reconstruct (window_start, window_end, report_kind) from a report_id.

    Handles both id shapes the system produces:
      - on-demand: "<N>d-YYYY-MM-DD"  (e.g. "7d-2026-07-21")
      - weekly ISO: "YYYY-WNN"        (e.g. "2025-W18")
    Returns None if the id isn't recognised.
    """
    m = re.match(r"^(\d+)d-(\d{4}-\d{2}-\d{2})$", report_id)
    if m:
        days = int(m.group(1))
        window_end = datetime.strptime(m.group(2), "%Y-%m-%d").replace(tzinfo=timezone.utc)
        window_start = window_end - timedelta(days=days)
        return window_start, window_end, f"On-Demand · {days}-Day"

    m = re.match(r"^(\d{4})-W(\d{2})$", report_id)
    if m:
        iso_year, iso_week = int(m.group(1)), int(m.group(2))
        week_start = datetime.fromisocalendar(iso_year, iso_week, 1).replace(tzinfo=timezone.utc)
        week_end = week_start + timedelta(days=7)
        return week_start, week_end, "Weekly Report"

    return None


def _run_rebuild(project_id: str, report_id: str) -> dict:
    """Regenerate the S3 artifacts (HTML + JSON) for a report that already exists in
    the Reports table but whose files are missing (e.g. produced by older code).
    Rebuilds faithfully from the stored row — the KPIs are authoritative, not recomputed."""
    project = projects_table.get_item(Key={"project_id": project_id}).get("Item")
    if not project:
        logger.warning(f"Rebuild requested for unknown project {project_id}")
        return {"statusCode": 404, "body": json.dumps({"message": "Project not found"})}

    row = reports_table.get_item(
        Key={"project_id": project_id, "report_id": report_id}
    ).get("Item")
    if not row:
        logger.warning(f"Rebuild requested for unknown report {project_id}/{report_id}")
        return {"statusCode": 404, "body": json.dumps({"message": "Report not found"})}

    report = decimals_to_native(row)
    if "window_start" not in report:
        # A row from before the snapshot fields: rebuild its window from the id, and
        # list only the incidents that started inside it, the rule its totals used.
        window = _window_from_report_id(report_id)
        if window:
            window_start, window_end, report_kind = window
        else:
            # Unknown id shape — still emit files, just without an exact period.
            window_start = window_end = datetime.now(timezone.utc)
            report_kind = "Report"
        from_sec, to_sec = int(window_start.timestamp()), int(window_end.timestamp())
        started_inside = [i for i in query_incidents_paginated(project_id, from_sec, to_sec) if int(i["start_time"]) >= from_sec]
        report.update(window_start=from_sec, window_end=to_sec, report_kind=report_kind,
                      **_listed_incidents(incident_rows(started_inside, from_sec, to_sec)))

    upload_report_files(report, project)
    logger.info(f"Rebuilt artifacts for {project_id}/{report_id}")
    return {"statusCode": 200, "body": json.dumps({"message": "OK", "report_id": report_id})}


# Invocation modes (all through the same handler):
#   {}                                 -> weekly scheduled run (EventBridge)
#   {"project_id", "days"}             -> on-demand generation (Project Manager Lambda)
#   {"project_id", "report_id"}        -> rebuild missing S3 artifacts (API Lambda, download self-heal)
def lambda_handler(event: dict, context) -> dict:
    logger.info("Report Generator Lambda invoked")
    event = event or {}
    project_id = event.get("project_id")
    report_id = event.get("report_id")

    if project_id and report_id:
        return _run_rebuild(project_id, report_id)
    if project_id:
        return _run_on_demand(project_id, event)
    return _run_scheduled()