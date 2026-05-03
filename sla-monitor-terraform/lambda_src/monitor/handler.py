import json
import os
import time
import logging
from datetime import datetime, timezone

import boto3
import requests
from botocore.exceptions import ClientError




dynamodb = boto3.resource("dynamodb")
ssm = boto3.client("ssm")
ses = boto3.client("ses")

projects_table = dynamodb.Table(os.environ["PROJECTS_TABLE_NAME"])
checks_table = dynamodb.Table(os.environ["CHECKS_TABLE_NAME"])

FAILURE_THRESHOLD_DEFAULT = int(os.environ.get("FAILURE_THRESHOLD_DEFAULT", "3"))
HTTP_TIMEOUT_SECONDS = int(os.environ.get("HTTP_TIMEOUT_SECONDS", "10"))
SES_SENDER_PARAM_PATH = os.environ["SES_SENDER_PARAM_PATH"]

logger = logging.getLogger()
logger.setLevel(logging.INFO)




def get_sender_email() -> str:
    response = ssm.get_parameter(Name=SES_SENDER_PARAM_PATH)
    return response["Parameter"]["Value"]


def send_email(to_address: str, subject: str, html_body: str) -> None:
    sender = get_sender_email()
    ses.send_email(
        Source=sender,
        Destination={"ToAddresses": [to_address]},
        Message={
            "Subject": {"Data": subject, "Charset": "UTF-8"},
            "Body": {"Html": {"Data": html_body, "Charset": "UTF-8"}},
        },
    )


def build_down_email(project: dict, first_failure_ts_ms: int) -> tuple[str, str]:
    first_failure_dt = datetime.fromtimestamp(first_failure_ts_ms / 1000, tz=timezone.utc)
    first_failure_str = first_failure_dt.strftime("%Y-%m-%d %H:%M:%S UTC")

    subject = f"[DOWN] {project['name']} is unreachable"

    html = f"""
    <html><body style="font-family: Arial, sans-serif;">
    <div style="background-color: #dc2626; color: white; padding: 16px; border-radius: 4px;">
        <h2>🔴 Site Down</h2>
    </div>
    <div style="padding: 16px;">
        <p><strong>Project:</strong> {project['name']}</p>
        <p><strong>URL:</strong> <a href="{project['url']}">{project['url']}</a></p>
        <p><strong>First failure detected:</strong> {first_failure_str}</p>
        <p><strong>Consecutive failures:</strong> {project['failure_threshold']}</p>
    </div>
    <div style="padding: 16px; color: #666; font-size: 12px;">
        You are receiving this because you monitor this project on SLA Monitor.
    </div>
    </body></html>
    """
    return subject, html


def build_up_email(project: dict) -> tuple[str, str]:
    recovered_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    subject = f"[UP] {project['name']} has recovered"

    html = f"""
    <html><body style="font-family: Arial, sans-serif;">
    <div style="background-color: #16a34a; color: white; padding: 16px; border-radius: 4px;">
        <h2>✅ Site Recovered</h2>
    </div>
    <div style="padding: 16px;">
        <p><strong>Project:</strong> {project['name']}</p>
        <p><strong>URL:</strong> <a href="{project['url']}">{project['url']}</a></p>
        <p><strong>Recovered at:</strong> {recovered_str}</p>
    </div>
    <div style="padding: 16px; color: #666; font-size: 12px;">
        You are receiving this because you monitor this project on SLA Monitor.
    </div>
    </body></html>
    """
    return subject, html






def perform_http_check(url: str) -> dict:
    timeout_seconds = HTTP_TIMEOUT_SECONDS
    start_time = time.time()

    try:
        response = requests.get(url, timeout=timeout_seconds, follow_redirects=True)
        latency_ms = int((time.time() - start_time) * 1000)
        http_status = response.status_code
        status = "success" if http_status == 200 else "failure"

    except requests.exceptions.Timeout:
        latency_ms = timeout_seconds * 1000
        http_status = 0
        status = "failure"

    except requests.exceptions.ConnectionError:
        latency_ms = timeout_seconds * 1000
        http_status = 0
        status = "failure"

    except requests.exceptions.RequestException:
        latency_ms = timeout_seconds * 1000
        http_status = 0
        status = "failure"

    return {
        "status": status,
        "latency_ms": latency_ms,
        "http_status_code": http_status,
    }




def detect_transition(project_id: str, current_status: str, failure_threshold: int) -> str | None:
    # Query last N+1 checks
    response = checks_table.query(
        KeyConditionExpression="project_id = :pid",
        ExpressionAttributeValues={":pid": project_id},
        ScanIndexForward=False,  # newest first
        Limit=failure_threshold + 1,
    )
    items = response.get("Items", [])


    if len(items) < failure_threshold + 1:
        return None

    # last_N
    last_n = items[:failure_threshold]
    
    # (N+1)th (just before the window)
    before_window = items[failure_threshold]

    all_recent_failed = all(c["status"] == "failure" for c in last_n)
    previous_was_ok = before_window["status"] == "success"


    if all_recent_failed and previous_was_ok:
        return "down"

    # UP: current (most recent) is success AND there were failures in the window before it
    # last_n[0] is the current check, last_n[1:] is everything before current
    current_is_success = current_status == "success"
    any_recent_failed = any(c["status"] == "failure" for c in last_n[1:])

    if current_is_success and any_recent_failed:
        return "up"

    return None





def get_first_failure_timestamp(project_id: str, failure_threshold: int) -> int:
    response = checks_table.query(
        KeyConditionExpression="project_id = :pid",
        ExpressionAttributeValues={":pid": project_id},
        ScanIndexForward=False,  # newest first
        Limit=failure_threshold,
    )
    items = response.get("Items", [])

    # oldest failure in the window 
    for item in reversed(items):
        if item["status"] == "failure":
            return item["timestamp"]

    # return current time if no prior failure found
    return int(time.time() * 1000)








#invoked by EventBridge rule every 1minute
def lambda_handler(event: dict, context) -> dict:
    logger.info("Monitor Lambda invoked")


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
        notification_email = project["notification_email"]


        check_result = perform_http_check(project["url"])
        now_ms = int(time.time() * 1000)
        ttl_seconds = int(time.time()) + 7_776_000  # 90 days : dynamodb ttl expects seconds


        check_record = {
            "project_id": project_id,
            "timestamp": now_ms,
            "status": check_result["status"],
            "latency_ms": check_result["latency_ms"],
            "http_status_code": check_result["http_status_code"],
            "ttl": ttl_seconds,
        }
        checks_table.put_item(Item=check_record)

        logger.info(
            f"Checked {project['name']} ({project['url']}) — "
            f"status={check_result['status']}, latency={check_result['latency_ms']}ms, "
            f"http_status={check_result['http_status_code']}"
        )



        transition = detect_transition(project_id, check_result["status"], failure_threshold)

        if transition == "down":
            first_failure_ts = get_first_failure_timestamp(project_id, failure_threshold)
            subject, html_body = build_down_email(project, first_failure_ts)
            try:
                send_email(notification_email, subject, html_body)
                logger.info(f"DOWN alert sent for project {project_id}")
            except ClientError as e:
                logger.error(f"Failed to send DOWN email for project {project_id}: {e}")

        elif transition == "up":
            subject, html_body = build_up_email(project)
            try:
                send_email(notification_email, subject, html_body)
                logger.info(f"UP alert sent for project {project_id}")
            except ClientError as e:
                logger.error(f"Failed to send UP email for project {project_id}: {e}")



    logger.info("Monitor Lambda completed successfully")
    return {"statusCode": 200, "body": json.dumps({"message": "OK"})}