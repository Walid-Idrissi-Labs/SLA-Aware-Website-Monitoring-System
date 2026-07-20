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


_SEVERITY_STYLES = {
    "healthy":  {"color": "#15803d", "soft": "#ecfdf5", "label": "SLA Met"},
    "degraded": {"color": "#b45309", "soft": "#fffbeb", "label": "Degraded Performance"},
    "major":    {"color": "#c2410c", "soft": "#fff7ed", "label": "Major SLA Violation"},
    "critical": {"color": "#b91c1c", "soft": "#fef2f2", "label": "Critical — Severe Downtime"},
}

_OK = "#15803d"
_BAD = "#b91c1c"


def _fmt_duration(seconds) -> str:
    seconds = int(seconds or 0)
    if seconds <= 0:
        return "0s"
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    parts = []
    if h:
        parts.append(f"{h}h")
    if m:
        parts.append(f"{m}m")
    if s and not h:
        parts.append(f"{s}s")
    return " ".join(parts) or "0s"


def _fmt_epoch(epoch_sec) -> str:
    try:
        return datetime.fromtimestamp(int(epoch_sec), tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    except (TypeError, ValueError, OSError):
        return "—"


def build_html_report(
    report: dict,
    project: dict,
    incidents: list[dict],
    window_start: datetime,
    window_end: datetime,
    report_kind: str,
) -> str:
    """A self-contained, print-friendly SLA report (no external assets)."""
    severity = report["severity"]
    sla_pass = report["sla_pass"]
    sev = _SEVERITY_STYLES.get(
        severity, {"color": "#475569", "soft": "#f1f5f9", "label": severity.title()}
    )

    thresholds = project.get("thresholds", {})
    min_uptime = thresholds.get("min_uptime_pct", 99.9)
    max_latency = thresholds.get("max_avg_latency_ms", 300)

    uptime = report["uptime_pct"]
    avg = report["avg_latency_ms"]
    p95 = report["p95_latency_ms"]
    incident_count = report["incident_count"]
    downtime = report["total_downtime_sec"]

    uptime_ok = float(uptime) >= float(min_uptime)
    latency_ok = float(avg) <= float(max_latency)

    period = f"{window_start.strftime('%b %d, %Y')} – {window_end.strftime('%b %d, %Y')}"
    project_name = project.get("name", "Untitled")
    project_url = project.get("url", "")

    verdict_color = _OK if sla_pass else _BAD
    verdict_soft = "#ecfdf5" if sla_pass else "#fef2f2"
    verdict_text = "SLA MET" if sla_pass else "SLA BREACHED"

    def pill(passed: bool) -> str:
        c, bg, txt = (_OK, "#ecfdf5", "PASS") if passed else (_BAD, "#fef2f2", "FAIL")
        return f'<span class="pill" style="color:{c};background:{bg};border-color:{c}33">{txt}</span>'

    def kpi(label, value, sub, accent="#0f172a") -> str:
        return (
            f'<div class="kpi"><div class="kpi-label">{label}</div>'
            f'<div class="kpi-value" style="color:{accent}">{value}</div>'
            f'<div class="kpi-sub">{sub}</div></div>'
        )

    kpis = "".join([
        kpi("Uptime", f"{uptime}%", f"target ≥ {min_uptime}%", _OK if uptime_ok else _BAD),
        kpi("Avg Response", f"{avg}<span class='u'>ms</span>", f"target ≤ {max_latency} ms", _OK if latency_ok else _BAD),
        kpi("P95 Response", f"{p95}<span class='u'>ms</span>", "95th percentile"),
        kpi("Incidents", f"{incident_count}", "this period", _OK if incident_count == 0 else _BAD),
        kpi("Total Downtime", _fmt_duration(downtime), "cumulative"),
    ])

    uptime_pos = min(float(uptime), 100)
    target_pos = min(float(min_uptime), 100)
    uptime_bar = (
        f'<div class="bar-track">'
        f'<div class="bar-fill" style="width:{uptime_pos}%;background:{_OK if uptime_ok else _BAD}"></div>'
        f'<div class="bar-target" style="left:{target_pos}%"></div></div>'
        f'<div class="bar-legend"><span>0%</span>'
        f'<span class="bar-target-label" style="left:{target_pos}%">SLA {min_uptime}%</span>'
        f'<span>100%</span></div>'
    )

    compliance = (
        f'<tr><td>Availability (Uptime)</td><td class="mono">≥ {min_uptime}%</td>'
        f'<td class="mono">{uptime}%</td><td>{pill(uptime_ok)}</td></tr>'
        f'<tr><td>Avg Response Time</td><td class="mono">≤ {max_latency} ms</td>'
        f'<td class="mono">{avg} ms</td><td>{pill(latency_ok)}</td></tr>'
    )

    if incidents:
        rows = []
        for idx, inc in enumerate(sorted(incidents, key=lambda x: int(x.get("start_time", 0))), start=1):
            resolved = inc.get("resolved") is True
            start = _fmt_epoch(inc.get("start_time"))
            end = _fmt_epoch(inc.get("end_time")) if inc.get("end_time") is not None else "—"
            dur = _fmt_duration(inc.get("duration_seconds")) if resolved else "ongoing"
            status = (
                f'<span class="pill" style="color:{_OK};background:#ecfdf5;border-color:{_OK}33">Resolved</span>'
                if resolved else
                f'<span class="pill" style="color:{_BAD};background:#fef2f2;border-color:{_BAD}33">Ongoing</span>'
            )
            rows.append(
                f'<tr><td class="mono">{idx}</td><td class="mono">{start}</td>'
                f'<td class="mono">{end}</td><td class="mono">{dur}</td><td>{status}</td></tr>'
            )
        incidents_section = (
            '<table class="data"><thead><tr><th>#</th><th>Started</th>'
            '<th>Recovered</th><th>Duration</th><th>Status</th></tr></thead>'
            f'<tbody>{"".join(rows)}</tbody></table>'
        )
    else:
        incidents_section = (
            '<div class="empty"><div class="empty-dot"></div><div>'
            '<strong>No incidents recorded.</strong><br>'
            '<span>The endpoint stayed within its failure threshold all period.</span>'
            '</div></div>'
        )

    url_line = f'<a class="url" href="{project_url}">{project_url}</a>' if project_url else ""

    css = """
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body { margin:0; background:#eef1f5; color:#0f172a;
             font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
             -webkit-font-smoothing:antialiased; }
      .mono { font-family:ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace;
              font-variant-numeric:tabular-nums; }
      .page { max-width:860px; margin:0 auto; padding:28px 18px 48px; }
      .card { background:#fff; border:1px solid #e4e8ee; border-radius:16px;
              box-shadow:0 1px 2px rgba(16,24,40,.04); overflow:hidden; }
      .head { padding:26px 28px; border-bottom:1px solid #eef1f5; }
      .brand { display:flex; align-items:center; gap:9px; font-weight:800; letter-spacing:.14em;
               font-size:12px; text-transform:uppercase; color:#64748b; }
      .brand .mark { width:22px; height:22px; border-radius:6px; background:#fa5c29;
                     display:inline-block; position:relative; }
      .brand .mark:after { content:''; position:absolute; inset:6px; border-radius:2px; background:#fff; }
      .head h1 { margin:14px 0 2px; font-size:22px; letter-spacing:-.01em; }
      .head .url { color:#fa5c29; text-decoration:none; font-size:13px; }
      .head .meta { margin-top:12px; display:flex; flex-wrap:wrap; gap:18px; font-size:12.5px; color:#64748b; }
      .head .meta b { color:#0f172a; font-weight:600; }
      .verdict { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:16px 28px; }
      .v-badge { font-size:15px; font-weight:800; letter-spacing:.04em; padding:8px 14px; border-radius:10px; }
      .sev { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.06em;
             padding:6px 12px; border-radius:999px; }
      .section { padding:22px 28px; }
      .section h2 { font-size:12px; text-transform:uppercase; letter-spacing:.1em; color:#64748b;
                    margin:0 0 14px; font-weight:700; }
      .kpis { display:grid; grid-template-columns:repeat(5,1fr); gap:10px; }
      .kpi { border:1px solid #eef1f5; border-radius:12px; padding:14px; background:#fbfcfd; }
      .kpi-label { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:#94a3b8; font-weight:600; }
      .kpi-value { font-size:23px; font-weight:800; margin-top:8px; letter-spacing:-.02em;
                   font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
                   font-variant-numeric:tabular-nums; }
      .kpi-value .u { font-size:13px; font-weight:600; color:#94a3b8; margin-left:2px; }
      .kpi-sub { font-size:11px; color:#94a3b8; margin-top:4px; }
      .bar-track { position:relative; height:12px; background:#eef1f5; border-radius:999px; }
      .bar-fill { height:100%; border-radius:999px; }
      .bar-target { position:absolute; top:-3px; width:2px; height:18px; background:#0f172a; opacity:.55; }
      .bar-legend { position:relative; margin-top:8px; height:14px; font-size:10.5px; color:#94a3b8; }
      .bar-legend > span:first-child { position:absolute; left:0; }
      .bar-legend > span:last-child { position:absolute; right:0; }
      .bar-target-label { position:absolute; transform:translateX(-50%); color:#0f172a; font-weight:600; }
      table.data { width:100%; border-collapse:collapse; font-size:13px; }
      table.data th { text-align:left; font-size:10.5px; text-transform:uppercase; letter-spacing:.06em;
                      color:#94a3b8; font-weight:700; padding:0 10px 10px; border-bottom:1px solid #eef1f5; }
      table.data td { padding:11px 10px; border-bottom:1px solid #f2f4f7; }
      table.data tr:last-child td { border-bottom:0; }
      .pill { display:inline-block; font-size:11px; font-weight:700; padding:3px 9px; border-radius:999px;
              border:1px solid; letter-spacing:.03em; }
      .empty { display:flex; align-items:center; gap:12px; padding:16px 18px; background:#ecfdf5;
               border:1px solid #15803d22; border-radius:12px; font-size:13px; color:#166534; }
      .empty span { color:#3f8f5f; }
      .empty-dot { width:10px; height:10px; border-radius:999px; background:#15803d; flex:none; }
      .foot { padding:18px 28px 4px; color:#94a3b8; font-size:11.5px;
              display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px; }
      @media (max-width:640px) {
        .kpis { grid-template-columns:repeat(2,1fr); }
        .verdict { flex-direction:column; align-items:flex-start; }
      }
    """

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SLA Report · {project_name} · {report['report_id']}</title>
<style>{css}</style>
</head>
<body>
  <div class="page">
    <div class="card">
      <div class="head">
        <div class="brand"><span class="mark"></span> SLA Monitor · {report_kind}</div>
        <h1>{project_name}</h1>
        {url_line}
        <div class="meta">
          <span>Report <b>{report['report_id']}</b></span>
          <span>Period <b>{period}</b></span>
          <span>Generated <b>{report['generated_at'][:10]}</b></span>
        </div>
      </div>

      <div class="verdict" style="background:{verdict_soft}">
        <div class="v-badge" style="color:{verdict_color};background:#fff;border:1px solid {verdict_color}33">{verdict_text}</div>
        <div class="sev" style="color:{sev['color']};background:{sev['soft']}">{sev['label']}</div>
      </div>

      <div class="section"><h2>Key Metrics</h2><div class="kpis">{kpis}</div></div>

      <div class="section" style="padding-top:0"><h2>Availability</h2>{uptime_bar}</div>

      <div class="section"><h2>SLA Compliance</h2>
        <table class="data"><thead><tr><th>Metric</th><th>Target</th><th>Actual</th><th>Result</th></tr></thead>
        <tbody>{compliance}</tbody></table>
      </div>

      <div class="section"><h2>Incident Log · {incident_count}</h2>{incidents_section}</div>

      <div class="foot">
        <span>Generated by SLA Monitor · {report['generated_at']}</span>
        <span>{project_name} · {report['report_id']}</span>
      </div>
    </div>
  </div>
</body>
</html>"""


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
    incidents = incidents_table.query(
        KeyConditionExpression="project_id = :pid AND start_time BETWEEN :from_sec AND :to_sec",
        ExpressionAttributeValues={":pid": project_id, ":from_sec": from_sec, ":to_sec": to_sec},
    ).get("Items", [])
    logger.info(f"  {project_id}: {len(checks)} checks, {len(incidents)} incidents ({report_kind})")

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


def _run_scheduled() -> dict:
    """Weekly path: every active project, the last completed Mon–Mon week."""
    projects = projects_table.scan(
        FilterExpression="active = :active",
        ExpressionAttributeValues={":active": True},
    ).get("Items", [])

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


# Invoked by EventBridge weekly (empty payload -> scheduled) OR asynchronously by the
# Project Manager Lambda for an on-demand report (payload: {"project_id", "days"}).
def lambda_handler(event: dict, context) -> dict:
    logger.info("Report Generator Lambda invoked")
    event = event or {}
    project_id = event.get("project_id")

    if project_id:
        return _run_on_demand(project_id, event)
    return _run_scheduled()