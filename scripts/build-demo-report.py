#!/usr/bin/env python3
"""Render the demo's sample SLA report with the real report template (board #11).

Every HTML download in the demo (/demo) opens this one file. It is built from a
fixed week of synthetic checks through the report generator's own build_report
and build_html_report, so it looks exactly like a real report. Rerun it after
changing the report template:

    .venv/bin/python scripts/build-demo-report.py

Writes frontend/public/demo/sample-report.html. Needs only the Lambda's Python
dependencies (boto3 is imported, never called).
"""
import math
import os
import random
import sys
from datetime import datetime, timezone

sys.dont_write_bytecode = True  # keep __pycache__ out of the Lambda source folder (it gets zipped)
for name in ("PROJECTS_TABLE_NAME", "CHECKS_TABLE_NAME", "INCIDENTS_TABLE_NAME", "REPORTS_TABLE_NAME", "REPORTS_BUCKET_NAME"):
    os.environ.setdefault(name, name.lower())
os.environ.setdefault("SES_SENDER_PARAM_PATH", "/demo/unused")
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
os.environ.setdefault("AWS_REGION", "us-east-1")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "sla-monitor-terraform", "lambda_src", "report_generator"))
import handler  # noqa: E402
from templates import build_html_report  # noqa: E402

WEEK_START = int(datetime(2026, 11, 16, tzinfo=timezone.utc).timestamp())
WEEK_END = WEEK_START + 7 * 86400
PROJECT = {
    "project_id": "checkout",
    "name": "Checkout (demo sample)",
    "url": "https://checkout.example.com",
    "failure_threshold": 3,
    "thresholds": {"min_uptime_pct": 99.9, "max_avg_latency_ms": 400},
    "accepted_status": "200-399",
}
# (start, minutes, http status, error_type): a 1h40m outage, a 2-check blip and two timeouts.
FAILURES = [
    (WEEK_START + 2 * 86400 + 10 * 3600 + 5 * 60, 100, 503, "http"),
    (WEEK_START + 4 * 86400 + 14 * 3600 + 31 * 60, 2, 502, "http"),
    (WEEK_START + 5 * 86400 + 3 * 3600 + 12 * 60, 2, 0, "timeout"),
]


def failure_at(t: int):
    return next(((http, error) for start, minutes, http, error in FAILURES if start <= t < start + minutes * 60), None)


def main() -> None:
    rnd = random.Random(47)
    checks = []
    for t in range(WEEK_START, WEEK_END, 60):
        failed = failure_at(t)
        rhythm = 22 * math.sin(2 * math.pi * ((t % 86400) / 86400 - 0.375))  # busiest mid-afternoon UTC
        latency = int(220 + 90 * rnd.random() + rhythm + (rnd.random() < 0.015) * (120 + 200 * rnd.random()))
        checks.append({
            "timestamp": t * 1000 + 21_000,
            "status": "failure" if failed else "success",
            "latency_ms": 10_000 if failed and failed[1] == "timeout" else latency,
            "error_type": failed[1] if failed else None,
        })
    start, minutes, _, cause = FAILURES[0]
    first_failure = start + 21
    recovery = start + minutes * 60 + 21
    incidents = [{
        "start_time": first_failure,
        "end_time": recovery,
        "duration_seconds": recovery - first_failure,
        "resolved": True,
        "cause": cause,
    }]

    report = handler.build_report(PROJECT, checks, incidents, "2026-W47", (WEEK_START, WEEK_END), expected_checks=7 * 1440)
    report.update(
        report_kind="Weekly Report",
        generated_at="2026-11-23T08:00:04+00:00",
        previous={"report_id": "2026-W46", "uptime_pct": 100.0, "avg_latency_ms": 271.0, "coverage_pct": 100.0, "total_downtime_sec": 0},
    )
    out = os.path.join(ROOT, "frontend", "public", "demo", "sample-report.html")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w") as f:
        f.write(build_html_report(report, PROJECT))
    print(f"wrote {out}: {report['uptime_pct']}% up, {report['slo_status']}, {report['incident_count']} incident(s)")


if __name__ == "__main__":
    main()
