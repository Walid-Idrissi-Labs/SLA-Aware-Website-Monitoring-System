"""Evidence rules: what counts as up, down or inconclusive, and what that does
to availability, coverage and the SLO verdict.

Stdlib only, no AWS calls, no dependencies:

    python3 sla-monitor-terraform/lambda_src/tests/test_verdicts.py
"""
import importlib.util
import os
import sys
import unittest

# The handlers are imported from inside the Lambda source directories. Writing
# __pycache__ there puts .pyc files into the deployment zip, so keep bytecode out
# of the source tree entirely.
sys.dont_write_bytecode = True

SRC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Handlers build boto3 clients at import time. Nothing here talks to AWS, but the
# clients and table handles need a region and the environment variable names to
# exist before the modules can be imported.
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")
for _name in (
    "PROJECTS_TABLE_NAME",
    "CHECKS_TABLE_NAME",
    "INCIDENTS_TABLE_NAME",
    "REPORTS_TABLE_NAME",
    "USERS_TABLE_NAME",
    "PROJECT_GSI_NAME",
    "REPORTS_BUCKET_NAME",
):
    os.environ.setdefault(_name, _name.lower())
os.environ.setdefault("SES_SENDER_PARAM_PATH", "/sla-monitor/prod/ses/sender-email")


def load_handler(subdir: str, module_name: str):
    """Import one Lambda handler from its own directory.

    Every function directory ships its own templates.py, so `templates` must not
    leak from one import to the next: it is dropped before and after each load.
    """
    path = os.path.join(SRC, subdir)
    sys.path.insert(0, path)
    sys.modules.pop("templates", None)
    try:
        spec = importlib.util.spec_from_file_location(module_name, os.path.join(path, "handler.py"))
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.remove(path)
        sys.modules.pop("templates", None)


monitor = load_handler("monitor", "monitor_handler")
reports = load_handler("report_generator", "report_generator_handler")
projects = load_handler("project_manager", "project_manager_handler")


class AcceptedStatusParsingTest(unittest.TestCase):
    def test_default_range(self):
        self.assertEqual(monitor.parse_accepted_statuses("200-399"), [(200, 399)])

    def test_mixed_ranges_and_single_codes(self):
        self.assertEqual(
            monitor.parse_accepted_statuses("200-299, 404,500-500"),
            [(200, 299), (404, 404), (500, 500)],
        )

    def test_empty_and_malformed_fall_back_to_default(self):
        for spec in (None, "", "nonsense", "200-"):
            self.assertEqual(monitor.parse_accepted_statuses(spec), [(200, 399)], spec)


class VerdictTest(unittest.TestCase):
    def setUp(self):
        self.default = monitor.parse_accepted_statuses(monitor.DEFAULT_ACCEPTED_STATUSES)

    def test_any_accepted_code_is_up_not_just_200(self):
        for code in (200, 204, 301, 302, 404):
            ranges = monitor.parse_accepted_statuses("200-399,404")
            self.assertEqual(monitor.classify_response(code, {}, ranges), ("success", None), code)

    def test_unaccepted_code_is_down(self):
        self.assertEqual(monitor.classify_response(500, {}, self.default), ("failure", "http"))

    def test_cloudflare_challenge_is_inconclusive(self):
        self.assertEqual(
            monitor.classify_response(403, {"cf-mitigated": "challenge"}, self.default),
            ("inconclusive", "blocked"),
        )

    def test_waf_captcha_is_inconclusive(self):
        self.assertEqual(
            monitor.classify_response(405, {"x-amzn-waf-action": "captcha"}, self.default),
            ("inconclusive", "blocked"),
        )

    def test_explicitly_accepted_status_beats_challenge_detection(self):
        ranges = monitor.parse_accepted_statuses("200-399,403")
        self.assertEqual(
            monitor.classify_response(403, {"cf-mitigated": "challenge"}, ranges),
            ("success", None),
        )

    def test_probe_side_errors_map_to_causes(self):
        import requests

        self.assertEqual(monitor.classify_error(requests.exceptions.Timeout()), "timeout")
        self.assertEqual(monitor.classify_error(requests.exceptions.SSLError()), "tls")


class TransitionTest(unittest.TestCase):
    THRESHOLD = 3

    @staticmethod
    def checks(*statuses):
        """Newest first, like the real query."""
        return [{"status": s, "timestamp": 1_000 - i} for i, s in enumerate(statuses)]

    def test_alert_when_run_starts_in_view(self):
        items = self.checks("failure", "failure", "failure", "success")
        self.assertEqual(monitor.detect_transition(items, self.THRESHOLD), "down")

    def test_alert_when_down_since_first_check(self):
        items = self.checks("failure", "failure", "failure")
        self.assertEqual(monitor.detect_transition(items, self.THRESHOLD), "down")

    def test_no_repeat_alert_inside_same_run(self):
        items = self.checks("failure", "failure", "failure", "failure")
        self.assertIsNone(monitor.detect_transition(items, self.THRESHOLD))

    def test_inconclusive_breaks_a_down_run(self):
        items = self.checks("failure", "failure", "inconclusive", "success")
        self.assertIsNone(monitor.detect_transition(items, self.THRESHOLD))

    def test_recovery_alert_after_qualifying_run(self):
        items = self.checks("success", "failure", "failure", "failure")
        self.assertEqual(monitor.detect_transition(items, self.THRESHOLD), "up")

    def test_inconclusive_does_not_swallow_the_recovery_email(self):
        items = self.checks("success", "inconclusive", "failure", "failure", "failure")
        self.assertEqual(monitor.detect_transition(items, self.THRESHOLD), "up")

    def test_short_run_sends_no_recovery_email(self):
        items = self.checks("success", "failure", "failure", "success")
        self.assertIsNone(monitor.detect_transition(items, self.THRESHOLD))

    def test_first_failure_timestamp_skips_inconclusive(self):
        items = self.checks("failure", "failure", "inconclusive", "failure", "success")
        # timestamps run 1000, 999, 998, 997, 996 newest first: the run's oldest
        # real failure is 997, and the inconclusive check at 998 is skipped.
        self.assertEqual(monitor.get_first_failure_timestamp(items), 997)


class AvailabilityTest(unittest.TestCase):
    def test_inconclusive_checks_are_neither_up_nor_down(self):
        checks = [
            {"status": "success"},
            {"status": "success"},
            {"status": "failure"},
            {"status": "inconclusive"},
        ]
        metrics = reports.compute_availability_metrics(checks, expected_checks=10)
        self.assertEqual(metrics["uptime_pct"], 66.67)
        self.assertEqual(metrics["coverage_pct"], 30.0)
        self.assertEqual(metrics["checks_inconclusive"], 1)

    def test_no_conclusive_checks_gives_zero_availability_not_a_pass(self):
        metrics = reports.compute_availability_metrics(
            [{"status": "inconclusive"}], expected_checks=10
        )
        self.assertEqual(metrics["uptime_pct"], 0.0)
        self.assertEqual(metrics["coverage_pct"], 0.0)

    def test_missing_checks_reduce_coverage(self):
        # One perfect minute out of a ten-minute window is not 100% coverage.
        metrics = reports.compute_availability_metrics(
            [{"status": "success"}], expected_checks=10
        )
        self.assertEqual(metrics["uptime_pct"], 100.0)
        self.assertEqual(metrics["coverage_pct"], 10.0)


class SloVerdictTest(unittest.TestCase):
    THRESHOLDS = {"min_uptime_pct": 99.9, "max_avg_latency_ms": 300}

    def test_passes_with_enough_evidence(self):
        self.assertEqual(
            reports.evaluate_sla(self.THRESHOLDS, 100.0, 120.0, coverage_pct=99.0),
            (True, "healthy", "met"),
        )

    def test_fails_with_enough_evidence(self):
        self.assertEqual(
            reports.evaluate_sla(self.THRESHOLDS, 90.0, 120.0, coverage_pct=99.0),
            (False, "critical", "missed"),
        )

    def test_perfect_uptime_on_thin_evidence_is_unproven(self):
        sla_pass, _severity, slo_status = reports.evaluate_sla(
            self.THRESHOLDS, 100.0, 120.0, coverage_pct=30.0
        )
        self.assertTrue(sla_pass)
        self.assertEqual(slo_status, "unproven")


class AcceptedStatusValidationTest(unittest.TestCase):
    """The write path must reject specs the monitor would silently ignore."""

    def test_accepts_and_normalises_valid_specs(self):
        self.assertEqual(projects.validate_accepted_status("200-399"), "200-399")
        self.assertEqual(projects.validate_accepted_status(" 200-399 , 404 "), "200-399,404")
        self.assertEqual(projects.validate_accepted_status("200"), "200")

    def test_rejects_unusable_specs(self):
        for spec in (None, "", "abc", "99-200", "400-300", "200-", [], 200):
            self.assertIsNone(projects.validate_accepted_status(spec), spec)


if __name__ == "__main__":
    unittest.main(verbosity=2)
