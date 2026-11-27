"""Evidence rules: what counts as up, down or inconclusive, and what that does
to availability, coverage and the SLO verdict.

Stdlib only, no AWS calls, no dependencies:

    python3 sla-monitor-terraform/lambda_src/tests/test_verdicts.py
"""
import importlib.util
import json
import os
import re
import socket
import sys
import time
import unittest
from datetime import datetime, timezone
from decimal import Decimal
from unittest import mock

from boto3.dynamodb.conditions import Attr
from botocore.exceptions import ClientError

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
api = load_handler("api", "api_handler")
processor = load_handler("sla_processor", "sla_processor_handler")


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



class UrlValidationTest(unittest.TestCase):
    """Create and edit turn away URLs the monitor would refuse to check (board #16)."""

    def test_the_shared_url_cases(self):
        # The same table drives the demo's test, so both give the same answers.
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "url_cases.json")) as f:
            cases = json.load(f)["cases"]
        for url, expected in cases:
            clean, problem = projects.validate_project_fields({"url": url})
            self.assertEqual(problem, expected, url)
            self.assertEqual(clean.get("url"), None if expected else url, url)

    def test_the_address_rule_matches_the_monitors(self):
        for address in ("127.0.0.1", "10.0.0.1", "100.64.0.1", "169.254.169.254", "224.0.0.1", "240.0.0.1", "93.184.216.34", "8.8.8.8", "::1"):
            self.assertEqual(projects.is_public(address), monitor.is_public(address), address)


class ProjectLimitTest(unittest.TestCase):
    """An account monitors at most MAX_ACTIVE_PROJECTS endpoints at once (board #14)."""

    def setUp(self):
        self.pages, self.queries, self.puts, self.updates = [], [], [], []
        self.row = {"project_id": "p1", "user_id": "u1", "name": "x", "active": True}
        test = self

        class Projects:
            def query(self, **kw):
                test.queries.append(kw)
                return test.pages[len(test.queries) - 1]

            def put_item(self, Item):
                test.puts.append(Item)

            def get_item(self, Key):
                return {"Item": test.row}

            def update_item(self, **kw):
                test.updates.append(kw)
                return {"Attributes": dict(test.row)}

        self.saved = projects.projects_table
        projects.projects_table = Projects()

    def tearDown(self):
        projects.projects_table = self.saved

    def active_already(self, *pages):
        """The user index answers with these counts of active projects, one per page."""
        self.pages = [{"Count": n, **({"LastEvaluatedKey": {"page": i}} if i < len(pages) - 1 else {})} for i, n in enumerate(pages)]

    @staticmethod
    def event(body, project_id=None):
        claims = {"sub": "u1", "email": "u1@example.com"}
        event = {"requestContext": {"authorizer": {"jwt": {"claims": claims}}}, "body": json.dumps(body)}
        if project_id:
            event["pathParameters"] = {"project_id": project_id}
        return event

    def create(self):
        return projects.handle_post_projects(self.event({"name": "x", "url": "https://x.example"}))

    def edit(self, body):
        return projects.handle_put_projects_id(self.event(body, "p1"))

    def test_creates_below_the_limit(self):
        self.active_already(9)
        self.assertEqual(self.create()["statusCode"], 201)
        self.assertEqual(len(self.puts), 1)
        query = self.queries[0]
        self.assertEqual((query["IndexName"], query["Select"]), (projects.PROJECT_GSI_NAME, "COUNT"))
        self.assertEqual(query["FilterExpression"], Attr("active").eq(True))  # deleted projects don't count

    def test_refuses_at_the_limit_and_writes_nothing(self):
        self.active_already(10)
        response = self.create()
        self.assertEqual(response["statusCode"], 409)
        self.assertEqual(json.loads(response["body"])["error"], projects.LIMIT_MESSAGE)
        self.assertEqual(self.puts, [])

    def test_counts_across_pages(self):
        self.active_already(6, 4)
        self.assertEqual(self.create()["statusCode"], 409)
        self.assertEqual(self.queries[1]["ExclusiveStartKey"], {"page": 0})

    def test_reactivating_counts_like_creating(self):
        self.row["active"] = False
        self.active_already(10)
        self.assertEqual(self.edit({"active": True})["statusCode"], 409)
        self.assertEqual(self.updates, [])

    def test_other_edits_at_the_limit_go_through_without_counting(self):
        for body in ({"name": "renamed"}, {"active": True}):  # the second is already active
            self.assertEqual(self.edit(body)["statusCode"], 200, body)
        self.assertEqual(self.queries, [])


class FakeChecksTable:
    """Answers the query shapes used here: a time window, Limit=1 newest, or the first success after a time."""

    def __init__(self, rows):
        self.rows = rows
        self.queries = []

    def query(self, **kw):
        self.queries.append(kw)
        values = kw["ExpressionAttributeValues"]
        items = sorted((r for r in self.rows if r["project_id"] == values[":pid"]), key=lambda r: r["timestamp"])
        if ":from_ts" in values:
            items = [r for r in items if values[":from_ts"] <= r["timestamp"] <= values[":now_ts"]]
        if ":after_ms" in values:
            items = [r for r in items if r["timestamp"] > values[":after_ms"] and r["status"] == values[":success"]]
        if kw.get("ScanIndexForward") is False:
            items = items[::-1]
        return {"Items": items[: kw["Limit"]] if "Limit" in kw else items}


class ProjectListStatusTest(unittest.TestCase):
    """GET /projects?include=status replaces one /status request per project."""

    def setUp(self):
        now = int(time.time() * 1000)
        self.checks = FakeChecksTable([
            {"project_id": "p1", "timestamp": now - 120_000, "status": "success", "latency_ms": 100},
            {"project_id": "p1", "timestamp": now - 60_000, "status": "failure", "latency_ms": 900},
            {"project_id": "p2", "timestamp": now - 5 * 3_600_000, "status": "success", "latency_ms": 80},
        ])
        rows = [{"project_id": p, "user_id": "u1", "name": p, "url": "https://example.com", "active": True, "created_at": "2026-11-25"} for p in ("p1", "p2")]
        projects_table = type("FakeProjects", (), {
            "query": lambda self, **kw: {"Items": rows},
            "get_item": lambda self, Key: {"Item": next(r for r in rows if r["project_id"] == Key["project_id"])},
        })()
        self._real_get_tables = api._get_tables
        self._real_incidents = api._get_incidents_table
        api._get_tables = lambda: (None, projects_table, self.checks, None, "UserProjectsIndex")
        api._get_incidents_table = lambda: FakeIncidentsTable([])

    def tearDown(self):
        api._get_tables = self._real_get_tables
        api._get_incidents_table = self._real_incidents

    def get(self, params=None):
        event = {"requestContext": {"authorizer": {"jwt": {"claims": {"sub": "u1"}}}}, "queryStringParameters": params}
        return api.handle_get_projects(event)

    def test_embeds_the_window_and_reuses_its_newest_check(self):
        p1, p2 = json.loads(self.get({"include": "status", "hours": "1"})["body"])
        self.assertEqual(p1["status"]["summary"]["checks_total"], 2)
        self.assertEqual(p1["current_status"], "failure")  # newest check inside the window
        self.assertEqual(p2["status"]["checks"], [])  # nothing in the last hour...
        self.assertEqual(p2["current_status"], "success")  # ...so the Limit=1 query still answers
        self.assertEqual(len(self.checks.queries), 3)  # p1: window only; p2: window + newest

    def test_plain_request_is_unchanged(self):
        p1, _ = json.loads(self.get()["body"])
        self.assertNotIn("status", p1)
        self.assertEqual(p1["current_status"], "failure")
        self.assertEqual(len(self.checks.queries), 2)  # one Limit=1 query per project, as before

    def test_bad_hours_is_rejected(self):
        self.assertEqual(self.get({"include": "status", "hours": "x"})["statusCode"], 400)

    def test_list_window_is_capped_at_24h(self):
        p1, _ = json.loads(self.get({"include": "status", "hours": "72"})["body"])
        self.assertEqual(p1["status"]["summary"]["window_hours"], 24)

    def test_status_route_still_clamps_to_72h(self):
        event = {"requestContext": {"authorizer": {"jwt": {"claims": {"sub": "u1"}}}},
                 "pathParameters": {"project_id": "p1"}, "queryStringParameters": {"hours": "999"}}
        body = json.loads(api.handle_get_projects_status(event)["body"])
        self.assertEqual(body["summary"]["window_hours"], 72)
        self.assertEqual(body["current_status"], "failure")


class MonitorScanTest(unittest.TestCase):
    """Slow targets cannot starve the projects scanned after them (board #27)."""

    PATCHED = ("load_active_projects", "run_check", "write_check", "claim_and_count", "alert_on_transition", "certificate_due", "WRITE_RESERVE_SECONDS")

    def setUp(self):
        self.saved = {name: getattr(monitor, name) for name in self.PATCHED}
        self.calls = []
        monitor.write_check = lambda project, result: self.calls.append(("write", project["project_id"]))
        monitor.claim_and_count = lambda project, result: self.calls.append(("claim", project["project_id"]))
        monitor.alert_on_transition = lambda project, result: self.calls.append(("alert", project["project_id"]))
        monitor.certificate_due = lambda project: False
        monitor.WRITE_RESERVE_SECONDS = 5

    def tearDown(self):
        for name, value in self.saved.items():
            setattr(monitor, name, value)

    def scan(self, delays, probe_window=0.6):
        """Run the handler over projects whose checks take `delays` seconds (None raises)."""
        monitor.load_active_projects = lambda: [{"project_id": pid} for pid in delays]

        def run_check(project):
            delay = delays[project["project_id"]]
            if delay is None:
                raise RuntimeError("unreachable target")
            time.sleep(delay)
            return {}

        monitor.run_check = run_check
        end = time.monotonic() + monitor.WRITE_RESERVE_SECONDS + probe_window
        context = type("Context", (), {"get_remaining_time_in_millis": lambda self: int((end - time.monotonic()) * 1000)})()
        started = time.monotonic()
        monitor.lambda_handler({}, context)
        return time.monotonic() - started

    def written(self):
        return [pid for kind, pid in self.calls if kind == "write"]

    def test_a_slow_first_target_does_not_starve_the_rest(self):
        elapsed = self.scan({"slow": 1.5, "a": 0.05, "b": 0.05})
        self.assertEqual(sorted(self.written()), ["a", "b"])
        self.assertLess(elapsed, 1.2)  # the straggler was abandoned, not waited for

    def test_targets_are_probed_in_parallel(self):
        # Sequentially these would need 1.2 s; the probe window is 0.6 s.
        self.scan({"a": 0.3, "b": 0.3, "c": 0.3, "d": 0.3})
        self.assertEqual(sorted(self.written()), ["a", "b", "c", "d"])

    def test_a_broken_target_does_not_stop_the_others(self):
        self.scan({"bad": None, "a": 0.01})
        self.assertEqual(self.written(), ["a"])

    def test_every_check_is_claimed_and_stored_before_any_alert(self):
        self.scan({"a": 0.01, "b": 0.01, "c": 0.01})
        kinds = [kind for kind, _ in self.calls]
        self.assertEqual(kinds, ["claim", "write"] * 3 + ["alert"] * 3)

    def test_a_failed_rollup_costs_no_check_and_no_alert(self):
        def broken(project, result):
            raise RuntimeError("throttled")

        monitor.claim_and_count = broken
        self.scan({"a": 0.01, "b": 0.01})
        self.assertEqual(sorted(pid for kind, pid in self.calls if kind == "alert"), ["a", "b"])
        self.assertEqual(sorted(self.written()), ["a", "b"])

    def test_a_run_another_invocation_made_stores_nothing(self):
        def claimed(project, result):
            if project["project_id"] == "a":
                raise ClientError({"Error": {"Code": "ConditionalCheckFailedException", "Message": "taken"}}, "UpdateItem")

        monitor.claim_and_count = claimed
        self.scan({"a": 0.01, "b": 0.01})
        self.assertEqual(self.written(), ["b"])
        self.assertEqual([pid for kind, pid in self.calls if kind == "alert"], ["b"])


def fake_session(outcome, entered=None):
    """A requests.Session stand-in whose GET takes 10 ms, then answers `outcome` (a status code) or raises it.
    Each GET appends the epoch ms it began at to `entered`, when given."""

    class Session:
        max_redirects = None

        def __init__(self):
            self.headers = {}

        def mount(self, prefix, adapter):
            pass

        def get_redirect_target(self, response):
            return None

        def get(self, url, **kwargs):
            if entered is not None:
                entered.append(int(time.time() * 1000))
            time.sleep(0.01)
            if isinstance(outcome, Exception):
                raise outcome
            raw = type("Raw", (), {"read1": lambda self, amount: b""})()
            return type("Response", (), {"status_code": outcome, "headers": {}, "raw": raw, "is_redirect": False, "url": url, "close": lambda self: None})()

        def close(self):
            pass

    return Session


class LocalServerCase(unittest.TestCase):
    """A real HTTP server on 127.0.0.1, standing in for an internal service the monitor
    must never reach, and for any site once "public.test" is routed to it: that name
    resolves to a public address which the patched connect sends to this server."""

    PUBLIC = "93.184.216.34"
    BIG = 64 << 20  # far past the monitor's 1 MiB cap

    @classmethod
    def setUpClass(cls):
        import gzip
        import threading
        from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

        cls.seen, cls.connections, cls.sent, cls.agents = [], [], {}, []
        bomb = gzip.compress(bytes(cls.BIG))  # 64 MiB of zeros in about 64 KiB

        class Handler(BaseHTTPRequestHandler):
            def setup(self):
                cls.connections.append(self.client_address)  # any TCP connection, HTTP or not
                super().setup()

            def stream(self, size, pause=0.0, step=65536):
                """Send `size` bytes in `step`s until the client hangs up, counting what went out."""
                sent = 0
                try:
                    while sent < size:
                        self.wfile.write(bytes(min(step, size - sent)))
                        self.wfile.flush()
                        sent += min(step, size - sent)
                        time.sleep(pause)
                except (BrokenPipeError, ConnectionResetError):
                    pass
                cls.sent[self.path] = sent

            def do_GET(self):
                cls.seen.append(self.path)
                cls.agents.append(self.headers.get("User-Agent"))
                redirect = {"/redir": f"http://127.0.0.1:{cls.port}/", "/bigredir": "/", "/loop": "/loop", "/emptyloc": ""}.get(self.path)
                self.send_response(302 if redirect is not None else 200)
                if redirect is not None:
                    self.send_header("Location", redirect)
                if self.path in ("/big", "/bigredir"):
                    self.send_header("Content-Length", str(cls.BIG))
                    self.end_headers()
                    return self.stream(cls.BIG)
                if self.path == "/stall":
                    self.send_header("Content-Length", "100")
                    self.end_headers()
                    self.wfile.write(bytes(10))
                    self.wfile.flush()
                    time.sleep(3)  # then nothing: the monitor's read times out
                    return
                if self.path == "/drip":
                    self.send_header("Content-Length", "50")
                    self.end_headers()
                    return self.stream(50, pause=0.3, step=1)
                if self.path == "/bomb":
                    self.send_header("Content-Encoding", "gzip")
                    self.send_header("Content-Length", str(len(bomb)))
                    self.end_headers()
                    return self.stream(len(bomb))
                self.send_header("Content-Length", "0")
                self.end_headers()

            def log_message(self, *args):
                pass

        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.port = cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        self.seen.clear()
        self.connections.clear()
        self.sent.clear()
        self.agents.clear()
        self.lookups = []
        real_lookup, real_connect = socket.getaddrinfo, socket.create_connection
        answers = {"public.test": [self.PUBLIC], "mixed.test": [self.PUBLIC, "127.0.0.1"]}

        def lookup(host, port, *args, **kwargs):
            self.lookups.append(host)
            if host in answers:
                addresses = answers[host]() if callable(answers[host]) else answers[host]
                return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (a, port)) for a in addresses]
            if host == "nowhere.test":
                raise socket.gaierror(socket.EAI_NONAME, "Name or service not known")
            return real_lookup(host, port, *args, **kwargs)

        def connect(address, *args, **kwargs):
            host, port = address
            return real_connect(("127.0.0.1", port) if host == self.PUBLIC else address, *args, **kwargs)

        self.answers = answers
        patches = [mock.patch.object(socket, "getaddrinfo", lookup), mock.patch.object(socket, "create_connection", connect)]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)



class PublicAddressTest(LocalServerCase):
    """The monitor connects only to public addresses, checked at connect time (board #16)."""

    def check(self, host, path="/", scheme="http"):
        return monitor.perform_http_check(f"{scheme}://{host}:{self.port}{path}")

    def test_loopback_is_never_reached_by_any_spelling(self):
        for scheme, host in (("http", "127.0.0.1"), ("http", "localhost"), ("http", "2130706433"), ("https", "127.0.0.1")):
            result = self.check(host, scheme=scheme)
            self.assertEqual((result["status"], result["error_type"], result["http_status_code"]), ("inconclusive", "private", 0), host)
            self.assertLess(result["latency_ms"], 1000, host)  # the real time spent, not the 10 s placeholder
        self.assertEqual(self.connections, [])

    def test_a_public_address_is_fetched(self):
        self.assertEqual(self.check("public.test")["status"], "success")
        self.assertEqual(self.seen, ["/"])

    def test_one_private_answer_refuses_the_host(self):
        self.assertEqual(self.check("mixed.test")["error_type"], "private")
        self.assertEqual(self.seen, [])

    def test_a_redirect_to_loopback_is_refused_at_its_hop(self):
        result = self.check("public.test", "/redir")
        self.assertEqual((result["status"], result["error_type"]), ("inconclusive", "private"))
        self.assertEqual(self.seen, ["/redir"])  # the public hop was fetched, the loopback one never

    def test_dns_cannot_change_between_the_check_and_the_connect(self):
        answers = iter([[self.PUBLIC], ["127.0.0.1"]])
        self.answers["rebind.test"] = lambda: next(answers)
        self.assertEqual(self.check("rebind.test")["status"], "success")
        self.assertEqual(self.lookups.count("rebind.test"), 1)  # one lookup, used for both

    def test_a_refused_connection_is_still_a_connection_failure(self):
        # Through the real adapter: the guard's exception mapping keeps today's causes.
        closed = socket.socket()
        closed.bind(("127.0.0.1", 0))
        port = closed.getsockname()[1]
        closed.close()
        result = monitor.perform_http_check(f"http://public.test:{port}/")
        self.assertEqual((result["status"], result["error_type"]), ("failure", "conn"))

    def test_a_failed_lookup_is_still_a_dns_failure(self):
        result = self.check("nowhere.test")
        self.assertEqual((result["status"], result["error_type"]), ("failure", "dns"))

    def test_the_certificate_probe_is_refused_too(self):
        self.assertIsNone(monitor.probe_certificate(f"https://127.0.0.1:{self.port}"))
        self.assertEqual(self.connections, [])  # not even a TCP connection

    def test_only_public_ipv4_passes(self):
        for address in ("127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "2606:4700:4700::1111"):
            self.assertFalse(monitor.is_public(address), address)
        for address in ("93.184.216.34", "8.8.8.8", "1.1.1.1"):
            self.assertTrue(monitor.is_public(address), address)


class UserAgentTest(LocalServerCase):
    """Every hop says SLA-Monitor/1.0: requests' default UA draws a 403 from some sites (board #93)."""

    def test_a_direct_hit_sends_it(self):
        monitor.perform_http_check(f"http://public.test:{self.port}/")
        self.assertEqual(self.agents, ["SLA-Monitor/1.0"])

    def test_the_hop_after_a_redirect_sends_it_too(self):
        with mock.patch.object(monitor, "is_public", return_value=True):  # let /redir's loopback hop through
            self.assertEqual(monitor.perform_http_check(f"http://public.test:{self.port}/redir")["status"], "success")
        self.assertEqual(self.seen, ["/redir", "/"])
        self.assertEqual(self.agents, ["SLA-Monitor/1.0"] * 2)


class BoundedBodyTest(LocalServerCase):
    """A check reads at most 1 MiB of any body, within its deadline (board #16)."""

    def check(self, path):
        return monitor.perform_http_check(f"http://public.test:{self.port}{path}")

    def sent_on(self, path):
        """What the server wrote on `path` before the monitor hung up; it notices a moment later."""
        deadline = time.monotonic() + 5
        while path not in self.sent and time.monotonic() < deadline:
            time.sleep(0.02)
        return self.sent[path]

    def test_a_huge_body_is_read_only_to_the_cap(self):
        self.assertEqual(self.check("/big")["status"], "success")
        self.assertLess(self.sent_on("/big"), 16 << 20)  # the monitor hung up long before 64 MiB

    def test_a_redirect_body_is_capped_too(self):
        # requests on its own would read a redirect's whole body into memory.
        self.assertEqual(self.check("/bigredir")["status"], "success")
        self.assertEqual(self.seen, ["/bigredir", "/"])
        self.assertLess(self.sent_on("/bigredir"), 16 << 20)

    def test_a_compressed_body_is_never_inflated(self):
        import zlib

        with mock.patch.object(zlib, "decompressobj", side_effect=AssertionError("inflated")):
            self.assertEqual(self.check("/bomb")["status"], "success")

    def test_a_slow_body_is_cut_at_the_deadline(self):
        with mock.patch.object(monitor, "HTTP_TIMEOUT_SECONDS", 1):
            started = time.monotonic()
            result = self.check("/drip")
        self.assertEqual((result["status"], result["error_type"]), ("failure", "timeout"))
        self.assertLess(time.monotonic() - started, 2.5)

    def test_a_body_that_stalls_is_a_timeout(self):
        with mock.patch.object(monitor, "HTTP_TIMEOUT_SECONDS", 1):
            started = time.monotonic()
            result = self.check("/stall")
        self.assertEqual((result["status"], result["error_type"]), ("failure", "timeout"))
        self.assertLess(time.monotonic() - started, 2.5)

    def test_a_redirect_with_an_empty_location_is_the_answer(self):
        # requests stops at an empty Location and so does the monitor: the 302 is the answer.
        self.assertEqual(self.check("/emptyloc")["status"], "success")
        self.assertEqual(self.seen, ["/emptyloc"])

    def test_too_many_redirects_still_fail(self):
        result = self.check("/loop")
        self.assertEqual((result["status"], result["error_type"]), ("failure", "conn"))
        self.assertEqual(self.seen, ["/loop"] * 4)  # the first request and three redirects


class CheckTraceTest(unittest.TestCase):
    """Every check row carries its stage times (board #13)."""

    STAGES = ("run_started_at", "probe_started_at", "timestamp", "write_started_at")

    def probe(self, outcome):
        entered = []
        with mock.patch.object(monitor, "CheckSession", fake_session(outcome, entered)):
            before = int(time.time() * 1000)
            result = monitor.perform_http_check("https://example.com")
            return before, result, entered[0]

    def test_an_answered_probe_records_its_start(self):
        before, result, get_began = self.probe(200)
        self.assertTrue(before <= result["probe_started_at"] <= get_began)

    def test_a_failed_probe_records_its_start_too(self):
        import requests

        # latency_ms is the timeout placeholder here, so it cannot say when the probe ran.
        before, result, get_began = self.probe(requests.exceptions.ConnectionError("refused"))
        self.assertEqual(result["latency_ms"], monitor.HTTP_TIMEOUT_SECONDS * 1000)
        self.assertTrue(before <= result["probe_started_at"] <= get_began)

    def test_a_run_stamps_every_row_in_stage_order(self):
        rows = []
        patched = {
            "load_active_projects": lambda: [{"project_id": p, "name": p, "url": f"https://{p}.example"} for p in ("a", "b")],
            "claim_and_count": lambda project, result: None,
            "alert_on_transition": lambda project, result: None,
            "certificate_due": lambda project: False,
            "checks_table": type("Checks", (), {"put_item": lambda self, Item: rows.append(Item)})(),
        }
        saved = {name: getattr(monitor, name) for name in patched}
        context = type("Context", (), {"get_remaining_time_in_millis": lambda self: 30_000})()
        try:
            for name, value in patched.items():
                setattr(monitor, name, value)
            with mock.patch.object(monitor, "CheckSession", fake_session(200)):
                monitor.lambda_handler({}, context)
        finally:
            for name, value in saved.items():
                setattr(monitor, name, value)

        self.assertEqual(sorted(row["project_id"] for row in rows), ["a", "b"])
        self.assertEqual(len({row["run_started_at"] for row in rows}), 1)  # one run, one start
        for row in rows:
            moments = [row[stage] for stage in self.STAGES]
            # DynamoDB's resource API rejects floats, so every moment must be an int.
            self.assertTrue(all(isinstance(m, int) for m in moments), moments)
            self.assertEqual(moments, sorted(moments), row["project_id"])
            self.assertGreaterEqual(row["timestamp"] - row["probe_started_at"], 10)  # the fake GET's 10 ms


class DuplicateRunTest(unittest.TestCase):
    """A second invocation of the same tick stores no second check (board #15)."""

    def setUp(self):
        self.rows, self.runs = [], {}
        test = self

        class Projects:
            # Honours the claim the way DynamoDB would: last_run_at must be older than :floor.
            def update_item(self, Key, ExpressionAttributeValues, **kwargs):
                last = test.runs.get(Key["project_id"])
                values = ExpressionAttributeValues
                if last is not None and not (last < values[":floor"] or last == values[":run"]):
                    raise ClientError({"Error": {"Code": "ConditionalCheckFailedException", "Message": "taken"}}, "UpdateItem")
                test.runs[Key["project_id"]] = ExpressionAttributeValues[":run"]

        patched = {
            "load_active_projects": lambda: [{"project_id": p, "name": p, "url": f"https://{p}.example"} for p in ("a", "b")],
            "alert_on_transition": lambda project, result: None,
            "certificate_due": lambda project: False,
            "projects_table": Projects(),
            "checks_table": type("Checks", (), {"put_item": lambda self, Item: test.rows.append(Item)})(),
        }
        self.saved = {name: getattr(monitor, name) for name in patched}
        for name, value in patched.items():
            setattr(monitor, name, value)
        self.session = mock.patch.object(monitor, "CheckSession", fake_session(200))
        self.session.start()

    def tearDown(self):
        self.session.stop()
        for name, value in self.saved.items():
            setattr(monitor, name, value)

    def run_monitor(self):
        monitor.lambda_handler({}, type("Context", (), {"get_remaining_time_in_millis": lambda self: 30_000})())

    def test_a_duplicate_moments_later_stores_nothing(self):
        self.run_monitor()
        self.run_monitor()
        self.assertEqual(sorted(r["project_id"] for r in self.rows), ["a", "b"])

    def test_the_next_tick_stores_again(self):
        self.run_monitor()
        self.runs = {pid: run - 60_000 for pid, run in self.runs.items()}  # as if a minute had passed
        self.run_monitor()
        self.assertEqual(sorted(r["project_id"] for r in self.rows), ["a", "a", "b", "b"])


class FakeIncidentsTable:
    """Open-incident lookups, the latest-before queries, conditional puts, and the closing update_item."""

    def __init__(self, rows):
        self.rows = rows

    def query(self, **kw):
        values = kw["ExpressionAttributeValues"]
        rows = sorted((r for r in self.rows if r["project_id"] == values[":pid"]), key=lambda r: -r["start_time"])
        if ":resolved" in values:
            return {"Items": [r for r in rows if r["resolved"] == values[":resolved"]]}
        if ":now_ts" in values:
            return {"Items": [r for r in rows if values[":from_ts"] <= r["start_time"] <= values[":now_ts"]]}
        if ":to_sec" in values:
            return {"Items": [r for r in rows if values[":from_sec"] <= r["start_time"] <= values[":to_sec"]]}
        if ":end_ts" in values:
            return {"Items": [r for r in rows if r["start_time"] <= values[":end_ts"]][: kw.get("Limit")]}
        return {"Items": [r for r in rows if r["start_time"] < values[":from_ts"]][: kw.get("Limit")]}

    def put_item(self, Item, ConditionExpression=None):
        if ConditionExpression and any(
            r["project_id"] == Item["project_id"] and r["start_time"] == Item["start_time"] for r in self.rows
        ):
            raise ClientError({"Error": {"Code": "ConditionalCheckFailedException"}}, "PutItem")
        self.rows.append(dict(Item))

    def update_item(self, Key, ExpressionAttributeValues, **kw):
        row = next(r for r in self.rows if r["project_id"] == Key["project_id"] and r["start_time"] == Key["start_time"])
        values = ExpressionAttributeValues
        row.update(end_time=values[":et"], duration_seconds=values[":ds"], resolved=values[":res"])
        if ":reason" in values:
            row["closed_reason"] = values[":reason"]


class InactiveIncidentTest(unittest.TestCase):
    """An incident left open on a deleted or paused project gets closed (board #28)."""

    START = int(time.time()) - 7200

    def run_processor(self, project, checks, start=START):
        incidents = FakeIncidentsTable([{"project_id": "p1", "start_time": start, "end_time": None, "duration_seconds": None, "resolved": False}])
        saved = (processor.incidents_table, processor.checks_table, processor.load_projects)
        processor.incidents_table, processor.checks_table = incidents, FakeChecksTable(checks)
        processor.load_projects = lambda: [project]
        try:
            processor.lambda_handler({}, None)
        finally:
            processor.incidents_table, processor.checks_table, processor.load_projects = saved
        return incidents.rows[0]

    @staticmethod
    def check(sec, status):
        return {"project_id": "p1", "timestamp": sec * 1000, "status": status}

    def test_closed_at_the_last_check_and_marked(self):
        row = self.run_processor({"project_id": "p1", "active": False},
                                 [self.check(self.START, "failure"), self.check(self.START + 600, "failure")])
        self.assertEqual((row["resolved"], row["end_time"], row["closed_reason"]), (True, self.START + 600, "monitoring_stopped"))

    def test_a_recovery_before_deactivation_still_closes_it_as_a_recovery(self):
        row = self.run_processor({"project_id": "p1", "active": False},
                                 [self.check(self.START, "failure"), self.check(self.START + 300, "success")])
        self.assertEqual((row["resolved"], row["end_time"]), (True, self.START + 300))
        self.assertNotIn("closed_reason", row)

    def test_expired_checks_fall_back_to_the_deactivation_time(self):
        from datetime import datetime, timezone

        start = int(time.time()) - 100 * 86400
        deactivated = datetime.fromtimestamp(start + 3600, tz=timezone.utc).isoformat()
        row = self.run_processor({"project_id": "p1", "active": False, "updated_at": deactivated}, [], start=start)
        self.assertEqual((row["end_time"], row["closed_reason"]), (start + 3600, "monitoring_stopped"))

    def test_active_or_unknown_projects_keep_an_ongoing_incident_open(self):
        for project in ({"project_id": "p1", "active": True}, {"project_id": "p1"}):
            row = self.run_processor(project, [self.check(self.START, "failure"), self.check(self.START + 600, "failure")])
            self.assertFalse(row["resolved"], project)


class HourBoundaryTest(unittest.TestCase):
    """A failure run that crosses the top of the hour is recorded once, from its first failure (board #9)."""

    H = 1_800_000_000 - 1_800_000_000 % 3600  # a top of the hour

    def passes(self, checks, at, rows=()):
        incidents = FakeIncidentsTable(list(rows))
        project = {"project_id": "p1", "active": True, "failure_threshold": 3}
        with mock.patch.object(processor, "incidents_table", incidents), \
             mock.patch.object(processor, "load_projects", lambda: [project]):
            for now in at:
                # Each pass sees only the checks written by then.
                seen = FakeChecksTable([c for c in checks if c["timestamp"] <= now * 1000])
                with mock.patch.object(processor, "checks_table", seen), \
                     mock.patch.object(processor.time, "time", return_value=now):
                    processor.lambda_handler({}, None)
        return incidents.rows

    @staticmethod
    def checks(*pairs):
        return [{"project_id": "p1", "timestamp": sec * 1000, "status": status} for sec, status in pairs]

    def test_a_short_run_across_the_hour_is_recorded(self):
        H = self.H  # two failures before the hour, two after: each hour alone holds fewer than three
        checks = self.checks((H - 300, "success"), (H - 100, "failure"), (H - 40, "failure"),
                             (H + 20, "failure"), (H + 80, "failure"), (H + 140, "success"))
        rows = self.passes(checks, [H + 5, H + 3605])
        self.assertEqual([(r["start_time"], r["end_time"], r["resolved"]) for r in rows], [(H - 100, H + 140, True)])

    def test_a_longer_run_keeps_its_first_failure_and_full_duration(self):
        H = self.H
        checks = self.checks((H - 300, "success"), (H - 100, "failure"), (H - 40, "failure"), (H + 20, "failure"),
                             (H + 80, "failure"), (H + 140, "failure"), (H + 200, "success"))
        rows = self.passes(checks, [H + 5, H + 3605])
        self.assertEqual([(r["start_time"], r["duration_seconds"]) for r in rows], [(H - 100, 300)])

    def test_a_run_seen_again_at_the_window_start_is_not_recorded_twice(self):
        # The pass at H records and closes it; the pass at H+1h sees it again, cut short by its
        # window's start. The older incident makes sure the overlap check reads the latest one.
        start = self.H - 3600 - 120
        older = {"project_id": "p1", "start_time": start - 5000, "end_time": start - 4000, "duration_seconds": 1000, "resolved": True}
        checks = self.checks(*[(start + 60 * i, "failure") for i in range(8)], (start + 480, "success"))
        rows = self.passes(checks, [self.H, self.H + 3600], rows=[older])
        self.assertEqual([(r["start_time"], r["end_time"]) for r in rows], [(start - 5000, start - 4000), (start, start + 480)])

    def test_an_ongoing_outage_stays_one_incident_across_passes(self):
        H = self.H
        failures = [(H - 600 + 60 * i, "failure") for i in range(72)]  # H-600 to H+3660
        checks = self.checks((H - 700, "success"), *failures, (H + 3700, "success"))
        rows = self.passes(checks, [H, H + 3600, H + 7200])
        self.assertEqual([(r["start_time"], r["end_time"]) for r in rows], [(H - 600, H + 3700)])

    def test_a_new_outage_right_after_a_recovery_opens_its_own_incident(self):
        H = self.H
        first = [(H - 600 + 60 * i, "failure") for i in range(11)]  # H-600 to H, still open after the pass at H
        second = [(H + 300 + 60 * i, "failure") for i in range(3)]
        checks = self.checks(*first, (H + 100, "success"), *second, (H + 500, "success"))
        rows = self.passes(checks, [H, H + 3600])
        self.assertEqual([(r["start_time"], r["end_time"]) for r in rows], [(H - 600, H + 100), (H + 300, H + 500)])

    def test_a_retry_never_overwrites_a_closed_incident(self):
        closed = {"project_id": "p1", "start_time": 100, "end_time": 400, "duration_seconds": 300, "resolved": True}
        incidents = FakeIncidentsTable([dict(closed)])
        with mock.patch.object(processor, "incidents_table", incidents):
            self.assertFalse(processor.open_incident("p1", 100))
        self.assertEqual(incidents.rows, [closed])


class OpenIncidentWindowTest(unittest.TestCase):
    """An outage that began before the incidents window still counts, inside the window only (board #9)."""

    NOW = 1_800_000_000

    def incidents_route(self, rows):
        event = {
            "requestContext": {"authorizer": {"jwt": {"claims": {"sub": "u1"}}}},
            "pathParameters": {"project_id": "p1"},
            "queryStringParameters": {"days": "30"},
        }
        with mock.patch.object(api, "_get_incidents_table", lambda: FakeIncidentsTable(rows)), \
             mock.patch.object(api, "get_project_or_403", lambda pid, uid: {"project_id": "p1", "thresholds": {}}), \
             mock.patch.object(api.time, "time", return_value=self.NOW):
            return json.loads(api.handle_get_projects_incidents(event)["body"])

    def test_an_outage_open_since_before_the_window_is_still_open(self):
        start = self.NOW - 40 * 86400
        body = self.incidents_route([{"project_id": "p1", "start_time": start, "end_time": None, "resolved": False}])
        self.assertEqual([i["start_time"] for i in body["incidents"]], [start])
        self.assertTrue(body["metrics"]["open_incident"])
        self.assertEqual(body["metrics"]["total_downtime_sec"], 30 * 86400)  # counted from the window's start

    def test_an_outage_that_ran_into_the_window_counts_only_inside_it(self):
        start, end = self.NOW - 40 * 86400, self.NOW - 86400
        body = self.incidents_route([{"project_id": "p1", "start_time": start, "end_time": end, "duration_seconds": end - start, "resolved": True}])
        metrics = body["metrics"]
        self.assertEqual([i["start_time"] for i in body["incidents"]], [start])
        self.assertEqual((metrics["open_incident"], metrics["total_downtime_sec"], metrics["longest_outage_sec"]), (False, 29 * 86400, 29 * 86400))
        self.assertEqual(metrics["mttr_sec"], end - start)  # the whole repair, not only its part in the window

    def test_a_closed_incident_from_before_the_window_stays_out(self):
        start = self.NOW - 40 * 86400
        body = self.incidents_route([{"project_id": "p1", "start_time": start, "end_time": start + 60, "duration_seconds": 60, "resolved": True}])
        self.assertEqual((body["incidents"], body["metrics"]["open_incident"]), ([], False))


class ReportIncidentWindowTest(unittest.TestCase):
    """A report counts an outage that ran into its window, inside the window only (board #31)."""

    FROM, TO = 1_800_000_000, 1_800_000_000 + 7 * 86400

    def incidents(self, rows):
        with mock.patch.object(reports, "incidents_table", FakeIncidentsTable(rows)):
            return [i["start_time"] for i in reports.query_incidents_paginated("p1", self.FROM, self.TO)]

    @staticmethod
    def row(start, end=None):
        return {"project_id": "p1", "start_time": start, "end_time": end, "resolved": end is not None,
                "duration_seconds": None if end is None else end - start}

    def downtime(self, *rows):
        return reports.compute_reliability_metrics(list(rows), self.FROM, self.TO)["total_downtime_sec"]

    def test_the_outage_before_the_window_is_kept_only_while_it_overlaps(self):
        inside = self.row(self.FROM + 86400, self.FROM + 86400 + 300)
        self.assertEqual(self.incidents([self.row(self.FROM - 3600), inside]), [self.FROM - 3600, self.FROM + 86400])
        self.assertEqual(self.incidents([self.row(self.FROM - 3600, self.FROM + 600), inside]), [self.FROM - 3600, self.FROM + 86400])
        self.assertEqual(self.incidents([self.row(self.FROM - 3600, self.FROM - 60), inside]), [self.FROM + 86400])
        # The window's edges: a start exactly at it is taken once, an end exactly at it is outside.
        self.assertEqual(self.incidents([self.row(self.FROM, self.FROM + 60)]), [self.FROM])
        self.assertEqual(self.incidents([self.row(self.FROM - 60, self.FROM)]), [])

    def test_build_report_clips_to_the_window_it_is_given(self):
        checks = [{"timestamp": (self.FROM + i * 60) * 1000, "status": "success", "latency_ms": 100} for i in range(10)]
        report = reports.build_report({"project_id": "p1"}, checks, [self.row(self.FROM - 3600, self.FROM + 600)], "r1", (self.FROM, self.TO), expected_checks=10)
        self.assertEqual((report["incident_count"], report["total_downtime_sec"]), (1, 600))

    def test_downtime_is_clipped_to_the_window_and_counts_open_outages(self):
        self.assertEqual(self.downtime(self.row(self.FROM - 3600, self.FROM + 600), self.row(self.FROM + 86400, self.FROM + 86700)), 900)
        self.assertEqual(self.downtime(self.row(self.TO - 120, self.TO + 3600)), 120)  # ran past the end
        self.assertEqual(self.downtime(self.row(self.TO - 60)), 60)  # still open: down until the window closes
        self.assertEqual(self.downtime(self.row(self.FROM - 3600)), 7 * 86400)  # open all week
        legacy = {"start_time": self.FROM + 10, "end_time": None, "resolved": True, "duration_seconds": 50}
        self.assertEqual(self.downtime(legacy), 50)


class ReportDocumentTest(unittest.TestCase):
    """The report row keeps what its document shows, and the document says it plainly (board #10)."""

    FROM = 1_800_000_000 - 1_800_000_000 % 86400  # a UTC midnight
    TO = FROM + 2 * 86400

    @staticmethod
    def check(sec, status="success", latency=100, error=None):
        return {"timestamp": sec * 1000 + 250, "status": status, "latency_ms": latency, "error_type": error}

    def report(self, checks, incidents=(), expected=4, **project):
        project = {"project_id": "p1", "name": "API", "url": "https://x.example",
                   "thresholds": {"min_uptime_pct": 99.0, "max_avg_latency_ms": 300}, **project}
        report = reports.build_report(project, checks, list(incidents), "2026-W47", (self.FROM, self.TO), expected_checks=expected)
        report["report_kind"] = "Weekly Report"
        return report, project

    def test_percentiles_causes_and_days(self):
        checks = [self.check(self.FROM + i * 60, latency=i + 1) for i in range(100)]
        checks += [self.check(self.FROM + 86460, "failure", 10000, "timeout"), self.check(self.FROM + 86520, "inconclusive", 300, "blocked")]
        checks.append(self.check(self.TO, "failure", 10000, "http"))  # the window's closing instant stays in its last day
        report, _ = self.report(checks)
        self.assertEqual((report["p50_latency_ms"], report["p99_latency_ms"], report["max_latency_ms"]), (50.0, 99.0, 100.0))
        self.assertEqual({c["cause"]: (c["failed"], c["inconclusive"]) for c in report["causes"]},
                         {"timeout": (1, 0), "http": (1, 0), "blocked": (0, 1)})
        self.assertEqual([(d["checks_up"], d["checks_down"], d["checks_inconclusive"], d["uptime_pct"]) for d in report["daily"]],
                         [(100, 0, 0, 100.0), (0, 2, 1, 0.0)])

    def test_incidents_are_kept_clipped_to_the_window(self):
        carried = {"start_time": self.FROM - 600, "end_time": self.FROM + 300, "duration_seconds": 900, "resolved": True, "cause": "conn"}
        report, _ = self.report([self.check(self.FROM)], [carried])
        self.assertEqual(report["incidents"], [{"start": self.FROM - 600, "end": self.FROM + 300, "in_window_sec": 300,
                                                "cause": "conn", "resolved": True, "closed_reason": None}])
        self.assertEqual([d["downtime_sec"] for d in report["daily"]], [300, 0])

    def test_three_verdicts_and_no_contract_wording(self):
        ok = [self.check(self.FROM + i * 60) for i in range(4)]
        for checks, expected, title in [
            (ok, 4, "Objectives met"),
            (ok + [self.check(self.FROM + 300, "failure", 10000, "timeout")], 5, "Objectives missed"),
            (ok, 400, "Objectives not proven"),  # 1% coverage
        ]:
            report, project = self.report(checks, expected=expected)
            html = reports.build_html_report(report, project)
            self.assertIn(title, html)
            self.assertNotIn("SLA met", html)
            self.assertNotIn("SLA breached", html)
            subject, _ = reports.build_report_email(project, report, datetime_utc(self.FROM), datetime_utc(self.TO))
            self.assertIn(title.upper(), subject)

    def test_user_text_is_escaped_and_cannot_reach_the_page_css(self):
        cause = {"start_time": self.FROM + 60, "end_time": self.FROM + 300, "duration_seconds": 240, "resolved": True, "cause": "<b>x</b>"}
        report, project = self.report([self.check(self.FROM)], [cause], name="<script>alert(1)</script>", url='https://x.example/"><i>')
        report["report_id"] = '2026-W47"} body { color: red'
        html = reports.build_html_report(report, project)
        self.assertNotIn("<script>alert(1)</script>", html)
        self.assertIn("&lt;script&gt;alert(1)&lt;/script&gt;", html)
        self.assertNotIn('"><i>', html)
        self.assertNotIn("<b>x</b>", html)
        self.assertIn('content: "SLA Monitor \\00B7  2026-W47bodycolorred"', html)

    def test_an_old_row_renders_without_the_newer_sections(self):
        old = {"report_id": "2026-W47", "uptime_pct": 99.5, "avg_latency_ms": 120.0, "p95_latency_ms": 200.0, "incident_count": 0,
               "total_downtime_sec": 0, "severity": "degraded", "sla_pass": False, "generated_at": "2026-11-23T08:00:00+00:00",
               "window_start": self.FROM, "window_end": self.TO, "report_kind": "Weekly Report", "incidents": []}
        html = reports.build_html_report(old, {"name": "API", "thresholds": {"min_uptime_pct": 99.0}})  # target since lowered
        self.assertIn("Objectives missed", html)
        self.assertNotIn(">Met<", html)
        self.assertNotIn("Both objectives were met", html)
        for section in ("Daily availability", "Error budget", "Response time", "Evidence and coverage"):
            self.assertNotIn(f"<h2>{section}</h2>", html)

    def test_rebuilding_an_old_row_lists_only_incidents_that_started_inside(self):
        week_start = int(datetime.fromisocalendar(2026, 47, 1).replace(tzinfo=timezone.utc).timestamp())
        row = {"project_id": "p1", "report_id": "2026-W47", "uptime_pct": 99.5, "avg_latency_ms": 120, "p95_latency_ms": 200,
               "incident_count": 1, "total_downtime_sec": 60, "severity": "degraded", "sla_pass": False, "generated_at": "2026-11-23T08:00:00"}
        rows = [{"project_id": "p1", "start_time": week_start - 600, "end_time": week_start + 300, "resolved": True},
                {"project_id": "p1", "start_time": week_start + 3600, "end_time": week_start + 3660, "resolved": True}]
        uploaded = []
        table = lambda item: type("T", (), {"get_item": lambda self, Key: {"Item": item}})()
        with mock.patch.object(reports, "projects_table", table({"project_id": "p1", "name": "API"})), \
             mock.patch.object(reports, "reports_table", table(row)), \
             mock.patch.object(reports, "incidents_table", FakeIncidentsTable(rows)), \
             mock.patch.object(reports, "upload_report_files", lambda report, project: uploaded.append(report)):
            reports._run_rebuild("p1", "2026-W47")
        self.assertEqual([i["start"] for i in uploaded[0]["incidents"]], [week_start + 3600])

    @staticmethod
    def summary(report, project):
        html = reports.build_html_report(report, project)
        return re.search(r'<div class="verdict"[^>]*>(.*?)</div>\s*<p>(.*?)</p>', html, re.S).groups()

    def test_numbers_read_like_a_document(self):
        delta, duration = (reports.build_html_report.__globals__[n] for n in ("_delta", "fmt_duration"))
        self.assertEqual([delta(99.82, 99.97, " pts"), delta(178, 171, " ms", 0), delta(1, 1, " pts"), delta(None, 1, " pts")],
                         ["\u22120.15 pts", "+7 ms", "no change", ""])
        self.assertEqual([duration(n) for n in (45, 420, 432, 7200, 7260)], ["45s", "7m", "7m 12s", "2h", "2h 1m"])

    def test_summary_sentences(self):
        ok = [self.check(self.FROM + i * 60) for i in range(4)]
        first = {"start_time": self.FROM + 600, "end_time": self.FROM + 1020, "duration_seconds": 420, "resolved": True, "cause": "timeout"}
        second = {"start_time": self.FROM + 86400, "end_time": self.FROM + 86460, "duration_seconds": 60, "resolved": True, "cause": "http"}
        self.assertIn("1 incident caused 7m of downtime in this period. ", self.summary(*self.report(ok, [first]))[1] + " ")
        self.assertIn("2 incidents caused 8m of downtime in this period; the longest lasted 7m.", self.summary(*self.report(ok, [first, second]))[1])
        self.assertIn("No incidents were recorded: no run of failures reached 3 consecutive checks.", self.summary(*self.report(ok))[1])
        self.assertIn("Both objectives were met.", self.summary(*self.report(ok))[1])

    def test_no_evidence_and_nothing_passing_blame_nothing_they_cannot_show(self):
        blocked = [self.check(self.FROM + i * 60, "inconclusive", 300, "blocked") for i in range(4)]
        title, text = self.summary(*self.report(blocked))
        self.assertEqual((title, text.split(".")[0]), ("Objectives not proven", "No check produced evidence in this period, so the objectives cannot be judged"))
        failed = [self.check(self.FROM + i * 60, "failure", 10000, "timeout") for i in range(4)]
        report, project = self.report(failed)
        title, text = self.summary(report, project)
        self.assertEqual(title, "Objectives missed")
        self.assertIn("no check passed, so there is no response time to judge. The availability objective was missed", text)
        latency_row = re.search(r"<tr><td>Average response time</td>.*?</tr>", reports.build_html_report(report, project)).group(0)
        self.assertIn("&mdash;", latency_row)
        self.assertNotIn("Missed", latency_row)

    def test_the_email_matches_the_document(self):
        blocked = [self.check(self.FROM + i * 60, "inconclusive", 300, "blocked") for i in range(4)]
        report, project = self.report(blocked, name='Shop </div><a href=//evil>x</a>')
        subject, body = reports.build_report_email(project, report, datetime_utc(self.FROM), datetime_utc(self.TO))
        self.assertIn("OBJECTIVES NOT PROVEN", subject)
        self.assertIn("Objectives not proven", body)
        self.assertRegex(body, r"Availability</td>.*?>n/a ")
        self.assertIn("Evidence coverage", body)
        self.assertNotIn("<a href=//evil>", body)

    def test_previous_week_reads_last_weeks_row(self):
        row = {"report_id": "2026-W46", "uptime_pct": Decimal("99.97"), "avg_latency_ms": Decimal("171"),
               "coverage_pct": Decimal("99.9"), "total_downtime_sec": Decimal("0"), "daily": []}
        keys = []
        table = type("T", (), {"get_item": lambda self, Key: (keys.append(Key), {"Item": row})[1]})()
        with mock.patch.object(reports, "reports_table", table):
            previous = reports.previous_week("p1", datetime(2026, 11, 16, tzinfo=timezone.utc))
        self.assertEqual(keys, [{"project_id": "p1", "report_id": "2026-W46"}])
        self.assertEqual(previous, {"report_id": "2026-W46", "uptime_pct": 99.97, "avg_latency_ms": 171,
                                    "coverage_pct": 99.9, "total_downtime_sec": 0})

    def test_a_flapping_month_stays_under_the_item_limit_and_round_trips(self):
        many = [{"start_time": self.FROM + i * 240, "end_time": self.FROM + i * 240 + 180, "duration_seconds": 180,
                 "resolved": True, "cause": "timeout"} for i in range(300)]
        report, _ = self.report([self.check(self.FROM + i * 60) for i in range(10)], many)
        self.assertEqual((len(report["incidents"]), report["incidents_omitted"], report["incident_count"]), (200, 100, 300))
        stored = json.loads(json.dumps(reports.decimals_to_native(reports.floats_to_decimal(report))))
        self.assertEqual(stored["incidents"], report["incidents"])

    def test_the_report_list_leaves_the_document_detail_out(self):
        row = {"project_id": "p1", "report_id": "2026-W47", "uptime_pct": 99.5, "daily": [{"start": 1}], "incidents": [],
               "causes": [], "previous": None, "target": {}, "monitor": {}}
        reports_table = type("R", (), {"query": lambda self, **kw: {"Items": [row]}})()
        event = {"requestContext": {"authorizer": {"jwt": {"claims": {"sub": "u1"}}}}, "pathParameters": {"project_id": "p1"}}
        with mock.patch.object(api, "_get_tables", lambda: (None, None, None, reports_table, None)), \
             mock.patch.object(api, "get_project_or_403", lambda pid, uid: {"project_id": "p1"}):
            body = json.loads(api.handle_get_projects_reports(event)["body"])
        self.assertEqual(body, [{"project_id": "p1", "report_id": "2026-W47", "uptime_pct": 99.5}])


def datetime_utc(epoch_sec):
    return datetime.fromtimestamp(epoch_sec, tz=timezone.utc)


class MttrTest(unittest.TestCase):
    def test_cut_off_incidents_count_as_downtime_but_not_repair_time(self):
        incidents = [
            {"start_time": 1000, "duration_seconds": 600, "resolved": True},
            {"start_time": 5000, "duration_seconds": 3000, "resolved": True, "closed_reason": "monitoring_stopped"},
        ]
        metrics = api._reliability_metrics(incidents, {}, 0, 86400)
        self.assertEqual((metrics["mttr_sec"], metrics["total_downtime_sec"]), (600, 3600))


class DailyRollupTest(unittest.TestCase):
    """The monitor tallies each check per UTC day on the project row (board #5)."""

    RUN = 1_795_785_288_873

    def count(self, project, status="success", when="2026-11-25T23:59:30+00:00"):
        from datetime import datetime

        calls = []
        saved = monitor.projects_table
        monitor.projects_table = type("Projects", (), {"update_item": lambda self, **kw: calls.append(kw)})()
        try:
            check = {"status": status, "timestamp": int(datetime.fromisoformat(when).timestamp() * 1000), "run_started_at": self.RUN}
            monitor.claim_and_count(project, check)
        finally:
            monitor.projects_table = saved
        return calls[0]

    def test_adds_to_the_utc_day_and_records_the_first_day(self):
        kw = self.count({"project_id": "p1"})
        self.assertEqual(kw["ExpressionAttributeNames"]["#count"], "d20261125_up")
        self.assertEqual(kw["UpdateExpression"], "ADD #count :one SET #since = if_not_exists(#since, :day), #run = :run")
        self.assertEqual(kw["ExpressionAttributeValues"], {":one": 1, ":day": "2026-11-25", ":run": self.RUN, ":floor": self.RUN - 30_000})

    def test_claims_the_run_unless_another_ran_within_the_gap(self):
        # Board #15: a duplicate delivery or a retry must not store a second check.
        kw = self.count({"project_id": "p1"})
        self.assertEqual(kw["ExpressionAttributeNames"]["#run"], "last_run_at")
        self.assertEqual(kw["ConditionExpression"], "attribute_exists(#pid) AND (attribute_not_exists(#run) OR #run < :floor OR #run = :run)")

    def test_status_names(self):
        self.assertEqual(self.count({"project_id": "p1"}, "failure")["ExpressionAttributeNames"]["#count"], "d20261125_down")
        self.assertEqual(self.count({"project_id": "p1"}, "inconclusive")["ExpressionAttributeNames"]["#count"], "d20261125_inconclusive")

    def test_prunes_only_the_days_past_the_window(self):
        project = {"project_id": "p1", "d20261001_up": 5, "d20261009_down": 2, "d20261020_up": 9, "daily_since": "2026-10-01"}
        kw = self.count(project)
        removed = sorted(v for k, v in kw["ExpressionAttributeNames"].items() if k.startswith("#old"))
        self.assertEqual(removed, ["d20261001_up", "d20261009_down"])  # 45 days before 2026-11-25 is 2026-10-11
        self.assertIn(" REMOVE ", kw["UpdateExpression"])


class DailyApiTest(unittest.TestCase):
    """GET /status and the dashboard list carry a per-day payload (board #5)."""

    NOW = 1_764_115_200 + 12 * 3600  # 2025-11-26 12:00 UTC

    def daily(self, project, incidents, days=3):
        saved = api._get_incidents_table
        api._get_incidents_table = lambda: FakeIncidentsTable(incidents)
        try:
            return api._daily(project, days, self.NOW)
        finally:
            api._get_incidents_table = saved

    @staticmethod
    def incident(start, end=None):
        return {"project_id": "p1", "start_time": start, "end_time": end, "resolved": end is not None}

    def test_tallies_zero_filled_oldest_first(self):
        result = self.daily({"project_id": "p1", "daily_since": "2025-11-25", "d20251125_up": 1400, "d20251125_down": 3, "d20251126_inconclusive": 2}, [])
        self.assertEqual(result["since"], "2025-11-25")
        self.assertEqual([d["date"] for d in result["days"]], ["2025-11-24", "2025-11-25", "2025-11-26"])
        self.assertEqual([(d["up"], d["down"], d["inconclusive"]) for d in result["days"]], [(0, 0, 0), (1400, 3, 0), (0, 0, 2)])

    def test_outage_seconds_split_at_midnight_and_open_incidents_run_to_now(self):
        midnight = 1_764_115_200  # 2025-11-26 00:00 UTC
        result = self.daily({"project_id": "p1"}, [self.incident(midnight - 600, midnight + 300), self.incident(self.NOW - 120)])
        self.assertEqual([d["outage_sec"] for d in result["days"]], [0, 600, 300 + 120])

    def test_an_incident_from_before_the_window_still_counts(self):
        window_start = 1_764_115_200 - 2 * 86400  # 2025-11-24 00:00 UTC
        result = self.daily({"project_id": "p1"}, [self.incident(window_start - 3600, window_start + 60)])
        self.assertEqual(result["days"][0]["outage_sec"], 60)

    def test_counters_never_leave_the_api(self):
        row = {"project_id": "p1", "name": "x", "daily_since": "2025-11-25", "d20251125_up": 5}
        self.assertEqual(api._without_rollup(row), {"project_id": "p1", "name": "x", "daily_since": "2025-11-25"})


if __name__ == "__main__":
    unittest.main(verbosity=2)
