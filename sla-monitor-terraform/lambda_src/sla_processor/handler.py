import json
import os
import time
import logging

import boto3
from botocore.exceptions import ClientError



dynamodb = boto3.resource("dynamodb")

projects_table = dynamodb.Table(os.environ["PROJECTS_TABLE_NAME"])
checks_table = dynamodb.Table(os.environ["CHECKS_TABLE_NAME"])
incidents_table = dynamodb.Table(os.environ["INCIDENTS_TABLE_NAME"])

FAILURE_THRESHOLD_DEFAULT = int(os.environ.get("FAILURE_THRESHOLD_DEFAULT", "3"))

logger = logging.getLogger()
logger.setLevel(logging.INFO)




def _dominant_cause(checks: list[dict]) -> str | None:
    """Most common error_type across a failure run (per-check field set by the
    Monitor Lambda). None for legacy checks written before error_type existed."""
    counts: dict[str, int] = {}
    for check in checks:
        cause = check.get("error_type")
        if cause:
            counts[cause] = counts.get(cause, 0) + 1
    if not counts:
        return None
    return max(counts, key=counts.get)


def find_failure_runs(checks: list[dict], failure_threshold: int) -> list[dict]:
    #failure run : status=failure > threshold

    runs = []
    current_run = []

    for check in checks:
        if check["status"] == "failure":
            current_run.append(check)
        else:

            if len(current_run) >= failure_threshold:
                runs.append({
                    "start_ts_ms": int(current_run[0]["timestamp"]),
                    "end_ts_ms": int(current_run[-1]["timestamp"]),
                    "cause": _dominant_cause(current_run),
                })
            current_run = []



    if len(current_run) >= failure_threshold:
        runs.append({
            "start_ts_ms": int(current_run[0]["timestamp"]),
            "end_ts_ms": int(current_run[-1]["timestamp"]),
            "cause": _dominant_cause(current_run),
        })

    return runs






def get_open_incident(project_id: str) -> dict | None:
    response = incidents_table.query(
        KeyConditionExpression="project_id = :pid",
        FilterExpression="resolved = :resolved",
        ExpressionAttributeValues={
            ":pid": project_id,
            ":resolved": False,
        },
        ConsistentRead=True,
    )
    items = response.get("Items", [])
    return items[0] if items else None


def open_incident(project_id: str, start_time_sec: int, cause: str | None = None) -> None:
    #Idempotency: caller should already have checked that no open incident exists

    item = {
        "project_id": project_id,
        "start_time": start_time_sec,
        "end_time": None,
        "duration_seconds": None,
        "resolved": False,
    }
    if cause:
        item["cause"] = cause
    incidents_table.put_item(Item=item)
    logger.info(
        f"Opened incident for project {project_id}, start_time={start_time_sec}, cause={cause}"
    )


def close_incident(project_id: str, start_time_sec: int, end_time_sec: int) -> bool:
    duration = end_time_sec - start_time_sec
    try:
        incidents_table.update_item(
            Key={
                "project_id": project_id,
                "start_time": start_time_sec,
            },
            UpdateExpression="SET #et = :et, #ds = :ds, #res = :res",
            ConditionExpression="#res = :false",
            ExpressionAttributeNames={
                "#et": "end_time",
                "#ds": "duration_seconds",
                "#res": "resolved",
            },
            ExpressionAttributeValues={
                ":et": end_time_sec,
                ":ds": duration,
                ":res": True,
                ":false": False,
            },
        )
        logger.info(
            f"Closed incident for project {project_id}, "
            f"start={start_time_sec}, end={end_time_sec}, duration={duration}s"
        )
        return True

    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            logger.info(f"Incident for project {project_id} was already closed — skipping")
            return False
        raise




def find_first_success_after(project_id: str, after_sec: int) -> int | None:
    # The recovery for an open incident can fall in a *later* hourly window
    # than the failure run that opened it, so search forward from the incident
    # start rather than only inside the current window.
    query_kwargs = {
        "KeyConditionExpression": "project_id = :pid AND #ts > :after_ms",
        "FilterExpression": "#st = :success",
        "ExpressionAttributeNames": {"#ts": "timestamp", "#st": "status"},
        "ExpressionAttributeValues": {
            ":pid": project_id,
            ":after_ms": after_sec * 1000,
            ":success": "success",
        },
        "ScanIndexForward": True,  # oldest first → first match is the recovery
    }
    while True:
        response = checks_table.query(**query_kwargs)
        items = response.get("Items", [])
        if items:
            return int(items[0]["timestamp"])
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            return None
        query_kwargs["ExclusiveStartKey"] = last_key


def first_success_in_window_after(checks: list[dict], after_ts_ms: int) -> int | None:
    for check in checks:
        if int(check["timestamp"]) > after_ts_ms and check["status"] == "success":
            return int(check["timestamp"])
    return None


def query_window_checks(project_id: str, from_ms: int, to_ms: int) -> list[dict]:
    checks = []
    query_kwargs = {
        "KeyConditionExpression": (
            "project_id = :pid AND #ts BETWEEN :from_ts AND :now_ts"
        ),
        "ExpressionAttributeNames": {"#ts": "timestamp"},
        "ExpressionAttributeValues": {
            ":pid": project_id,
            ":from_ts": from_ms,
            ":now_ts": to_ms,
        },
        "ScanIndexForward": True,  # oldest first
    }
    while True:
        response = checks_table.query(**query_kwargs)
        checks.extend(response.get("Items", []))
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            return checks
        query_kwargs["ExclusiveStartKey"] = last_key


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




def process_project(project: dict) -> None:
    project_id = project["project_id"]
    failure_threshold = int(project.get("failure_threshold", FAILURE_THRESHOLD_DEFAULT))

    now_sec = int(time.time())
    from_sec = now_sec - 3600

    # STEP 1 — settle any incident carried over from previous windows.
    # closed_at_sec guards step 2: failure runs that belong to the incident we
    # just closed must not open a duplicate.
    open_incident_record = get_open_incident(project_id)
    closed_at_sec = None
    if open_incident_record:
        incident_start_sec = int(open_incident_record["start_time"])
        recovery_ts_ms = find_first_success_after(project_id, incident_start_sec)
        if recovery_ts_ms is not None:
            close_incident(project_id, incident_start_sec, recovery_ts_ms // 1000)
            open_incident_record = None
            closed_at_sec = recovery_ts_ms // 1000
        else:
            logger.info(f"Open incident for project {project_id} is still ongoing")

    # STEP 2 — walk this window's failure runs chronologically.
    checks = query_window_checks(project_id, from_sec * 1000, now_sec * 1000)

    if not checks:
        logger.info(f"No checks in the last hour for project {project_id} — skipping")
        return

    logger.info(
        f"Project {project_id}: {len(checks)} checks in the last hour, "
        f"threshold={failure_threshold}"
    )

    for run in find_failure_runs(checks, failure_threshold):
        run_start_sec = run["start_ts_ms"] // 1000

        if open_incident_record is not None:
            logger.info(f"Open incident already exists for project {project_id} — skipping run")
            continue
        if closed_at_sec is not None and run_start_sec <= closed_at_sec:
            # This run is part of the incident closed in step 1.
            continue

        open_incident(project_id, run_start_sec, run.get("cause"))

        # If the site already recovered inside this window, close immediately —
        # otherwise a second run in the same window would be silently dropped.
        recovery_ts_ms = first_success_in_window_after(checks, run["end_ts_ms"])
        if recovery_ts_ms is not None:
            close_incident(project_id, run_start_sec, recovery_ts_ms // 1000)
            closed_at_sec = recovery_ts_ms // 1000
        else:
            open_incident_record = {"start_time": run_start_sec}



#invoked by EventBridge rule every 1hour
def lambda_handler(event: dict, context) -> dict:

    logger.info("SLA Processor Lambda invoked")

    projects = load_active_projects()

    if not projects:
        logger.info("No active projects — exiting")
        return {"statusCode": 200, "body": json.dumps({"message": "No active projects"})}

    logger.info(f"Processing {len(projects)} active project(s)")

    for project in projects:
        try:
            process_project(project)
        except Exception as e:
            # Isolate failures so one project's bad data can't stall incident
            # detection for every other tenant.
            logger.error(f"Incident processing failed for project {project.get('project_id')}: {e}")

    logger.info("SLA Processor Lambda completed successfully")
    return {"statusCode": 200, "body": json.dumps({"message": "OK"})}
