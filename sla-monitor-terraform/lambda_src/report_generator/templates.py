"""Presentation layer for the Report Generator: the S3 report document and the
weekly report email. Kept out of handler.py so pipeline logic stays readable.

The report is a self-contained, print-friendly HTML document (no external
assets). The email is table-based with inline styles for email-client safety.
"""

import html as html_lib
import os
from datetime import datetime, timezone

# Optional deep link used in the email CTA; the button is omitted when unset.
DASHBOARD_URL = os.environ.get("DASHBOARD_URL", "").strip().rstrip("/")

_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif"
_MONO = "ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace"

_OK = "#067647"
_OK_SOFT = "#ECFDF3"
_OK_BORDER = "#ABEFC6"
_BAD = "#B42318"
_BAD_SOFT = "#FEF3F2"
_BAD_BORDER = "#FECDCA"

_SEVERITY = {
    "healthy": {
        "label": "Healthy",
        "color": _OK, "soft": _OK_SOFT, "border": _OK_BORDER,
        "line": "All service-level objectives were met for this reporting period.",
    },
    "degraded": {
        "label": "Degraded",
        "color": "#B54708", "soft": "#FFFAEB", "border": "#FEDF89",
        "line": "At least one service-level objective was missed this period.",
    },
    "major": {
        "label": "Major violation",
        "color": "#B93815", "soft": "#FFF4ED", "border": "#F9DBAF",
        "line": "Availability fell well below target during this period.",
    },
    "critical": {
        "label": "Critical",
        "color": _BAD, "soft": _BAD_SOFT, "border": _BAD_BORDER,
        "line": "The endpoint experienced severe downtime during this period.",
    },
}

_LOGO_SVG = (
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">'
    '<rect width="24" height="24" rx="5" fill="#FA5C29"/>'
    '<g stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none">'
    '<path d="M12 16v5"/><path d="M16 14.639V21"/><path d="M20 10.656V21"/>'
    '<path d="m22 3-8.646 8.646a.5.5 0 0 1-.708 0L9.354 8.354a.5.5 0 0 0-.707 0L2 15"/>'
    '<path d="M4 18.463V21"/><path d="M8 14.656V21"/></g></svg>'
)


def fmt_duration(seconds) -> str:
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


def fmt_epoch(epoch_sec) -> str:
    try:
        return datetime.fromtimestamp(int(epoch_sec), tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    except (TypeError, ValueError, OSError):
        return "—"


# ─────────────────────────────────────────────────────────────────────────────
# S3 report document
# ─────────────────────────────────────────────────────────────────────────────

_REPORT_CSS = """
  :root { color-scheme: light; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #F2F4F7; color: #101828; font-size: 14px; line-height: 1.5;
         font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
         -webkit-font-smoothing: antialiased; }
  .mono { font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace; }
  .num { font-variant-numeric: tabular-nums; }
  .page { max-width: 830px; margin: 0 auto; padding: 40px 20px 64px; }
  .doc { background: #FFFFFF; border: 1px solid #E4E7EC; border-radius: 12px; overflow: hidden;
         box-shadow: 0 1px 3px rgba(16,24,40,.07), 0 1px 2px rgba(16,24,40,.04); }
  .brandbar { height: 4px; background: #FA5C29; }

  .masthead { display: flex; align-items: center; justify-content: space-between; gap: 16px;
              padding: 22px 40px; border-bottom: 1px solid #EAECF0; }
  .brand { display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 600;
           letter-spacing: -.01em; color: #101828; }
  .doctype { text-align: right; }
  .doctype .t { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: #98A2B3; }
  .doctype .k { margin-top: 2px; font-size: 13px; font-weight: 500; color: #475467; }

  .title { padding: 28px 40px 22px; }
  .title h1 { font-size: 26px; font-weight: 700; letter-spacing: -.02em; line-height: 1.25; }
  .title .url { display: inline-block; margin-top: 6px; font-size: 13px; color: #475467; text-decoration: none; }

  .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px 24px; padding: 18px 40px;
          background: #FCFCFD; border-top: 1px solid #EAECF0; border-bottom: 1px solid #EAECF0; }
  .meta .k { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: #98A2B3; }
  .meta .v { margin-top: 3px; font-size: 13.5px; font-weight: 500; color: #101828; }

  .verdict { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 22px 40px; }
  .verdict .vl { display: flex; align-items: center; gap: 14px; }
  .glyph { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center;
           justify-content: center; font-size: 17px; font-weight: 700; flex: none; }
  .verdict h2 { font-size: 18px; font-weight: 700; letter-spacing: -.01em; }
  .verdict p { margin-top: 1px; font-size: 13px; color: #667085; }
  .chip { font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 999px; border: 1px solid;
          white-space: nowrap; }

  .section { padding: 26px 40px; border-top: 1px solid #EAECF0; }
  .section > h3 { font-size: 13px; font-weight: 600; color: #101828; margin-bottom: 16px; }

  .kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 20px; }
  .kpi .k { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: #667085; }
  .kpi .v { margin-top: 6px; font-size: 24px; font-weight: 700; letter-spacing: -.02em; color: #101828;
            font-variant-numeric: tabular-nums; }
  .kpi .v .u { font-size: 13px; font-weight: 500; color: #98A2B3; margin-left: 1px; }
  .kpi .s { margin-top: 4px; font-size: 12px; color: #667085; }
  .kpi .s.pass { color: #067647; }
  .kpi .s.fail { color: #B42318; }

  .bar-track { position: relative; height: 10px; background: #EAECF0; border-radius: 999px; }
  .bar-fill { height: 100%; border-radius: 999px; }
  .bar-target { position: absolute; top: -4px; width: 2px; height: 18px; background: #101828; opacity: .6; }
  .bar-legend { position: relative; margin-top: 10px; height: 16px; font-size: 11px; color: #98A2B3; }
  .bar-legend > span:first-child { position: absolute; left: 0; }
  .bar-legend > span:last-child { position: absolute; right: 0; }
  .bar-target-label { position: absolute; transform: translateX(-50%); color: #101828; font-weight: 600; }

  table.data { width: 100%; border-collapse: collapse; font-size: 13px; }
  table.data th { text-align: left; padding: 0 12px 9px 0; font-size: 11px; font-weight: 600;
                  text-transform: uppercase; letter-spacing: .05em; color: #667085;
                  border-bottom: 1px solid #EAECF0; }
  table.data td { padding: 11px 12px 11px 0; border-bottom: 1px solid #F2F4F7; color: #344054; }
  table.data tr:last-child td { border-bottom: 0; }
  .pill { display: inline-block; font-size: 12px; font-weight: 600; padding: 2px 10px;
          border-radius: 999px; border: 1px solid; }

  .note { display: flex; gap: 10px; align-items: flex-start; padding: 14px 16px; border: 1px solid #EAECF0;
          background: #FCFCFD; border-radius: 10px; font-size: 13px; color: #475467; }
  .note .dot { width: 8px; height: 8px; margin-top: 6px; border-radius: 999px; background: #067647; flex: none; }

  .method { list-style: none; }
  .method li { position: relative; padding-left: 26px; font-size: 12.5px; color: #667085; line-height: 1.6; }
  .method li + li { margin-top: 9px; }
  .method li .n { position: absolute; left: 0; top: 2px; width: 17px; height: 17px; border: 1px solid #D0D5DD;
                  border-radius: 50%; font-size: 10px; font-weight: 600; color: #667085;
                  display: flex; align-items: center; justify-content: center; }

  .foot { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; padding: 18px 40px;
          border-top: 1px solid #EAECF0; background: #FCFCFD; font-size: 12px; color: #98A2B3; }

  @media (max-width: 640px) {
    .masthead, .title, .meta, .verdict, .section, .foot { padding-left: 22px; padding-right: 22px; }
    .meta { grid-template-columns: 1fr 1fr; }
    .kpis { grid-template-columns: 1fr 1fr; }
    .verdict { flex-direction: column; align-items: flex-start; }
  }
  @media print {
    body { background: #FFFFFF; }
    .page { max-width: none; padding: 0; }
    .doc { border: 0; border-radius: 0; box-shadow: none; }
    .verdict, .section { break-inside: avoid; }
  }
"""


def build_html_report(
    report: dict,
    project: dict,
    incidents: list,
    window_start: datetime,
    window_end: datetime,
    report_kind: str,
) -> str:
    """A self-contained, print-friendly SLA report (no external assets)."""
    severity = report["severity"]
    sla_pass = report["sla_pass"]
    sev = _SEVERITY.get(
        severity,
        {"label": severity.title(), "color": "#475467", "soft": "#F2F4F7", "border": "#D0D5DD", "line": ""},
    )

    thresholds = project.get("thresholds", {})
    min_uptime = thresholds.get("min_uptime_pct", 99.9)
    max_latency = thresholds.get("max_avg_latency_ms", 300)
    failure_threshold = int(project.get("failure_threshold", 3))

    uptime = report["uptime_pct"]
    avg = report["avg_latency_ms"]
    p95 = report["p95_latency_ms"]
    incident_count = report["incident_count"]
    downtime = report["total_downtime_sec"]

    uptime_ok = float(uptime) >= float(min_uptime)
    latency_ok = float(avg) <= float(max_latency)

    period = f"{window_start.strftime('%b %d, %Y')} – {window_end.strftime('%b %d, %Y')}"
    # User-controlled fields land in an HTML document served as text/html —
    # escape them or a project name becomes stored XSS.
    project_name = html_lib.escape(str(project.get("name", "Untitled")))
    project_url = html_lib.escape(str(project.get("url", "")), quote=True)

    verdict_text = "SLA met" if sla_pass else "SLA breached"
    verdict_color = _OK if sla_pass else _BAD
    verdict_soft = _OK_SOFT if sla_pass else _BAD_SOFT
    verdict_glyph = "✓" if sla_pass else "✕"
    verdict_line = (
        "All service-level objectives were met for this reporting period."
        if sla_pass
        else "One or more service-level objectives were not met this period."
    )

    def slo_sub(passed: bool, target: str) -> str:
        cls = "pass" if passed else "fail"
        mark = "✓" if passed else "✕"
        return f'<div class="s {cls}">{mark} Target {target}</div>'

    kpis = "".join([
        (
            '<div class="kpi"><div class="k">Uptime</div>'
            f'<div class="v">{uptime}<span class="u">%</span></div>'
            f'{slo_sub(uptime_ok, f"&ge; {min_uptime}%")}</div>'
        ),
        (
            '<div class="kpi"><div class="k">Avg response</div>'
            f'<div class="v">{avg}<span class="u">ms</span></div>'
            f'{slo_sub(latency_ok, f"&le; {max_latency} ms")}</div>'
        ),
        (
            '<div class="kpi"><div class="k">P95 response</div>'
            f'<div class="v">{p95}<span class="u">ms</span></div>'
            '<div class="s">95th percentile</div></div>'
        ),
        (
            '<div class="kpi"><div class="k">Incidents</div>'
            f'<div class="v">{incident_count}</div>'
            '<div class="s">This period</div></div>'
        ),
        (
            '<div class="kpi"><div class="k">Downtime</div>'
            f'<div class="v">{fmt_duration(downtime)}</div>'
            '<div class="s">Cumulative</div></div>'
        ),
    ])

    uptime_pos = min(float(uptime), 100)
    target_pos = min(float(min_uptime), 100)
    # The tick sits at the true target; its caption is clamped inward so it
    # never collides with the 0%/100% legend labels.
    label_pos = max(8.0, min(target_pos, 90.0))
    uptime_bar = (
        f'<div class="bar-track">'
        f'<div class="bar-fill" style="width:{uptime_pos}%;background:{_OK if uptime_ok else _BAD}"></div>'
        f'<div class="bar-target" style="left:{target_pos}%"></div></div>'
        f'<div class="bar-legend"><span>0%</span>'
        f'<span class="bar-target-label" style="left:{label_pos}%">Target {min_uptime}%</span>'
        f'<span>100%</span></div>'
    )

    def pill(passed: bool) -> str:
        c, bg, txt = (_OK, _OK_SOFT, "Pass") if passed else (_BAD, _BAD_SOFT, "Fail")
        return f'<span class="pill" style="color:{c};background:{bg};border-color:{c}33">{txt}</span>'

    compliance = (
        f'<tr><td>Availability (uptime)</td><td class="mono num">&ge; {min_uptime}%</td>'
        f'<td class="mono num">{uptime}%</td><td>{pill(uptime_ok)}</td></tr>'
        f'<tr><td>Average response time</td><td class="mono num">&le; {max_latency} ms</td>'
        f'<td class="mono num">{avg} ms</td><td>{pill(latency_ok)}</td></tr>'
    )

    if incidents:
        rows = []
        for idx, inc in enumerate(sorted(incidents, key=lambda x: int(x.get("start_time", 0))), start=1):
            resolved = inc.get("resolved") is True
            start = fmt_epoch(inc.get("start_time"))
            end = fmt_epoch(inc.get("end_time")) if inc.get("end_time") is not None else "—"
            dur = fmt_duration(inc.get("duration_seconds")) if resolved else "Ongoing"
            status = (
                f'<span class="pill" style="color:{_OK};background:{_OK_SOFT};border-color:{_OK}33">Resolved</span>'
                if resolved else
                f'<span class="pill" style="color:{_BAD};background:{_BAD_SOFT};border-color:{_BAD}33">Ongoing</span>'
            )
            rows.append(
                f'<tr><td class="mono num">{idx}</td><td class="mono num">{start}</td>'
                f'<td class="mono num">{end}</td><td class="mono num">{dur}</td><td>{status}</td></tr>'
            )
        incidents_section = (
            '<table class="data"><thead><tr><th>#</th><th>Started</th>'
            '<th>Resolved</th><th>Duration</th><th>Status</th></tr></thead>'
            f'<tbody>{"".join(rows)}</tbody></table>'
        )
    else:
        incidents_section = (
            '<div class="note"><div class="dot"></div><div>'
            '<strong>No incidents recorded.</strong> '
            'The endpoint stayed within its failure threshold for the entire reporting period.'
            '</div></div>'
        )

    url_line = f'<a class="url mono" href="{project_url}">{project_url}</a>' if project_url else ""

    methodology = (
        f'<li><span class="n">1</span>Checks are HTTP GET requests issued once per minute. '
        f'A check passes when the endpoint returns HTTP 200 within the request timeout.</li>'
        f'<li><span class="n">2</span>Uptime is the share of passing checks across all checks '
        f'in the reporting period.</li>'
        f'<li><span class="n">3</span>Response-time metrics are computed over passing checks only. '
        f'P95 is the 95th-percentile response time.</li>'
        f'<li><span class="n">4</span>An incident opens after {failure_threshold} consecutive failed checks '
        f'and closes on the first passing check that follows. Downtime is the sum of resolved '
        f'incident durations.</li>'
        f'<li><span class="n">5</span>All timestamps are UTC.</li>'
    )

    generated_full = report["generated_at"][:19].replace("T", " ") + " UTC"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SLA Report · {project_name} · {report['report_id']}</title>
<style>{_REPORT_CSS}</style>
</head>
<body>
  <div class="page">
    <div class="doc">
      <div class="brandbar"></div>

      <div class="masthead">
        <div class="brand">{_LOGO_SVG} SLA Monitor</div>
        <div class="doctype">
          <div class="t">Service level report</div>
          <div class="k">{report_kind}</div>
        </div>
      </div>

      <div class="title">
        <h1>{project_name}</h1>
        {url_line}
      </div>

      <div class="meta">
        <div class="m"><div class="k">Report</div><div class="v mono">{report['report_id']}</div></div>
        <div class="m"><div class="k">Reporting period</div><div class="v">{period}</div></div>
        <div class="m"><div class="k">Generated</div><div class="v">{report['generated_at'][:10]}</div></div>
      </div>

      <div class="verdict">
        <div class="vl">
          <div class="glyph" style="color:{verdict_color};background:{verdict_soft}">{verdict_glyph}</div>
          <div>
            <h2 style="color:{verdict_color}">{verdict_text}</h2>
            <p>{verdict_line}</p>
          </div>
        </div>
        <span class="chip" style="color:{sev['color']};background:{sev['soft']};border-color:{sev['border']}">
          {sev['label']}
        </span>
      </div>

      <div class="section"><h3>Key metrics</h3><div class="kpis">{kpis}</div></div>

      <div class="section"><h3>Availability</h3>{uptime_bar}</div>

      <div class="section"><h3>SLA compliance</h3>
        <table class="data"><thead><tr><th>Objective</th><th>Target</th><th>Measured</th><th>Result</th></tr></thead>
        <tbody>{compliance}</tbody></table>
      </div>

      <div class="section"><h3>Incident log</h3>{incidents_section}</div>

      <div class="section"><h3>Methodology</h3><ol class="method">{methodology}</ol></div>

      <div class="foot">
        <span>Generated by SLA Monitor · {generated_full}</span>
        <span>{project_name} · {report['report_id']}</span>
      </div>
    </div>
  </div>
</body>
</html>"""


# ─────────────────────────────────────────────────────────────────────────────
# Weekly report email (table-based, inline styles — email-client safe)
# ─────────────────────────────────────────────────────────────────────────────

def _email_fact_row(label: str, value_html: str, first: bool = False) -> str:
    border = "" if first else "border-top:1px solid #F2F4F7;"
    return (
        f'<tr><td style="padding:9px 0;{border}font-family:{_FONT};font-size:13px;color:#667085;">{label}</td>'
        f'<td align="right" style="padding:9px 0;{border}font-family:{_FONT};font-size:13px;color:#101828;'
        f'font-weight:500;">{value_html}</td></tr>'
    )


def _email_button(href: str, label: str) -> str:
    return (
        f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;"><tr>'
        f'<td style="background-color:#FA5C29;border-radius:8px;">'
        f'<a href="{href}" style="display:inline-block;padding:10px 20px;font-family:{_FONT};'
        f'font-size:13px;font-weight:600;color:#FFFFFF;text-decoration:none;">{label}</a>'
        f'</td></tr></table>'
    )


def _email_shell(preheader: str, card_html: str, footer_text: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#F2F4F7;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">{preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F2F4F7;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
        <tr><td style="padding:0 4px 14px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="width:20px;height:20px;background-color:#FA5C29;border-radius:6px;font-size:0;line-height:0;">&nbsp;</td>
            <td style="padding-left:9px;font-family:{_FONT};font-size:14px;font-weight:600;color:#344054;">SLA Monitor</td>
          </tr></table>
        </td></tr>
        <tr><td style="background-color:#FFFFFF;border:1px solid #E4E7EC;border-radius:12px;padding:28px 32px;">
          {card_html}
        </td></tr>
        <tr><td style="padding:16px 4px 0;font-family:{_FONT};font-size:12px;line-height:18px;color:#98A2B3;">
          {footer_text}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def build_report_email(
    project: dict,
    report: dict,
    week_start: datetime,
    week_end: datetime,
) -> tuple:
    severity = report["severity"]
    sev = _SEVERITY.get(severity, _SEVERITY["healthy"])

    severity_emoji_map = {"healthy": "🟢", "degraded": "🟡", "major": "🟠", "critical": "🔴"}
    emoji = severity_emoji_map.get(severity, "⚪")
    subject = f"[SLA Report] {project['name']} — {report['report_id']} — {emoji} {sev['label'].upper()}"

    safe_name = html_lib.escape(str(project["name"]))
    period = f"{week_start.strftime('%b %d')} – {week_end.strftime('%b %d, %Y')}"
    thresholds = project.get("thresholds", {})
    min_uptime = thresholds.get("min_uptime_pct", 99.9)
    max_latency = thresholds.get("max_avg_latency_ms", 300)

    sla_pass = report["sla_pass"]
    verdict = "SLA met" if sla_pass else "SLA breached"
    verdict_color = _OK if sla_pass else _BAD
    verdict_soft = _OK_SOFT if sla_pass else _BAD_SOFT

    muted = f'font-family:{_FONT};font-size:12px;color:#98A2B3;'

    facts = "".join([
        _email_fact_row("Reporting period", period, first=True),
        _email_fact_row("Uptime", f'{report["uptime_pct"]}% <span style="{muted}">(target &ge; {min_uptime}%)</span>'),
        _email_fact_row("Avg response", f'{report["avg_latency_ms"]} ms <span style="{muted}">(target &le; {max_latency} ms)</span>'),
        _email_fact_row("P95 response", f'{report["p95_latency_ms"]} ms'),
        _email_fact_row("Incidents", str(report["incident_count"])),
        _email_fact_row("Total downtime", fmt_duration(report["total_downtime_sec"])),
    ])

    card = (
        f'<div style="font-family:{_FONT};font-size:11px;font-weight:600;letter-spacing:.08em;'
        f'text-transform:uppercase;color:#98A2B3;">Weekly SLA report &middot; {report["report_id"]}</div>'
        f'<h1 style="margin:8px 0 2px;font-family:{_FONT};font-size:20px;line-height:28px;'
        f'font-weight:700;color:#101828;">{safe_name}</h1>'
        f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0 20px;"><tr>'
        f'<td style="background-color:{verdict_soft};border:1px solid {verdict_color}33;border-radius:999px;'
        f'padding:4px 12px;font-family:{_FONT};font-size:12px;font-weight:600;color:{verdict_color};">{verdict}</td>'
        f'<td style="width:8px;font-size:0;">&nbsp;</td>'
        f'<td style="background-color:{sev["soft"]};border:1px solid {sev["border"]};border-radius:999px;'
        f'padding:4px 12px;font-family:{_FONT};font-size:12px;font-weight:600;color:{sev["color"]};">{sev["label"]}</td>'
        f'</tr></table>'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">{facts}</table>'
        + (_email_button(DASHBOARD_URL, "View full report") if DASHBOARD_URL else "")
    )

    preheader = f"{project['name']}: {report['uptime_pct']}% uptime, {report['incident_count']} incident(s) — {verdict}."
    footer = f"You're receiving this because you monitor {safe_name} on SLA Monitor."
    return subject, _email_shell(preheader, card, footer)
