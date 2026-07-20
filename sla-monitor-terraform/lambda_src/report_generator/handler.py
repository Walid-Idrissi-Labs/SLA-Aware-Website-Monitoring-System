import json
import os
import time
import logging
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Any

import boto3
from botocore.exceptions import ClientError




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


def get_sender_email() -> str:
    response = ssm.get_parameter(Name=SES_SENDER_PARAM_PATH)
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
        return {"uptime_pct": 0.0, "error_rate_pct": 0.0}

    successful = sum(1 for c in checks if c["status"] == "success")
    uptime_pct = round((successful / total) * 100, 2)
    error_rate_pct = round(100 - uptime_pct, 2)
    return {"uptime_pct": uptime_pct, "error_rate_pct": error_rate_pct}


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
    week_start: datetime,
    week_end: datetime,
) -> dict:

    avail = compute_availability_metrics(checks)
    perf = compute_performance_metrics(checks)
    rel = compute_reliability_metrics(incidents)

    sla_pass, severity = evaluate_sla(
        project.get("thresholds", {}),
        avail["uptime_pct"],
        perf["avg_latency_ms"],
    )

    report_id = week_end.strftime("%Y-W%V")
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




def upload_report_files(report: dict, project_id: str, week_start: datetime) -> None:
    year = week_start.strftime("%Y")
    week_num = week_start.strftime("%V")
    base_key = f"reports/{project_id}/{year}/week-{week_num}"


    json_key = f"{base_key}.json"
    s3.put_object(
        Bucket=REPORTS_BUCKET_NAME,
        Key=json_key,
        Body=json.dumps(report),
        ContentType="application/json",
    )


    html_key = f"{base_key}.html"
    html_body = build_html_report(report, project_id, week_start)
    s3.put_object(
        Bucket=REPORTS_BUCKET_NAME,
        Key=html_key,
        Body=html_body,
        ContentType="text/html",
    )

    logger.info(f"Uploaded report files to s3://{REPORTS_BUCKET_NAME}/{base_key}.*")


def build_html_report(report: dict, project_id: str, week_start: datetime) -> str:
    severity = report["severity"]
    sla_pass = report["sla_pass"]

    # Color and label per severity
    severity_map = {
        "healthy": ("#16a34a", "🟢 SLA Met"),
        "degraded": ("#eab308", "🟡 Degraded Performance"),
        "major": ("#ea580c", "🟠 Major SLA Violation"),
        "critical": ("#dc2626", "🔴 Critical — Severe Downtime"),
    }
    banner_color, banner_label = severity_map.get(severity, ("#666", severity))

    sla_result_label = "PASS ✅" if sla_pass else "FAIL ❌"

    week_end = week_start + timedelta(days=7)
    week_start_str = week_start.strftime("%Y-%m-%d")
    week_end_str = week_end.strftime("%Y-%m-%d")

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>SLA Report — {report['report_id']}</title>
        <style>
            body {{ font-family: Arial, sans-serif; margin: 0; padding: 0; }}
            .banner {{ background-color: {banner_color}; color: white; padding: 20px; }}
            .banner h1 {{ margin: 0; font-size: 24px; }}
            .content {{ padding: 20px; }}
            table {{ border-collapse: collapse; width: 100%; max-width: 600px; }}
            th, td {{ text-align: left; padding: 10px; border-bottom: 1px solid #eee; }}
            th {{ color: #666; font-weight: normal; width: 40%; }}
            .pass {{ color: #16a34a; font-weight: bold; }}
            .fail {{ color: #dc2626; font-weight: bold; }}
            .footer {{ padding: 20px; color: #999; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="banner">
            <h1>{banner_label}</h1>
            <p>SLA Report — {report['report_id']}</p>
        </div>
        <div class="content">
            <table>
                <tr><th>Reporting Period</th><td>{week_start_str} to {week_end_str}</td></tr>
                <tr><th>Uptime</th><td>{report['uptime_pct']}%</td></tr>
                <tr><th>SLA Result</th><td class="{'pass' if sla_pass else 'fail'}">{sla_result_label}</td></tr>
                <tr><th>Avg Response Time</th><td>{report['avg_latency_ms']} ms</td></tr>
                <tr><th>P95 Response Time</th><td>{report['p95_latency_ms']} ms</td></tr>
                <tr><th>Incidents</th><td>{report['incident_count']}</td></tr>
                <tr><th>Total Downtime</th><td>{report['total_downtime_sec']} seconds</td></tr>
                <tr><th>Severity</th><td>{severity.upper()}</td></tr>
            </table>
        </div>
        <div class="footer">
            Generated at {report['generated_at']} by SLA Monitor
        </div>
    </body>
    </html>
    """
    return html


def build_report_email(
    project: dict,
    report: dict,
    week_start: datetime,
    week_end: datetime,
) -> tuple[str, str]:

    severity = report["severity"]

    severity_emoji_map = {
        "healthy": "🟢",
        "degraded": "🟡",
        "major": "🟠",
        "critical": "🔴",
    }
    emoji = severity_emoji_map.get(severity, "⚪")
    severity_label = severity.upper()

    subject = f"[SLA Report] {project['name']} — {report['report_id']} — {emoji} {severity_label}"

    week_start_str = week_start.strftime("%Y-%m-%d")
    week_end_str = week_end.strftime("%Y-%m-%d")
    thresholds = project.get("thresholds", {})
    min_uptime = thresholds.get("min_uptime_pct", 99.9)
    max_latency = thresholds.get("max_avg_latency_ms", 300)

    banner_color_map = {
        "healthy": "#16a34a",
        "degraded": "#eab308",
        "major": "#ea580c",
        "critical": "#dc2626",
    }
    banner_color = banner_color_map.get(severity, "#666")
    banner_label_map = {
        "healthy": "🟢 SLA Met",
        "degraded": "🟡 Degraded Performance",
        "major": "🟠 Major SLA Violation",
        "critical": "🔴 Critical — Severe Downtime",
    }
    banner_label = banner_label_map.get(severity, severity)

    sla_result = "PASS ✅" if report["sla_pass"] else "FAIL ❌"
    sla_result_color = "#16a34a" if report["sla_pass"] else "#dc2626"

    html = f"""
    <html><body style="font-family: Arial, sans-serif; margin: 0; padding: 0;">
    <div style="background-color: {banner_color}; color: white; padding: 20px;">
        <h1 style="margin: 0;">{banner_label}</h1>
        <p>{project['name']} — {report['report_id']}</p>
    </div>
    <div style="padding: 20px;">
        <table style="border-collapse: collapse; width: 100%; max-width: 500px;">
            <tr><th style="text-align: left; padding: 8px 0; color: #666;">Reporting Period</th>
                <td style="padding: 8px 0;">{week_start_str} to {week_end_str}</td></tr>
            <tr><th style="text-align: left; padding: 8px 0; color: #666;">Uptime</th>
                <td style="padding: 8px 0;">{report['uptime_pct']}%</td></tr>
            <tr><th style="text-align: left; padding: 8px 0; color: #666;">SLA Threshold</th>
                <td style="padding: 8px 0;">≥ {min_uptime}% / ≤ {max_latency}ms</td></tr>
            <tr><th style="text-align: left; padding: 8px 0; color: #666;">SLA Result</th>
                <td style="padding: 8px 0; font-weight: bold; color: {sla_result_color}">{sla_result}</td></tr>
            <tr><th style="text-align: left; padding: 8px 0; color: #666;">Avg Response Time</th>
                <td style="padding: 8px 0;">{report['avg_latency_ms']} ms</td></tr>
            <tr><th style="text-align: left; padding: 8px 0; color: #666;">P95 Response Time</th>
                <td style="padding: 8px 0;">{report['p95_latency_ms']} ms</td></tr>
            <tr><th style="text-align: left; padding: 8px 0; color: #666;">Incidents</th>
                <td style="padding: 8px 0;">{report['incident_count']}</td></tr>
            <tr><th style="text-align: left; padding: 8px 0; color: #666;">Total Downtime</th>
                <td style="padding: 8px 0;">{report['total_downtime_sec']} seconds</td></tr>
            <tr><th style="text-align: left; padding: 8px 0; color: #666;">Severity</th>
                <td style="padding: 8px 0;">{severity.upper()}</td></tr>
        </table>
    </div>
    <div style="padding: 20px; color: #999; font-size: 12px;">
        You are receiving this because you monitor this project on SLA Monitor.
    </div>
    </body></html>
    """
    return subject, html




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






#invoked by Eventbridge rule every Monday 08:00 UTC
def lambda_handler(event: dict, context) -> dict:
    logger.info("Report Generator Lambda invoked")


    response = projects_table.scan(
        FilterExpression="active = :active",
        ExpressionAttributeValues={":active": True},
    )
    projects = response.get("Items", [])

    if not projects:
        logger.info("No active projects — exiting")
        return {"statusCode": 200, "body": json.dumps({"message": "No active projects"})}

    logger.info(f"Processing {len(projects)} active project(s)")


    now_utc = datetime.now(timezone.utc)

    days_since_monday = now_utc.weekday()
    last_monday = now_utc - timedelta(days=days_since_monday)
    week_end = last_monday.replace(hour=0, minute=0, second=0, microsecond=0)  
    week_start = week_end - timedelta(days=7)

    from_ms = int(week_start.timestamp() * 1000)
    to_ms = int(week_end.timestamp() * 1000)

    from_sec = int(from_ms / 1000)
    to_sec = int(to_ms / 1000)

    logger.info(f"Reporting window: {week_start.isoformat()} to {week_end.isoformat()}")

    for project in projects:
        project_id = project["project_id"]
        logger.info(f"Generating report for project {project_id}")

        try:
            checks = query_checks_paginated(project_id, from_ms, to_ms)
            logger.info(f"  Fetched {len(checks)} checks")

            incidents_response = incidents_table.query(
                KeyConditionExpression="project_id = :pid AND start_time BETWEEN :from_sec AND :to_sec",
                ExpressionAttributeValues={
                    ":pid": project_id,
                    ":from_sec": from_sec,
                    ":to_sec": to_sec,
                },
            )
            incidents = incidents_response.get("Items", [])
            logger.info(f"  Fetched {len(incidents)} incidents")


            report = build_report(project, checks, incidents, week_start, week_end)
            logger.info(f"  Report: uptime={report['uptime_pct']}%, severity={report['severity']}, sla_pass={report['sla_pass']}")


            # report holds native floats/ints (JSON-safe for S3/email); convert
            # floats -> Decimal only for the DynamoDB write.
            reports_table.put_item(Item=floats_to_decimal(report))
            logger.info(f"  Stored report in DynamoDB")


            try:
                upload_report_files(report, project_id, week_start)
            except ClientError as e:
                logger.error(f"  S3 upload failed for project {project_id}: {e}")


            subject, html_body = build_report_email(project, report, week_start, week_end)
            try:
                send_report_email(project["notification_email"], subject, html_body)
                logger.info(f"  Report email sent to {project['notification_email']}")
            except ClientError as e:
                logger.error(f"  Email failed for project {project_id}: {e}")

        except Exception:
            # One project's failure must not abort reports for the others.
            logger.exception(f"Failed to generate report for project {project_id} — skipping")
            continue

    logger.info("Report Generator Lambda completed successfully")
    return {"statusCode": 200, "body": json.dumps({"message": "OK"})}