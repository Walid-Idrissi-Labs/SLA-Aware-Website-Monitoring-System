import json
import os
import time

import boto3
from botocore.exceptions import ClientError




dynamodb = boto3.resource("dynamodb")
users_table = dynamodb.Table(os.environ["USERS_TABLE_NAME"])
projects_table = dynamodb.Table(os.environ["PROJECTS_TABLE_NAME"])
checks_table = dynamodb.Table(os.environ["CHECKS_TABLE_NAME"])
reports_table = dynamodb.Table(os.environ["REPORTS_TABLE_NAME"])


PROJECT_GSI_NAME = os.environ["PROJECT_GSI_NAME"]



CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
}


def success(status_code: int, body: dict | list):
    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": json.dumps(body),
    }


def error_response(status_code: int, message: str):
    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": json.dumps({"error": message}),
    }




def get_user_id(event: dict) -> str:
    claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
    return claims["sub"]





def get_project_or_403(project_id: str, user_id: str) -> dict | None:
    response = projects_table.get_item(Key={"project_id": project_id})
    project = response.get("Item")
    if not project or project.get("user_id") != user_id:
        return None
    return project




def handle_get_me(event: dict) -> dict:
    user_id = get_user_id(event)

    result = users_table.get_item(Key={"user_id": user_id})
    user = result.get("Item")

    if not user:
        return error_response(404, "User not found")

    return success(200, user)


def handle_get_projects(event: dict) -> dict:
    user_id = get_user_id(event)


    response = projects_table.query(
        IndexName=PROJECT_GSI_NAME,
        KeyConditionExpression="user_id = :uid",
        ExpressionAttributeValues={":uid": user_id},
    )
    projects = response.get("Items", [])


    enriched = []
    for project in projects:
        checks_response = checks_table.query(
            KeyConditionExpression="project_id = :pid",
            ExpressionAttributeValues={":pid": project["project_id"]},
            ScanIndexForward=False, #newest
            Limit=1,
        )
        checks = checks_response.get("Items", [])

        enriched_project = {
            "project_id": project["project_id"],
            "name": project["name"],
            "url": project["url"],
            "active": project["active"],
            "created_at": project["created_at"],
        }

        if checks:
            last_check = checks[0]
            enriched_project["current_status"] = last_check["status"]
            enriched_project["last_latency_ms"] = last_check["latency_ms"]
            enriched_project["last_checked_at"] = last_check.get("timestamp")
        else:
            enriched_project["current_status"] = "unknown"
            enriched_project["last_latency_ms"] = None
            enriched_project["last_checked_at"] = None

        enriched.append(enriched_project)

    return success(200, enriched)


def handle_get_projects_status(event: dict) -> dict:
    user_id = get_user_id(event)
    project_id = event["pathParameters"]["project_id"]

    project = get_project_or_403(project_id, user_id)
    if not project:
        return error_response(403, "Forbidden")


    query_params = event.get("queryStringParameters") or {}
    hours = int(query_params.get("hours", 24))
    hours = min(max(hours, 1), 72)  

    now_ms = int(time.time() * 1000)
    from_ms = now_ms - (hours * 3600 * 1000)


    response = checks_table.query(
        KeyConditionExpression="project_id = :pid AND #ts BETWEEN :from_ts AND :now_ts",
        ExpressionAttributeNames={"#ts": "timestamp"},
        ExpressionAttributeValues={
            ":pid": project_id,
            ":from_ts": from_ms,
            ":now_ts": now_ms,
        },
        ScanIndexForward=True,  
    )
    checks = response.get("Items", [])

    current_status = checks[-1]["status"] if checks else "unknown"

    return success(200, {
        "project_id": project_id,
        "current_status": current_status,
        "checks": checks,
    })


def handle_get_projects_reports(event: dict) -> dict:
    user_id = get_user_id(event)
    project_id = event["pathParameters"]["project_id"]


    project = get_project_or_403(project_id, user_id)
    if not project:
        return error_response(403, "Forbidden")

    response = reports_table.query(
        KeyConditionExpression="project_id = :pid",
        ExpressionAttributeValues={":pid": project_id},
    )
    reports = response.get("Items", [])

    return success(200, reports)




def lambda_handler(event: dict, context) -> dict:
    method = event.get("httpMethod", "")
    path = event.get("path", "")
    path_params = event.get("pathParameters") or {}

    try:
        if method == "GET" and path == "/me":
            return handle_get_me(event)

        if method == "GET" and path == "/projects":
            return handle_get_projects(event)

        if method == "GET" and path_params.get("project_id"):
            project_id = path_params["project_id"]

            if path == f"/projects/{project_id}/status":
                event["pathParameters"]["project_id"] = project_id
                return handle_get_projects_status(event)

            if path == f"/projects/{project_id}/reports":
                event["pathParameters"]["project_id"] = project_id
                return handle_get_projects_reports(event)

        return error_response(404, "Not found")

    except ClientError as e:
        return error_response(500, f"Database error: {e.response['Error']['Message']}")

    except Exception as e:
        return error_response(500, f"Internal error: {str(e)}")