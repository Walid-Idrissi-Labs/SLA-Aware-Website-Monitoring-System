import json
import os
import uuid
from decimal import Decimal
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError




dynamodb = boto3.resource("dynamodb")
users_table =    dynamodb.Table(os.environ["USERS_TABLE_NAME"])
projects_table = dynamodb.Table(os.environ["PROJECTS_TABLE_NAME"])

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
        update_parts.append("#dn = :dn")
        expression_names["#dn"] = "display_name"
        expression_values[":dn"] = body["display_name"]

    if "notification_email" in body:
        update_parts.append("#ne = :ne")
        expression_names["#ne"] = "notification_email"
        expression_values[":ne"] = body["notification_email"]

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


    name = body.get("name")
    url = body.get("url")

    if not name or not url:
        return error_response(400, "name and url are required")


    failure_threshold = body.get("failure_threshold", 3)
    notification_email = body.get("notification_email", user_email)
    thresholds = floats_to_decimal(body.get(
        "thresholds",
        {"min_uptime_pct": 99.9, "max_avg_latency_ms": 300},
    ))
    now = datetime.now(timezone.utc).isoformat()

    project = {
        "project_id": str(uuid.uuid4()),
        "user_id": user_id,
        "name": name,
        "url": url,
        "active": True,
        "failure_threshold": failure_threshold,
        "thresholds": thresholds,
        "notification_email": notification_email,
        "created_at": now,
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
    body = floats_to_decimal(body)

    if not body:
        return error_response(400, "No fields provided")

    # Map allowed fields
    allowed_fields = [
        "name", "url", "active", "failure_threshold", "thresholds", "notification_email"
    ]

    update_parts = []
    expression_values = {}
    expression_names = {}

    for field in allowed_fields:
        if field in body:
            attr_name = "#" + field
            attr_value = body[field]
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

        if method == "PUT" and path_params.get("project_id"):
            project_id = path_params["project_id"]
            event["pathParameters"]["project_id"] = project_id
            return handle_put_projects_id(event)

        if method == "DELETE" and path_params.get("project_id"):
            project_id = path_params["project_id"]
            event["pathParameters"]["project_id"] = project_id
            return handle_delete_projects_id(event)

        return error_response(404, "Not found")

    except ClientError as e:
        return error_response(500, f"Database error: {e.response['Error']['Message']}")

    except json.JSONDecodeError:
        return error_response(400, "Invalid JSON in request body")

    except Exception as e:
        return error_response(500, f"Internal error: {str(e)}")