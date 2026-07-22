import json
import logging
import os
import re
import uuid
from decimal import Decimal
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)




dynamodb = boto3.resource("dynamodb")
users_table =    dynamodb.Table(os.environ["USERS_TABLE_NAME"])
projects_table = dynamodb.Table(os.environ["PROJECTS_TABLE_NAME"])

lambda_client = boto3.client("lambda")
REPORT_GENERATOR_FUNCTION_NAME = os.environ.get("REPORT_GENERATOR_FUNCTION_NAME", "")

def floats_to_decimal(obj):
    """Recursively convert floats to Decimal for DynamoDB compatibility."""
    if isinstance(obj, float):
        return Decimal(str(obj))  # str() avoids floating point precision issues
    if isinstance(obj, dict):
        return {k: floats_to_decimal(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [floats_to_decimal(i) for i in obj]
    return obj


class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            # Preserve integers as int, floats as float
            if obj % 1 == 0:
                return int(obj)
            return float(obj)
        return super().default(obj)



CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
}


def success(status_code: int, body: dict):
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


def get_user_email(event: dict) -> str:
    claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
    return claims.get("email", "")




def get_project_or_403(project_id: str, user_id: str) -> dict | None:
    response = projects_table.get_item(Key={"project_id": project_id})
    project = response.get("Item")
    #check ownership
    if not project or project.get("user_id") != user_id:
        return None
    return project




EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# These values flow into every downstream Lambda (monitor loop arithmetic,
# incident detection, HTML emails), so bad types here become cross-tenant
# crashes there — reject them at the door.
def validate_project_fields(body: dict) -> tuple[dict, str | None]:
    clean = {}

    if "name" in body:
        name = body["name"]
        if not isinstance(name, str) or not name.strip():
            return {}, "name must be a non-empty string"
        if len(name) > 200:
            return {}, "name must be 200 characters or fewer"
        clean["name"] = name.strip()

    if "url" in body:
        url = body["url"]
        if not isinstance(url, str) or not re.match(r"^https?://[^\s]+$", url, re.IGNORECASE):
            return {}, "url must start with http:// or https://"
        if len(url) > 2048:
            return {}, "url must be 2048 characters or fewer"
        clean["url"] = url.strip()

    if "failure_threshold" in body:
        threshold = body["failure_threshold"]
        if isinstance(threshold, bool) or not isinstance(threshold, int) or not 1 <= threshold <= 10:
            return {}, "failure_threshold must be an integer between 1 and 10"
        clean["failure_threshold"] = threshold

    if "active" in body:
        if not isinstance(body["active"], bool):
            return {}, "active must be a boolean"
        clean["active"] = body["active"]

    if "notification_email" in body:
        email = body["notification_email"]
        if not isinstance(email, str) or not EMAIL_RE.match(email) or len(email) > 254:
            return {}, "notification_email must be a valid email address"
        clean["notification_email"] = email.strip()

    if "thresholds" in body:
        thresholds = body["thresholds"]
        if not isinstance(thresholds, dict):
            return {}, "thresholds must be an object"
        min_uptime = thresholds.get("min_uptime_pct")
        max_latency = thresholds.get("max_avg_latency_ms")
        if isinstance(min_uptime, bool) or not isinstance(min_uptime, (int, float)) or not 0 <= min_uptime <= 100:
            return {}, "thresholds.min_uptime_pct must be a number between 0 and 100"
        if isinstance(max_latency, bool) or not isinstance(max_latency, (int, float)) or max_latency <= 0:
            return {}, "thresholds.max_avg_latency_ms must be a positive number"
        clean["thresholds"] = floats_to_decimal(
            {"min_uptime_pct": min_uptime, "max_avg_latency_ms": max_latency}
        )

    return clean, None




def handle_post_me(event: dict) -> dict:
    # First-login profile bootstrap. Idempotent: creates the full user record from
    # the JWT claims, and never clobbers an existing one.
    user_id = get_user_id(event)
    claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
    email = claims.get("email", "")
    display_name = claims.get("name") or (email.split("@")[0] if email else "User")
    now = datetime.now(timezone.utc).isoformat()

    profile = {
        "user_id": user_id,
        "email": email,
        "display_name": display_name,
        "notification_email": email,
        "created_at": now,
    }

    try:
        users_table.put_item(
            Item=profile,
            ConditionExpression="attribute_not_exists(user_id)",
        )
        return success(201, profile)
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            # Already bootstrapped — return the existing profile.
            existing = users_table.get_item(Key={"user_id": user_id}).get("Item")
            return success(200, existing or profile)
        raise


def handle_put_me(event: dict) -> dict:
    user_id = get_user_id(event)
    body = json.loads(event.get("body") or "{}")

    # Build update expression only for fields that were provided
    update_parts = []
    expression_values = {}
    expression_names = {}

    if "display_name" in body:
        display_name = body["display_name"]
        if not isinstance(display_name, str) or not display_name.strip() or len(display_name) > 100:
            return error_response(400, "display_name must be a non-empty string of 100 characters or fewer")
        update_parts.append("#dn = :dn")
        expression_names["#dn"] = "display_name"
        expression_values[":dn"] = display_name.strip()

    if "notification_email" in body:
        email = body["notification_email"]
        if not isinstance(email, str) or not EMAIL_RE.match(email) or len(email) > 254:
            return error_response(400, "notification_email must be a valid email address")
        update_parts.append("#ne = :ne")
        expression_names["#ne"] = "notification_email"
        expression_values[":ne"] = email.strip()

    if not update_parts:
        return error_response(400, "No valid fields provided")

    # Backfill immutable identity fields on first write, so a Settings-save before
    # the profile is bootstrapped still yields a complete record (never overwrites).
    update_parts.append("#em = if_not_exists(#em, :em)")
    expression_names["#em"] = "email"
    expression_values[":em"] = get_user_email(event)

    update_parts.append("#ca = if_not_exists(#ca, :ca)")
    expression_names["#ca"] = "created_at"
    expression_values[":ca"] = datetime.now(timezone.utc).isoformat()

    update_expression = "SET " + ", ".join(update_parts)

    result = users_table.update_item(
        Key={"user_id": user_id},
        UpdateExpression=update_expression,
        ExpressionAttributeNames=expression_names,
        ExpressionAttributeValues=expression_values,
        ReturnValues="ALL_NEW",
    )

    return success(200, result["Attributes"])


def handle_post_projects(event: dict) -> dict:
    user_id = get_user_id(event)
    user_email = get_user_email(event)
    body = json.loads(event.get("body") or "{}")

    if not body.get("name") or not body.get("url"):
        return error_response(400, "name and url are required")

    # Apply defaults, then validate everything through one gate.
    body.setdefault("failure_threshold", 3)
    body.setdefault("thresholds", {"min_uptime_pct": 99.9, "max_avg_latency_ms": 300})
    if not body.get("notification_email"):
        body["notification_email"] = user_email

    clean, validation_error = validate_project_fields(body)
    if validation_error:
        return error_response(400, validation_error)
    if not clean.get("notification_email"):
        # No email in the body and none on the JWT — the project would silently
        # never receive alerts or reports.
        return error_response(400, "notification_email is required")

    project = {
        "project_id": str(uuid.uuid4()),
        "user_id": user_id,
        "active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        **clean,
    }

    projects_table.put_item(Item=project)

    return success(201, project)


def handle_put_projects_id(event: dict) -> dict:
    user_id = get_user_id(event)
    project_id = event["pathParameters"]["project_id"]

    # Ownership check
    project = get_project_or_403(project_id, user_id)
    if not project:
        return error_response(403, "Forbidden")

    body = json.loads(event.get("body") or "{}")

    if not body:
        return error_response(400, "No fields provided")

    clean, validation_error = validate_project_fields(body)
    if validation_error:
        return error_response(400, validation_error)

    update_parts = []
    expression_values = {}
    expression_names = {}

    for field, attr_value in clean.items():
        attr_name = "#" + field
        update_parts.append(f"{attr_name} = :{field}")
        expression_names[attr_name] = field
        expression_values[f":{field}"] = attr_value

    if not update_parts:
        return error_response(400, "No valid fields provided")

    # Add updated_at timestamp
    update_parts.append("#ua = :ua")
    expression_names["#ua"] = "updated_at"
    expression_values[":ua"] = datetime.now(timezone.utc).isoformat()

    update_expression = "SET " + ", ".join(update_parts)

    result = projects_table.update_item(
        Key={"project_id": project_id},
        UpdateExpression=update_expression,
        ExpressionAttributeNames=expression_names,
        ExpressionAttributeValues=expression_values,
        ReturnValues="ALL_NEW",
    )

    return success(200, result["Attributes"])


def handle_delete_projects_id(event: dict) -> dict:
    user_id = get_user_id(event)
    project_id = event["pathParameters"]["project_id"]


    project = get_project_or_403(project_id, user_id)
    if not project:
        return error_response(403, "Forbidden")

    projects_table.update_item(
        Key={"project_id": project_id},
        UpdateExpression="SET #active = :active, #ua = :ua",
        ExpressionAttributeNames={"#active": "active", "#ua": "updated_at"},
        ExpressionAttributeValues={
            ":active": False,
            ":ua": datetime.now(timezone.utc).isoformat(),
        },
    )

    return {"statusCode": 204, "headers": CORS_HEADERS, "body": ""}




def handle_generate_report(event: dict) -> dict:
    """Generate an on-demand report for one project (synchronous; no email).

    We invoke the report generator RequestResponse and surface its real outcome, so a
    failure shows up in the UI instead of silently never appearing.
    """
    user_id = get_user_id(event)
    project_id = event["pathParameters"]["project_id"]

    project = get_project_or_403(project_id, user_id)
    if not project:
        return error_response(403, "Forbidden")

    body = json.loads(event.get("body") or "{}")
    try:
        days = int(body.get("days", 7))
    except (TypeError, ValueError):
        days = 7
    if days not in (1, 7, 30):
        return error_response(400, "days must be 1, 7, or 30")

    if not REPORT_GENERATOR_FUNCTION_NAME:
        return error_response(500, "Report generator is not configured")

    resp = lambda_client.invoke(
        FunctionName=REPORT_GENERATOR_FUNCTION_NAME,
        InvocationType="RequestResponse",
        Payload=json.dumps({"project_id": project_id, "days": days}).encode("utf-8"),
    )

    # An unhandled exception inside the report generator surfaces as FunctionError.
    if resp.get("FunctionError"):
        raw = resp["Payload"].read().decode("utf-8", "replace")
        return error_response(502, f"Report generation failed: {raw[:300]}")

    payload = json.loads(resp["Payload"].read() or "{}")
    inner_status = payload.get("statusCode", 502)
    inner_body = json.loads(payload.get("body") or "{}")

    if inner_status == 200:
        return success(200, {
            "message": "Report generated",
            "report_id": inner_body.get("report_id"),
            "days": days,
        })
    if inner_status == 404:
        return error_response(404, "Project not found")
    return error_response(502, "Report generation failed")


def lambda_handler(event: dict, context) -> dict:
    method = event["requestContext"]["http"]["method"]
    path = event["requestContext"]["http"]["path"]
    path_params = event.get("pathParameters") or {}

    try:
        if method == "POST" and path == "/me":
            return handle_post_me(event)

        if method == "PUT" and path == "/me":
            return handle_put_me(event)

        if method == "POST" and path == "/projects":
            return handle_post_projects(event)

        # POST /projects/{project_id}/reports  (the only POST with a path param)
        if method == "POST" and path_params.get("project_id"):
            return handle_generate_report(event)

        if method == "PUT" and path_params.get("project_id"):
            return handle_put_projects_id(event)

        if method == "DELETE" and path_params.get("project_id"):
            return handle_delete_projects_id(event)

        return error_response(404, "Not found")

    except json.JSONDecodeError:
        return error_response(400, "Invalid JSON in request body")

    except ClientError as e:
        logger.error(f"AWS error on {method} {path}: {e}")
        return error_response(500, "Internal error")

    except Exception:
        logger.exception(f"Unhandled error on {method} {path}")
        return error_response(500, "Internal error")