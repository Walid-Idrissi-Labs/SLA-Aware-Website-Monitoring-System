import json
import os
import time
import decimal

import boto3
from botocore.exceptions import ClientError


_dynamodb = None
_users_table = None
_projects_table = None
_checks_table = None
_reports_table = None
_project_gsi_name = None

s3_client = boto3.client("s3")
lambda_client = boto3.client("lambda")
REPORTS_BUCKET_NAME = os.environ.get("REPORTS_BUCKET_NAME", "")
REPORT_GENERATOR_FUNCTION_NAME = os.environ.get("REPORT_GENERATOR_FUNCTION_NAME", "")


def _rebuild_report_artifact(project_id: str, report_id: str) -> None:
    """Ask the report generator to (re)create a report's S3 files. Used as a self-heal
    when the artifact is missing — e.g. a row produced by older code. Best-effort:
    any failure just leaves the caller to return a clean 404."""
    if not REPORT_GENERATOR_FUNCTION_NAME:
        return
    try:
        lambda_client.invoke(
            FunctionName=REPORT_GENERATOR_FUNCTION_NAME,
            InvocationType="RequestResponse",
            Payload=json.dumps({"project_id": project_id, "report_id": report_id}).encode("utf-8"),
        )
    except ClientError:
        pass


class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, decimal.Decimal):
            # Preserve integers as int, floats as float
            if obj % 1 == 0:
                return int(obj)
            return float(obj)
        return super().default(obj)



def _get_tables():
    global _dynamodb, _users_table, _projects_table, _checks_table, _reports_table, _project_gsi_name
    if _dynamodb is None:
        _dynamodb = boto3.resource("dynamodb")
        _users_table = _dynamodb.Table(os.environ["USERS_TABLE_NAME"])
        _projects_table = _dynamodb.Table(os.environ["PROJECTS_TABLE_NAME"])
        _checks_table = _dynamodb.Table(os.environ["CHECKS_TABLE_NAME"])
        _reports_table = _dynamodb.Table(os.environ["REPORTS_TABLE_NAME"])
        _project_gsi_name = os.environ["PROJECT_GSI_NAME"]
    return _users_table, _projects_table, _checks_table, _reports_table, _project_gsi_name


CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
}


def success(status_code: int, body: dict | list):
    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": json.dumps(body, cls=DecimalEncoder),
    }


def error_response(status_code: int, message: str):
    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": json.dumps({"error": message}, cls=DecimalEncoder),
    }




def get_user_id(event: dict) -> str:
    claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
    return claims["sub"]


def handle_get_health() -> dict:
    return success(200, {"status": "ok"})



def get_project_or_403(project_id: str, user_id: str) -> dict | None:
    _, projects_table, _, _, _ = _get_tables()
    response = projects_table.get_item(Key={"project_id": project_id})
    project = response.get("Item")
    if not project or project.get("user_id") != user_id:
        return None
    return project




def handle_get_me(event: dict) -> dict:
    user_id = get_user_id(event)
    users_table, _, _, _, _ = _get_tables()

    result = users_table.get_item(Key={"user_id": user_id})
    user = result.get("Item")

    if not user:
        return error_response(404, "User not found")

    return success(200, user)


def handle_get_projects(event: dict) -> dict:
    user_id = get_user_id(event)
    _, projects_table, checks_table, _, PROJECT_GSI_NAME = _get_tables()


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
    _, _, checks_table, _, _ = _get_tables()

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


def handle_get_project(event: dict) -> dict:
    user_id = get_user_id(event)
    project_id = event["pathParameters"]["project_id"]
    _, projects_table, _, _, _ = _get_tables()

    project = get_project_or_403(project_id, user_id)
    if not project:
        return error_response(403, "Forbidden")

    return success(200, project)


def handle_get_projects_reports(event: dict) -> dict:
    user_id = get_user_id(event)
    project_id = event["pathParameters"]["project_id"]
    _, _, _, reports_table, _ = _get_tables()


    project = get_project_or_403(project_id, user_id)
    if not project:
        return error_response(403, "Forbidden")

    response = reports_table.query(
        KeyConditionExpression="project_id = :pid",
        ExpressionAttributeValues={":pid": project_id},
    )
    reports = response.get("Items", [])

    return success(200, reports)




def handle_report_download(event: dict) -> dict:
    """Return a short-lived pre-signed S3 URL for a report's HTML or JSON file."""
    user_id = get_user_id(event)
    project_id = event["pathParameters"]["project_id"]
    report_id = event["pathParameters"]["report_id"]

    project = get_project_or_403(project_id, user_id)
    if not project:
        return error_response(403, "Forbidden")

    query_params = event.get("queryStringParameters") or {}
    fmt = (query_params.get("format") or "html").lower()
    if fmt not in ("html", "json"):
        return error_response(400, "format must be 'html' or 'json'")

    key = f"reports/{project_id}/{report_id}.{fmt}"
    content_type = "text/html" if fmt == "html" else "application/json"

    # Confirm the artifact exists so we 404 cleanly instead of handing back a URL
    # that resolves to a NoSuchKey error. If it's missing but the report row exists,
    # self-heal by asking the report generator to rebuild the files, then re-check.
    def _exists() -> bool:
        try:
            s3_client.head_object(Bucket=REPORTS_BUCKET_NAME, Key=key)
            return True
        except ClientError as e:
            if e.response["Error"]["Code"] in ("404", "NoSuchKey", "NotFound"):
                return False
            raise

    if not _exists():
        _rebuild_report_artifact(project_id, report_id)
        if not _exists():
            return error_response(404, "Report file not found")

    url = s3_client.generate_presigned_url(
        "get_object",
        Params={
            "Bucket": REPORTS_BUCKET_NAME,
            "Key": key,
            "ResponseContentType": content_type,
            "ResponseContentDisposition": f'attachment; filename="{report_id}.{fmt}"',
        },
        ExpiresIn=300,
    )
    return success(200, {"url": url, "expires_in": 300})


def lambda_handler(event: dict, context) -> dict:
    try:
        #payload_format_version = "2.0" #(HTTP API)
        method = event["requestContext"]["http"]["method"]
        path = event["requestContext"]["http"]["path"]
        #payload_format_version = "1.0" #(REST API)
        # method = event.get("httpMethod", "")
        # path = event.get("path", "")
        path_params = event.get("pathParameters") or {}

        if method == "GET" and path == "/health":  
            return handle_get_health()
        
        if method == "GET" and path == "/me":
            return handle_get_me(event)

        if method == "GET" and path == "/projects":
            return handle_get_projects(event)

        # GET /projects/{project_id}/reports/{report_id}/download
        if method == "GET" and path_params.get("report_id"):
            return handle_report_download(event)

        if method == "GET" and path_params.get("project_id"):
            project_id = path_params["project_id"]

            if path == f"/projects/{project_id}":
                event["pathParameters"]["project_id"] = project_id
                return handle_get_project(event)

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