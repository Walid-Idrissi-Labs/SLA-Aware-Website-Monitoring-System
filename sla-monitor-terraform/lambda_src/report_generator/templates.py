"""Presentation layer for the Report Generator: the S3 report document and the
weekly report email. Kept out of handler.py so pipeline logic stays readable.

The report is a self-contained HTML document (Inter embedded, no external
assets), laid out for A4 so the browser's Save as PDF gives a paginated
document. It renders from the stored report row alone, so a rebuilt file
matches the one first issued. The email is table-based with inline styles for
email-client safety.
"""

import html as html_lib
import os
import re
from datetime import datetime, timezone

from assets import INTER_WOFF2_BASE64, LOGO_PNG_BASE64

# Optional deep link used in the email CTA; the button is omitted when unset.
DASHBOARD_URL = os.environ.get("DASHBOARD_URL", "").strip().rstrip("/")
# The probes run where this stack runs: one region.
PROBE_REGION = os.environ.get("AWS_REGION", "us-east-1")
TEMPLATE_VERSION = "2.0"

_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif"

_OK = "#067647"
_OK_SOFT = "#ECFDF3"
_BAD = "#B42318"
_BAD_SOFT = "#FEF3F2"
_NEUTRAL = "#344054"
_NEUTRAL_SOFT = "#F2F4F7"

_SEVERITY = {
    "healthy": {"label": "Healthy", "color": _OK, "soft": _OK_SOFT, "border": "#ABEFC6"},
    "degraded": {"label": "Degraded", "color": "#B54708", "soft": "#FFFAEB", "border": "#FEDF89"},
    "major": {"label": "Major violation", "color": "#B93815", "soft": "#FFF4ED", "border": "#F9DBAF"},
    "critical": {"label": "Critical", "color": _BAD, "soft": _BAD_SOFT, "border": "#FECDCA"},
}

# The three-valued verdict: too little evidence is "not proven", never a pass or a fail.
_VERDICT = {
    "met": {"title": "Objectives met", "word": "Met", "color": _OK, "soft": _OK_SOFT},
    "missed": {"title": "Objectives missed", "word": "Missed", "color": _BAD, "soft": _BAD_SOFT},
    "unproven": {"title": "Objectives not proven", "word": "Not proven", "color": _NEUTRAL, "soft": _NEUTRAL_SOFT},
}

_CAUSE = {
    "timeout": "Timeout (no answer within 10 s)",
    "dns": "DNS lookup failed",
    "conn": "Connection failed",
    "tls": "TLS handshake failed",
    "http": "Status not accepted",
    "blocked": "Bot challenge (no evidence)",
    "unknown": "Not recorded",
}

# The app icon, embedded; the email links the hosted copy instead (mail clients block data: images).
_LOGO_IMG = f'<img src="data:image/png;base64,{LOGO_PNG_BASE64}" width="20" height="20" alt="" style="border-radius:5px">'


def fmt_duration(seconds) -> str:
    """7m 12s under an hour, 1h 2m above it; zero units are left out (12m, 2h)."""
    seconds = int(seconds or 0)
    if seconds <= 0:
        return "0s"
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}h {m}m" if m else f"{h}h"
    if m:
        return f"{m}m {s}s" if s else f"{m}m"
    return f"{s}s"


def verdict_of(report: dict) -> str:
    """met | missed | unproven; rows written before slo_status existed fall back to sla_pass."""
    status = report.get("slo_status") or ("met" if report.get("sla_pass") else "missed")
    return status if status in _VERDICT else "missed"


def _esc(value) -> str:
    return html_lib.escape(str(value), quote=True)


def _pct(value) -> str:
    return "n/a" if value is None else f"{float(value):.2f}%"


def _ms(value) -> str:
    return "n/a" if value is None else f"{round(float(value)):,} ms"


def _utc(epoch_sec: int) -> str:
    return datetime.fromtimestamp(int(epoch_sec), tz=timezone.utc).strftime("%Y-%m-%d %H:%M")


def _day(epoch_sec: int) -> str:
    return datetime.fromtimestamp(int(epoch_sec), tz=timezone.utc).strftime("%a %d %b")


def _span(seconds: int) -> str:
    days, rem = divmod(int(seconds), 86400)
    if not rem:
        return f"{days} day" + ("s" if days != 1 else "")
    return fmt_duration(seconds)


def _delta(now, before, unit: str, places: int = 2) -> str:
    """Signed change against the previous period, or an empty string without one."""
    if now is None or before is None:
        return ""
    diff = round(float(now) - float(before), places)
    if diff == 0:
        return "no change"
    sign = "+" if diff > 0 else "−"  # a real minus sign
    return f"{sign}{abs(diff):,.{places}f}{unit}"


_REPORT_CSS = """
  @font-face { font-family: 'Inter'; font-style: normal; font-weight: 100 900; font-display: block;
               src: url(data:font/woff2;base64,__INTER__) format('woff2'); }
  :root { color-scheme: light; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { background: #FFFFFF; color: #101828; font: 400 13px/20px 'Inter', system-ui, -apple-system, 'Segoe UI',
         Roboto, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
  /* Only where figures line up: Inter's tabular setting also widens hyphens, so dates stay proportional. */
  td.r, .figures .n, .budget b, .scale { font-variant-numeric: tabular-nums; }
  .mono { font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace; }

  .toolbar { max-width: 794px; margin: 0 auto; padding: 20px 56px 0; display: flex; justify-content: flex-end; }
  .toolbar button { font: 600 12px/16px 'Inter', system-ui, sans-serif; color: #344054; background: #FFFFFF;
                    border: 1px solid #D0D5DD; border-radius: 6px; padding: 7px 12px; cursor: pointer; }
  .toolbar button:hover { background: #F9FAFB; }
  .doc { max-width: 794px; margin: 0 auto; padding: 20px 56px 56px; }

  .rule { height: 2px; background: #FA5C29; }
  .mast { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 14px 0 28px; }
  .brand { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; }
  .doctype { text-align: right; }
  .doctype .id { margin-top: 2px; font-size: 13px; font-weight: 600; }
  .k { font-size: 10.5px; line-height: 14px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase;
       color: #667085; }
  h1 { font-size: 24px; line-height: 32px; font-weight: 600; letter-spacing: -.01em; overflow-wrap: anywhere; }
  .url { margin-top: 4px; font-size: 12px; color: #475467; overflow-wrap: anywhere; }
  .period { margin-top: 2px; color: #475467; }

  .control { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px 20px; margin-top: 24px;
             padding: 16px 0; border-top: 1px solid #D0D5DD; border-bottom: 1px solid #D0D5DD; }
  .control .v { margin-top: 3px; font-size: 12.5px; line-height: 18px; }

  .summary { margin-top: 24px; padding: 16px 20px; border: 1px solid #EAECF0; border-left-width: 3px; }
  .summary .verdict { font-size: 15px; line-height: 22px; font-weight: 600; }
  .summary p { margin-top: 6px; color: #344054; }

  section { margin-top: 28px; }
  h2 { font-size: 14px; line-height: 20px; font-weight: 600; padding-bottom: 8px; margin-bottom: 12px;
       border-bottom: 1px solid #D0D5DD; }
  .lede { margin-bottom: 12px; color: #475467; }
  .empty { color: #475467; }

  table { width: 100%; border-collapse: collapse; font-size: 12.5px; line-height: 18px; }
  th { padding: 0 12px 8px 0; text-align: left; white-space: nowrap; border-bottom: 1px solid #D0D5DD; }
  td { padding: 8px 12px 8px 0; border-bottom: 1px solid #EAECF0; vertical-align: top; }
  th:last-child, td:last-child { padding-right: 0; }
  th.r, td.r { text-align: right; }
  .st { font-weight: 600; white-space: nowrap; }
  .sub { display: block; font-size: 11.5px; color: #667085; }
  .muted { color: #667085; }

  .budget .line { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 8px; }
  .budget .line b { font-weight: 600; }
  .budget .line span:last-child { white-space: nowrap; }
  .track { position: relative; height: 8px; background: #EAECF0; border-radius: 2px; }
  .fill { height: 100%; border-radius: 2px; }
  .tick { position: absolute; top: -4px; bottom: -4px; left: 50%; width: 1px; background: #101828; }
  .scale { display: flex; justify-content: space-between; margin-top: 6px; font-size: 10.5px; color: #667085; }

  .figures { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; }
  .figures .n { margin-top: 4px; font-size: 20px; line-height: 28px; font-weight: 600; }
  .figures .n small { margin-left: 2px; font-size: 12px; font-weight: 400; color: #667085; }

  ol.notes, ul.notes { padding-left: 18px; color: #344054; }
  .notes li + li { margin-top: 6px; }
  .notes li { break-inside: avoid; }
  h3 { margin: 16px 0 8px; font-size: 12.5px; font-weight: 600; }

  .closing { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px 16px; margin-top: 32px;
             padding-top: 12px; border-top: 1px solid #D0D5DD; font-size: 11.5px; line-height: 16px; color: #667085; }

  @media (max-width: 640px) {
    .toolbar, .doc { padding-left: 20px; padding-right: 20px; }
    .control { grid-template-columns: 1fr 1fr; }
    .figures { grid-template-columns: repeat(3, 1fr); }
  }
  @media print {
    .toolbar { display: none; }
    .doc { max-width: none; padding: 0; }
    .details { break-before: page; }
    h2 { break-after: avoid; }
    thead { display: table-header-group; }
    tr, .control, .summary, .budget, .figures { break-inside: avoid; }
    /* The methodology reads as one appendix: it moves whole rather than strand a line at a page foot. */
    .appendix { break-inside: avoid; }
  }
"""


def _page_css(report_id: str) -> str:
    # Margin boxes sit inside CSS strings, where HTML escaping is no protection, so
    # only the generated report id goes there, reduced to the characters it can hold.
    rid = re.sub(r"[^A-Za-z0-9-]", "", report_id)
    margin = "font: 400 8pt 'Inter', system-ui, sans-serif; color: #667085;"
    return (
        "@page { size: A4; margin: 18mm 16mm 20mm; "
        f'@top-right {{ content: "SLA Monitor \\00B7  {rid}"; {margin} }} '
        f'@bottom-left {{ content: "Generated automatically \\00B7  Confidential"; {margin} }} '
        f'@bottom-right {{ content: "Page " counter(page) " of " counter(pages); {margin} }} }}'
    )


def build_html_report(report: dict, project: dict) -> str:
    """The report document, from the stored row. `project` only fills in what rows
    written before the snapshot fields lack (name, URL, targets)."""
    thresholds = project.get("thresholds", {})
    target = report.get("target") or {
        "min_uptime_pct": thresholds.get("min_uptime_pct", 99.9),
        "max_avg_latency_ms": thresholds.get("max_avg_latency_ms", 300),
        "failure_threshold": project.get("failure_threshold", 3),
        "accepted_status": project.get("accepted_status") or "200-399",
    }
    # A row from before the snapshot fields carries no targets: today's could differ, so it
    # shows its stored verdict and figures but judges nothing against them.
    legacy = "target" not in report
    monitor = report.get("monitor") or {"name": project.get("name", "Untitled"), "url": project.get("url", "")}
    min_uptime = float(target["min_uptime_pct"])
    max_latency = float(target["max_avg_latency_ms"])
    n_fail = int(target["failure_threshold"])
    window_start, window_end = int(report["window_start"]), int(report["window_end"])
    report_id = str(report["report_id"])
    kind = str(report.get("report_kind") or "Report")
    weekly = kind == "Weekly Report"
    previous = report.get("previous") or {}

    # User-controlled fields land in an HTML document served as text/html: escape
    # them, or a project name becomes stored XSS.
    name = _esc(monitor.get("name") or "Untitled")
    url = _esc(monitor.get("url") or "")

    verdict = verdict_of(report)
    v = _VERDICT[verdict]
    up, down = report.get("checks_up"), report.get("checks_down")
    has_counts = up is not None and down is not None
    conclusive = (int(up) + int(down)) if has_counts else None
    no_evidence = conclusive == 0
    uptime = None if no_evidence else report["uptime_pct"]
    avg = None if (has_counts and int(up) == 0) else report["avg_latency_ms"]
    coverage = report.get("coverage_pct")
    proven = verdict != "unproven"

    dash = '<span class="muted">&mdash;</span>'

    def result(ok: bool | None) -> str:
        # None: no evidence for this objective (nothing passed), which is not a miss.
        if legacy or ok is None:
            return dash
        word, color = ("Not proven", _NEUTRAL) if not proven else (("Met", _OK) if ok else ("Missed", _BAD))
        return f'<span class="st" style="color:{color}">{word}</span>'

    uptime_ok = None if uptime is None else float(uptime) >= min_uptime
    latency_ok = None if avg is None else float(avg) <= max_latency
    vs_col = bool(weekly and previous)
    prev_head = f'<th class="r">vs {_esc(previous.get("report_id", "previous"))}</th>' if vs_col else ""

    def vs(now, key, unit, places=2):
        return f'<td class="r muted">{_delta(now, previous.get(key), unit, places)}</td>' if vs_col else ""

    objective_rows = [
        f'<tr><td>Availability</td><td class="r">{dash if legacy else f"&ge; {min_uptime:.2f}%"}</td><td class="r">{_pct(uptime)}</td>'
        f'{vs(uptime, "uptime_pct", " pts")}<td class="r">{result(uptime_ok)}</td></tr>',
        f'<tr><td>Average response time</td><td class="r">{dash if legacy else f"&le; {round(max_latency):,} ms"}</td><td class="r">{_ms(avg)}</td>'
        f'{vs(avg, "avg_latency_ms", " ms", 0)}<td class="r">{result(latency_ok)}</td></tr>',
    ]
    if coverage is not None:
        enough = float(coverage) >= 95.0
        objective_rows.append(
            f'<tr><td>Evidence coverage<span class="sub">needed before either objective can be judged</span></td>'
            f'<td class="r">&ge; 95.00%</td><td class="r">{_pct(coverage)}</td>{vs(coverage, "coverage_pct", " pts")}'
            f'<td class="r"><span class="st" style="color:{_OK if enough else _NEUTRAL}">'
            f'{"Sufficient" if enough else "Insufficient"}</span></td></tr>'
        )

    # ── Executive summary, in plain words ──
    incidents = report.get("incidents") or []
    downtime = int(report.get("total_downtime_sec") or 0)
    latency_phrase = (
        f"average response time {_ms(avg)} against {round(max_latency):,} ms" if avg is not None
        else "no check passed, so there is no response time to judge"
    )
    if no_evidence:
        first = "No check produced evidence in this period, so the objectives cannot be judged."
    elif legacy:
        first = f"Availability was {_pct(uptime)} and average response time {_ms(avg)}."
    elif verdict == "unproven":
        first = (
            f"Only {_pct(coverage)} of the expected checks produced evidence, below the 95% needed, so the "
            f"objectives cannot be judged. On the evidence there is, availability was {_pct(uptime)} and "
            f"average response time {_ms(avg)}."
        )
    else:
        missed = [label for label, ok in (("availability", uptime_ok), ("response-time", latency_ok)) if ok is False]
        severity = _SEVERITY.get(report.get("severity"), {}).get("label", "").lower()
        first = (
            f"Availability was {_pct(uptime)} against a {min_uptime:.2f}% target, and {latency_phrase}. "
            + (
                "Both objectives were met."
                if not missed
                else f"The {' and '.join(missed)} objective{'s were' if len(missed) > 1 else ' was'} missed"
                + (f" (severity: {severity})." if severity else ".")
            )
        )
    count = int(report.get("incident_count") or len(incidents))
    if incidents:
        longest = max(int(i.get("in_window_sec") or 0) for i in incidents)
        still_open = any(not i.get("resolved") for i in incidents)
        second = (
            f"{count} incident{'s' if count != 1 else ''} caused {fmt_duration(downtime)} of downtime in this period"
            + (f"; the longest lasted {fmt_duration(longest)}." if count > 1 else ".")
            + (" One was still open when the period ended." if still_open else "")
        )
    else:
        second = f"No incidents were recorded: no run of failures reached {n_fail} consecutive checks."
    third = ""
    if vs_col and uptime is not None and previous.get("uptime_pct") is not None:
        change = round(float(uptime) - float(previous["uptime_pct"]), 2)
        parts = ["availability was unchanged" if change == 0 else
                 f"availability {'rose' if change > 0 else 'fell'} by {abs(change):.2f} points"]
        before = previous.get("total_downtime_sec")
        if before is not None and int(before) != downtime:
            parts.append(f"downtime {'rose' if downtime > int(before) else 'fell'} from {fmt_duration(before)} to {fmt_duration(downtime)}")
        third = f" Compared with {_esc(previous['report_id'])}, {' and '.join(parts)}."

    # ── Error budget: check-based, so it agrees with the availability figure ──
    budget_html = ""
    if has_counts and conclusive and not legacy:
        allowed = (100 - min_uptime) / 100 * conclusive
        used = int(down)
        if allowed > 0:
            consumed = used / allowed * 100
            fill = min(consumed, 200) / 2
            color = _OK if consumed <= 100 else _BAD
            budget_html = (
                '<section class="budget"><h2>Error budget</h2>'
                f'<div class="line"><span>At a {min_uptime:.2f}% target, {100 - min_uptime:.2f}% of the '
                f'{conclusive:,} conclusive checks may fail: <b>{allowed:,.1f} checks</b>.</span>'
                f'<span><b>{used:,}</b> failed &middot; <b style="color:{color}">{consumed:,.0f}%</b> consumed</span></div>'
                f'<div class="track" role="img" aria-label="{consumed:.0f}% of the error budget consumed">'
                f'<div class="fill" style="width:{fill:.1f}%;background:{color}"></div><div class="tick"></div></div>'
                '<div class="scale"><span>0%</span><span>100% of budget</span><span>200%+</span></div></section>'
            )
        else:
            budget_html = (
                '<section class="budget"><h2>Error budget</h2>'
                f'<p>A 100% target allows no failed checks. <b>{used:,}</b> failed in this period.</p></section>'
            )

    # ── Detail pages ──
    details = []
    daily = report.get("daily")
    if daily:
        rows = []
        for day in daily:
            start, end = int(day["start"]), int(day["end"])
            partial = ""
            if start % 86400:
                partial = f'<span class="sub">from {_utc(start)[11:]}</span>'
            elif end - start < 86400:
                partial = f'<span class="sub">until {_utc(end)[11:]}</span>'
            total = int(day["checks_up"]) + int(day["checks_down"]) + int(day["checks_inconclusive"])
            dt = int(day.get("downtime_sec") or 0)
            rows.append(
                f'<tr><td>{_day(start)}{partial}</td><td class="r">{total:,}</td><td class="r">{int(day["checks_down"]):,}</td>'
                f'<td class="r">{int(day["checks_inconclusive"]):,}</td><td class="r">{_pct(day.get("uptime_pct"))}</td>'
                f'<td class="r">{fmt_duration(dt) if dt else "&mdash;"}</td></tr>'
            )
        details.append(
            '<section><h2>Daily availability</h2>'
            '<table><thead><tr><th>Day (UTC)</th><th class="r">Checks</th><th class="r">Failed</th>'
            '<th class="r">Inconclusive</th><th class="r">Availability</th><th class="r">Downtime</th></tr></thead>'
            f'<tbody>{"".join(rows)}</tbody></table></section>'
        )

    if "p50_latency_ms" in report:
        if avg is None:
            body = '<p class="empty">No check passed in this period, so there is no response time to report.</p>'
        else:
            figs = [("Median (p50)", report.get("p50_latency_ms")), ("p95", report.get("p95_latency_ms")),
                    ("p99", report.get("p99_latency_ms")), ("Maximum", report.get("max_latency_ms")), ("Average", avg)]
            cells = "".join(
                f'<div><div class="k">{label}</div><div class="n">{"n/a" if val is None else f"{round(float(val)):,}"}'
                f'{"" if val is None else "<small>ms</small>"}</div></div>'
                for label, val in figs
            )
            body = (
                f'<p class="lede">Over the {int(up):,} checks that passed; failed checks and timeouts are excluded.</p>'
                f'<div class="figures">{cells}</div>'
            )
        details.append(f'<section><h2>Response time</h2>{body}</section>')

    causes = report.get("causes")
    if causes is not None:
        if causes:
            rows = "".join(
                f'<tr><td>{_esc(_CAUSE.get(c["cause"], c["cause"]))}</td><td class="r">{int(c["failed"]):,}</td>'
                f'<td class="r">{int(c["inconclusive"]):,}</td></tr>'
                for c in causes
            )
            body = (
                '<table><thead><tr><th>Cause</th><th class="r">Failed</th><th class="r">Inconclusive</th></tr></thead>'
                f'<tbody>{rows}</tbody></table>'
            )
        else:
            body = '<p class="empty">Every check that produced a verdict passed.</p>'
        details.append(f'<section><h2>Checks that did not pass, by cause</h2>{body}</section>')

    if incidents:
        rows = []
        for idx, inc in enumerate(incidents, start=1):
            start, end = int(inc["start"]), inc.get("end")
            began = '<span class="sub">began before this period</span>' if start < window_start else ""
            after = '<span class="sub">continues after this period</span>' if end is None or int(end) > window_end else ""
            if not inc.get("resolved"):
                status = f'<span class="st" style="color:{_BAD}">Ongoing</span>'
            elif inc.get("closed_reason") == "monitoring_stopped":
                status = f'<span class="st" style="color:{_NEUTRAL}">Closed</span><span class="sub">monitoring stopped</span>'
            else:
                status = f'<span class="st" style="color:{_OK}">Resolved</span>'
            cause = _esc(_CAUSE.get(inc.get("cause") or "unknown", inc.get("cause")))
            rows.append(
                f'<tr><td class="r">{idx}</td><td>{_utc(start)}{began}</td>'
                f'<td>{_utc(int(end)) if end is not None else "&mdash;"}{after}</td>'
                f'<td class="r">{fmt_duration(inc.get("in_window_sec"))}</td><td>{cause}</td><td>{status}</td></tr>'
            )
        body = (
            '<table><thead><tr><th class="r">#</th><th>Started (UTC)</th><th>Ended (UTC)</th>'
            '<th class="r">In this period</th><th>Cause</th><th>Status</th></tr></thead>'
            f'<tbody>{"".join(rows)}</tbody></table>'
        )
        omitted = int(report.get("incidents_omitted") or 0)
        if omitted:
            body += (
                f'<p class="lede" style="margin-top:8px">{omitted:,} more incidents are not listed; '
                'the open ones and the longest are. All of them count in the totals.</p>'
            )
    else:
        body = (
            f'<p class="empty">No incidents recorded. Failures shorter than {n_fail} consecutive checks lower '
            'availability but do not open an incident.</p>'
        )
    details.append(f'<section><h2>Incidents</h2>{body}</section>')

    if has_counts and report.get("checks_expected") is not None:
        expected = int(report["checks_expected"])
        received = int(report.get("checks_total") or 0)
        inconclusive = int(report.get("checks_inconclusive") or 0)
        cells = [expected, received, int(up), int(down), inconclusive, max(expected - received, 0)]
        details.append(
            '<section><h2>Evidence and coverage</h2>'
            '<table><thead><tr><th class="r">Expected</th><th class="r">Received</th><th class="r">Passed</th>'
            '<th class="r">Failed</th><th class="r">Inconclusive</th><th class="r">Missing</th><th class="r">Coverage</th>'
            '</tr></thead><tbody><tr>'
            + "".join(f'<td class="r">{n:,}</td>' for n in cells)
            + f'<td class="r">{_pct(coverage)}</td></tr></tbody></table></section>'
        )

    accepted = _esc(str(target.get("accepted_status") or "200-399").replace("-", "–"))
    methodology = "".join(f"<li>{line}</li>" for line in [
        f"Each check is an HTTP GET from one location (AWS {_esc(PROBE_REGION)}), once a minute. It passes when the "
        f"endpoint answers with an accepted status ({accepted}) within 10 seconds, and fails on any other status, a "
        "timeout, or a DNS, connection or TLS error. It is inconclusive when the probe met a bot challenge: it counts "
        "neither way.",
        "Availability is passed checks divided by passed plus failed checks. Inconclusive and missing checks are left out.",
        "Coverage is conclusive checks divided by expected checks (one a minute). Below 95%, the objectives are "
        "reported as not proven rather than met or missed.",
        "Response time is measured over passing checks only; percentiles use the nearest-rank method.",
        f"An incident opens after {n_fail} consecutive failed checks and closes at the first passing check. Downtime is "
        "the time inside the period covered by incidents, including one still open at its end.",
        f"Availability is check-based and downtime incident-based, so they differ: failures shorter than {n_fail} "
        "consecutive checks lower availability but never become incidents.",
        "All times are UTC. The period includes its start and excludes its end.",
    ])
    limitations = "".join(f"<li>{line}</li>" for line in [
        "One probe location: an outage seen only from elsewhere is missed, and a network fault near the probe can "
        "look like an outage.",
        "Checks that never ran, while the monitor was paused or the probe was down, count as missing evidence: they "
        "lower coverage, not availability.",
        "Maintenance windows are not modelled: planned downtime counts like any other.",
        "One figure covers the whole monitor: it describes this URL, not other endpoints or regions of the service.",
        "An incident is counted in every period it overlaps, so one that spans two reports appears in both, with its "
        "downtime split between them.",
        "Response time leaves out failed and timed-out checks, so it describes the service only when it answered.",
    ])
    details.append(
        '<section class="appendix"><h2>Methodology and limitations</h2>'
        f'<ol class="notes">{methodology}</ol><h3>Limitations</h3><ul class="notes">{limitations}</ul></section>'
    )

    generated = _esc(str(report["generated_at"])[:16].replace("T", " "))
    on_demand = re.fullmatch(r"On-Demand · (\d+)-Day", kind)
    report_type = "Weekly" if weekly else (
        f"On demand, {on_demand[1]} day{'s' if on_demand[1] != '1' else ''}" if on_demand else kind
    )
    url_line = f'<div class="url mono">{url}</div>' if url else ""
    control = "".join(
        f'<div><div class="k">{k}</div><div class="v">{val}</div></div>'
        for k, val in [
            ("Report ID", _esc(report_id)),
            ("Report type", _esc(report_type)),
            ("Period length", _span(window_end - window_start)),
            ("Generated", f"{generated} UTC"),
            ("Data source", f"HTTP GET every 60 s, AWS {_esc(PROBE_REGION)}"),
            ("Accepted statuses", accepted),
            ("Incident rule", f"{n_fail} consecutive failed checks"),
            ("Classification", "Confidential"),
        ]
    )

    css = _REPORT_CSS.replace("__INTER__", INTER_WOFF2_BASE64)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Service level report &middot; {name} &middot; {_esc(report_id)}</title>
<style>{css}
{_page_css(report_id)}</style>
</head>
<body>
  <div class="toolbar"><button type="button" onclick="window.print()">Save as PDF</button></div>
  <main class="doc">
    <div class="rule"></div>
    <header class="mast">
      <div class="brand">{_LOGO_IMG} SLA Monitor</div>
      <div class="doctype"><div class="k">Service level report</div><div class="id">{_esc(report_id)}</div></div>
    </header>
    <h1>{name}</h1>
    {url_line}
    <div class="period">{_utc(window_start)} &ndash; {_utc(window_end)} UTC ({_span(window_end - window_start)})</div>

    <div class="control">{control}</div>

    <div class="summary" style="border-left-color:{v['color']}">
      <div class="verdict" style="color:{v['color']}">{v['title']}</div>
      <p>{first} {second}{third}</p>
    </div>

    <section><h2>Objectives</h2>
      <table><thead><tr><th>Objective</th><th class="r">Target</th><th class="r">Measured</th>{prev_head}<th class="r">Result</th></tr></thead>
      <tbody>{"".join(objective_rows)}</tbody></table>
    </section>
    {budget_html}

    <div class="details">{"".join(details)}</div>

    <footer class="closing">
      <span>Generated automatically from monitoring data. No figures were adjusted by hand.</span>
      <span>SLA Monitor &middot; template {TEMPLATE_VERSION} &middot; {generated} UTC</span>
    </footer>
  </main>
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


def _email_logo() -> str:
    """The hosted app icon when the dashboard URL is known, else a plain brand square."""
    if DASHBOARD_URL:
        return (f'<td style="width:20px;height:20px;"><img src="{_esc(DASHBOARD_URL)}/logo.png" width="20" height="20" '
                'alt="" style="display:block;border-radius:5px;"></td>')
    return '<td style="width:20px;height:20px;background-color:#FA5C29;border-radius:6px;font-size:0;line-height:0;">&nbsp;</td>'


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
            {_email_logo()}
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
    verdict = verdict_of(report)
    v = _VERDICT[verdict]

    # The colour mark carries the severity only when an objective was actually missed.
    mark = {"met": "🟢", "unproven": "⚪"}.get(verdict) or {"degraded": "🟡", "major": "🟠"}.get(severity, "🔴")
    subject = f"[SLA Report] {project['name']} — {report['report_id']} — {mark} {v['title'].upper()}"

    safe_name = html_lib.escape(str(project["name"]))
    period = f"{week_start.strftime('%b %d')} – {week_end.strftime('%b %d, %Y')}"
    thresholds = project.get("thresholds", {})
    min_uptime = float(thresholds.get("min_uptime_pct", 99.9))
    max_latency = float(thresholds.get("max_avg_latency_ms", 300))

    muted = f'font-family:{_FONT};font-size:12px;color:#98A2B3;'
    # Same rule as the document: no evidence reads n/a, never 0.00% or 0 ms.
    up, down = report.get("checks_up"), report.get("checks_down")
    counted = up is not None and down is not None
    uptime = None if counted and int(up) + int(down) == 0 else report["uptime_pct"]
    passed = not (counted and int(up) == 0)

    facts = "".join([
        _email_fact_row("Reporting period", period, first=True),
        _email_fact_row("Availability", f'{_pct(uptime)} <span style="{muted}">(target &ge; {min_uptime:.2f}%)</span>'),
        _email_fact_row("Avg response", f'{_ms(report["avg_latency_ms"] if passed else None)} <span style="{muted}">(target &le; {round(max_latency):,} ms)</span>'),
        _email_fact_row("P95 response", _ms(report["p95_latency_ms"] if passed else None)),
        *([_email_fact_row("Evidence coverage", f'{_pct(report["coverage_pct"])} <span style="{muted}">(needs &ge; 95.00%)</span>')]
          if report.get("coverage_pct") is not None else []),
        _email_fact_row("Incidents", str(report["incident_count"])),
        _email_fact_row("Total downtime", fmt_duration(report["total_downtime_sec"])),
    ])

    severity_pill = (
        f'<td style="width:8px;font-size:0;">&nbsp;</td>'
        f'<td style="background-color:{sev["soft"]};border:1px solid {sev["border"]};border-radius:999px;'
        f'padding:4px 12px;font-family:{_FONT};font-size:12px;font-weight:600;color:{sev["color"]};">{sev["label"]}</td>'
        if verdict == "missed" else ""
    )
    card = (
        f'<div style="font-family:{_FONT};font-size:11px;font-weight:600;letter-spacing:.08em;'
        f'text-transform:uppercase;color:#98A2B3;">Weekly SLA report &middot; {_esc(report["report_id"])}</div>'
        f'<h1 style="margin:8px 0 2px;font-family:{_FONT};font-size:20px;line-height:28px;'
        f'font-weight:700;color:#101828;">{safe_name}</h1>'
        f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0 20px;"><tr>'
        f'<td style="background-color:{v["soft"]};border:1px solid {v["color"]}33;border-radius:999px;'
        f'padding:4px 12px;font-family:{_FONT};font-size:12px;font-weight:600;color:{v["color"]};">{v["title"]}</td>'
        f'{severity_pill}</tr></table>'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">{facts}</table>'
        + (_email_button(DASHBOARD_URL, "View full report") if DASHBOARD_URL else "")
    )

    preheader = f"{safe_name}: {_pct(uptime)} availability, {report['incident_count']} incident(s) — {v['title']}."
    footer = f"You're receiving this because you monitor {safe_name} on SLA Monitor."
    return subject, _email_shell(preheader, card, footer)
