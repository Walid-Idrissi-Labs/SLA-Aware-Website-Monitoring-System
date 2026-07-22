"""Alert email templates for the Monitor Lambda (DOWN / recovery).

Table-based with inline styles for email-client safety. The shell markup is
intentionally duplicated from report_generator/templates.py — each Lambda is
packaged as its own ZIP and cannot share modules.
"""

import html as html_lib
import os
from datetime import datetime, timezone

# Optional deep link used in the email CTA; the button is omitted when unset.
DASHBOARD_URL = os.environ.get("DASHBOARD_URL", "").strip().rstrip("/")

_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif"

_OK = "#067647"
_BAD = "#B42318"


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


def _status_eyebrow(color: str, label: str) -> str:
    return (
        f'<table role="presentation" cellpadding="0" cellspacing="0"><tr>'
        f'<td style="width:9px;height:9px;border-radius:50%;background-color:{color};font-size:0;line-height:0;">&nbsp;</td>'
        f'<td style="padding-left:8px;font-family:{_FONT};font-size:12px;font-weight:600;'
        f'letter-spacing:.06em;text-transform:uppercase;color:{color};">{label}</td>'
        f'</tr></table>'
    )


def build_down_email(project: dict, first_failure_ts_ms: int, last_http_status: int = 0) -> tuple:
    first_failure_dt = datetime.fromtimestamp(first_failure_ts_ms / 1000, tz=timezone.utc)
    first_failure_str = first_failure_dt.strftime("%Y-%m-%d %H:%M:%S UTC")

    name = html_lib.escape(str(project["name"]))
    url = html_lib.escape(str(project["url"]), quote=True)
    threshold = int(project.get("failure_threshold", 3))
    http_status = f"HTTP {int(last_http_status)}" if last_http_status else "No response (connection failed)"

    subject = f"[DOWN] {project['name']} is unreachable"

    facts = "".join([
        _email_fact_row("Monitor", name, first=True),
        _email_fact_row("URL", f'<a href="{url}" style="color:#FA5C29;text-decoration:none;">{url}</a>'),
        _email_fact_row("First failure", first_failure_str),
        _email_fact_row("Consecutive failed checks", str(threshold)),
        _email_fact_row("Last result", http_status),
    ])

    card = (
        _status_eyebrow(_BAD, "Down")
        + f'<h1 style="margin:12px 0 6px;font-family:{_FONT};font-size:20px;line-height:28px;'
        + f'font-weight:700;color:#101828;">{name} is down</h1>'
        + f'<p style="margin:0 0 20px;font-family:{_FONT};font-size:14px;line-height:21px;color:#475467;">'
        + f'The monitor failed {threshold} consecutive checks and is being treated as down. '
        + "You'll get another email as soon as it recovers.</p>"
        + f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">{facts}</table>'
        + (_email_button(DASHBOARD_URL, "Open dashboard") if DASHBOARD_URL else "")
    )

    preheader = f"{project['name']} failed {threshold} consecutive checks."
    footer = f"You're receiving this because you monitor {name} on SLA Monitor."
    return subject, _email_shell(preheader, card, footer)


def build_up_email(project: dict) -> tuple:
    recovered_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    name = html_lib.escape(str(project["name"]))
    url = html_lib.escape(str(project["url"]), quote=True)

    subject = f"[UP] {project['name']} has recovered"

    facts = "".join([
        _email_fact_row("Monitor", name, first=True),
        _email_fact_row("URL", f'<a href="{url}" style="color:#FA5C29;text-decoration:none;">{url}</a>'),
        _email_fact_row("Recovered at", recovered_str),
    ])

    card = (
        _status_eyebrow(_OK, "Recovered")
        + f'<h1 style="margin:12px 0 6px;font-family:{_FONT};font-size:20px;line-height:28px;'
        + f'font-weight:700;color:#101828;">{name} has recovered</h1>'
        + f'<p style="margin:0 0 20px;font-family:{_FONT};font-size:14px;line-height:21px;color:#475467;">'
        + 'Checks are passing again and the monitor is back to operational.</p>'
        + f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">{facts}</table>'
        + (_email_button(DASHBOARD_URL, "Open dashboard") if DASHBOARD_URL else "")
    )

    preheader = f"{project['name']} is passing checks again."
    footer = f"You're receiving this because you monitor {name} on SLA Monitor."
    return subject, _email_shell(preheader, card, footer)
