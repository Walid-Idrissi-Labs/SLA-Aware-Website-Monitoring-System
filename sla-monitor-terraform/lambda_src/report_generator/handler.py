import json
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






def compute_availability_metrics(checks: list[dict]) -> dict[str, float]:
    total = len(checks)
    if total == 0:
        return {"uptime_pct": 0.0}

    successful = sum(1 for c in checks if c["status"] == "success")
    uptime_pct = round((successful / total) * 100, 2)
    return {"uptime_pct": uptime_pct}


def compute_performance_metrics(checks: list[dict]) -> dict[str, float]:
    # DynamoDB returns numbers as Decimal; cast to float so the report is JSON-safe.
    latencies = [float(c["latency_ms"]) for c in checks if c["status"] == "success"]

    if not latencies:
        return {"avg_latency_ms": 0.0, "p95_latency_ms": 0.0}

    avg = round(sum(latencies) / len(latencies), 1)
    sorted_lat = sorted(latencies)
    p95_index = int(len(sorted_lat) * 0.95)
    p95 = float(sorted_lat[p95_index])
    return {"avg_latency_ms": avg, "p95_latency_ms": p95}


def compute_reliability_metrics(incidents: list[dict]) -> dict[str, Any]:
    incident_count = len(incidents)
    resolved = [i for i in incidents if i.get("resolved") is True]
    # duration_seconds comes back as Decimal; coerce to int (and guard None).
    total_downtime = int(sum(int(i.get("duration_seconds") or 0) for i in resolved))
    return {
        "incident_count": incident_count,
        "total_downtime_sec": total_downtime,
    }


def evaluate_sla(thresholds: dict, uptime_pct: float, avg_latency_ms: float) -> tuple[bool, str]:
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

    return sla_pass, severity




def build_report(
    project: dict,
    checks: list[dict],
    incidents: list[dict],
    report_id: str,
) -> dict:

    avail = compute_availability_metrics(checks)
    perf = compute_performance_metrics(checks)
    rel = compute_reliability_metrics(incidents)

    sla_pass, severity = evaluate_sla(
        project.get("thresholds", {}),
        avail["uptime_pct"],
        perf["avg_latency_ms"],
    )

    generated_at = datetime.now(timezone.utc).isoformat()

    report = {
        "project_id": project["project_id"],
        "report_id": report_id,
        "uptime_pct": avail["uptime_pct"],
        "avg_latency_ms": perf["avg_latency_ms"],
        "p95_latency_ms": perf["p95_latency_ms"],
        "incident_count": rel["incident_count"],
        "total_downtime_sec": rel["total_downtime_sec"],
        "severity": severity,
        "sla_pass": sla_pass,
        "generated_at": generated_at,
    }

    return report




def upload_report_files(
    report: dict,
    project: dict,
    incidents: list[dict],
    window_start: datetime,
    window_end: datetime,
    report_kind: str,
) -> None:
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
    html_body = build_html_report(report, project, incidents, window_start, window_end, report_kind)
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
            return incidents
        query_kwargs["ExclusiveStartKey"] = last_key






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

    report = build_report(project, checks, incidents, report_id)
    # report holds native floats/ints (JSON-safe for S3/email); convert floats ->
    # Decimal only for the DynamoDB write.
    reports_table.put_item(Item=floats_to_decimal(report))
    logger.info(f"  Stored report {report_id}: uptime={report['uptime_pct']}%, sla_pass={report['sla_pass']}")

    try:
        upload_report_files(report, project, incidents, window_start, window_end, report_kind)
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

    window = _window_from_report_id(report_id)
    if window:
        window_start, window_end, report_kind = window
    else:
        # Unknown id shape — still emit files, just without an exact period.
        window_start = window_end = datetime.now(timezone.utc)
        report_kind = "Report"

    from_sec = int(window_start.timestamp())
    to_sec = int(window_end.timestamp())
    incidents = query_incidents_paginated(project_id, from_sec, to_sec)

    report = decimals_to_native(row)
    upload_report_files(report, project, incidents, window_start, window_end, report_kind)
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