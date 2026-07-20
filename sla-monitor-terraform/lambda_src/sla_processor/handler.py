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
                    "start_ts_ms": current_run[0]["timestamp"],
                    "end_ts_ms": current_run[-1]["timestamp"],
                })
            current_run = []



    if len(current_run) >= failure_threshold:
        runs.append({
            "start_ts_ms": current_run[0]["timestamp"],
            "end_ts_ms": current_run[-1]["timestamp"],
        })

    return runs






def has_open_incident(project_id: str) -> dict | None:
    response = incidents_table.query(
        KeyConditionExpression="project_id = :pid",
        FilterExpression="resolved = :resolved",
        ExpressionAttributeValues={
            ":pid": project_id,
            ":resolved": False,
        },
    )
    items = response.get("Items", [])
    return items[0] if items else None


def open_incident(project_id: str, start_time_sec: int) -> None:
    #Idempotency: caller should already have checked that no open incident exists

    incidents_table.put_item(
        Item={
            "project_id": project_id,
            "start_time": start_time_sec,
            "end_time": None,
            "duration_seconds": None,
            "resolved": False,
        }
    )
    logger.info(f"Opened incident for project {project_id}, start_time={start_time_sec}")


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




def detect_recovery(checks: list[dict]) -> int | None:

    if not checks:
        return None

    most_recent = checks[-1]
    if most_recent["status"] != "success":
        return None


    prior_failures = [c for c in checks[:-1] if c["status"] == "failure"]
    if not prior_failures:
        return None

    return most_recent["timestamp"]



#invoked by EventBridge rule every 1hour
def lambda_handler(event: dict, context) -> dict:

    logger.info("SLA Processor Lambda invoked")

    response = projects_table.scan(
        FilterExpression="active = :active",
        ExpressionAttributeValues={":active": True},
    )
    projects = response.get("Items", [])

    if not projects:
        logger.info("No active projects — exiting")
        return {"statusCode": 200, "body": json.dumps({"message": "No active projects"})}

    logger.info(f"Processing {len(projects)} active project(s)")

    for project in projects:
        project_id = project["project_id"]
        failure_threshold = project.get("failure_threshold", FAILURE_THRESHOLD_DEFAULT)


        now_sec = int(time.time())
        now_ms = now_sec * 1000
        from_sec = now_sec - 3600  
        from_ms = from_sec * 1000

        response = checks_table.query(
            KeyConditionExpression=(
                "project_id = :pid AND #ts BETWEEN :from_ts AND :now_ts"
            ),
            ExpressionAttributeNames={"#ts": "timestamp"},
            ExpressionAttributeValues={
                ":pid": project_id,
                ":from_ts": from_ms,
                ":now_ts": now_ms,
            },
            ScanIndexForward=True,  # oldest first
        )
        checks = response.get("Items", [])

        if not checks:
            logger.info(f"No checks in the last hour for project {project_id} — skipping")
            continue

        logger.info(
            f"Project {project_id}: {len(checks)} checks in the last hour, "
            f"threshold={failure_threshold}"
        )



        failure_runs = find_failure_runs(checks, failure_threshold)

        for run in failure_runs:
            # Check idempotency
            if not has_open_incident(project_id):
                start_time_sec = run["start_ts_ms"] // 1000 
                open_incident(project_id, start_time_sec)
            else:
                logger.info(
                    f"Open incident already exists for project {project_id} — skipping"
                )


        open_incident_record = has_open_incident(project_id)

        if open_incident_record:
            recovery_ts_ms = detect_recovery(checks)
            if recovery_ts_ms is not None:
                end_time_sec = recovery_ts_ms // 1000  # convert ms → sec
                close_incident(
                    project_id,
                    int(open_incident_record["start_time"]),
                    end_time_sec,
                )
            else:
                logger.info(
                    f"Open incident exists for project {project_id} but no recovery detected"
                )

    logger.info("SLA Processor Lambda completed successfully")
    return {"statusCode": 200, "body": json.dumps({"message": "OK"})}