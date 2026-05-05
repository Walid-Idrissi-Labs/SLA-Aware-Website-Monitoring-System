
#HTTP API
resource "aws_apigatewayv2_api" "main" {
  name          = "${var.name_prefix}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_headers = ["*"]
    allow_credentials = false  #allow any origin
    max_age = 86400 
  }

  tags = {
    Name        = "${var.name_prefix}-api"
  }
}


#MOCK integration
resource "aws_apigatewayv2_integration" "get_health" {
  api_id = aws_apigatewayv2_api.main.id

  integration_type = "MOCK"  # No Lambda invoked
  # returns a fixed response

  request_templates = {
    "application/json" = jsonencode({
      statusCode     = 200
      body           = "{\"status\":\"ok\"}"
      isBase64Encoded = false
    })
  }
}


#PROXY integrations
resource "aws_apigatewayv2_integration" "api_lambda" {
  api_id = aws_apigatewayv2_api.main.id

  integration_type     = "AWS_PROXY" 
  integration_uri       = var.api_lambda_qualified_arn  
  integration_method    = "ANY"
  payload_format_version = "2.0"
}


resource "aws_apigatewayv2_integration" "project_manager_lambda" {
  api_id = aws_apigatewayv2_api.main.id

  integration_type     = "AWS_PROXY"
  integration_uri        = var.project_manager_lambda_qualified_arn
  integration_method     = "ANY"
  payload_format_version = "2.0"
}





#Validate Cognito JWT token before invoking Lambda
resource "aws_apigatewayv2_authorizer" "jwt" {
  api_id = aws_apigatewayv2_api.main.id

  name           = "Cognito JWT Authorizer"
  authorizer_type = "JWT"  

  #validate token against Cognito JWKS
  jwt_configuration {  #tells apigw where to find public keys to verify tokens signature
    issuer   = "https://cognito-idp.${data.aws_region.current.name}.amazonaws.com/${var.cognito_user_pool_id}"
    audience = [var.cognito_app_client_id]
  }

}



#no auth
resource "aws_apigatewayv2_route" "get_health" {
  api_id = aws_apigatewayv2_api.main.id

  route_key = "GET /health"

  target = "integrations/${aws_apigatewayv2_integration.get_health.id}"

  # No authorization : public endpoint
  authorization_type = "NONE"
}


resource "aws_apigatewayv2_route" "get_me" {
  api_id = aws_apigatewayv2_api.main.id

  route_key = "GET /me"

  target = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}


resource "aws_apigatewayv2_route" "put_me" {
  api_id = aws_apigatewayv2_api.main.id

  route_key = "PUT /me"

  target = "integrations/${aws_apigatewayv2_integration.project_manager_lambda.id}"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}


resource "aws_apigatewayv2_route" "get_projects" {
  api_id = aws_apigatewayv2_api.main.id

  route_key = "GET /projects"

  target = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}


resource "aws_apigatewayv2_route" "post_projects" {
  api_id = aws_apigatewayv2_api.main.id

  route_key = "POST /projects"

  target = "integrations/${aws_apigatewayv2_integration.project_manager_lambda.id}"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

# GET /projects/{project_id} — fetch single project details
resource "aws_apigatewayv2_route" "get_projects_id" {
  api_id = aws_apigatewayv2_api.main.id

  route_key = "GET /projects/{project_id}"

  target = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}


# PUT /projects/{project_id} — update a project's configuration
resource "aws_apigatewayv2_route" "put_projects_id" {
  api_id = aws_apigatewayv2_api.main.id

  route_key = "PUT /projects/{project_id}"

  target = "integrations/${aws_apigatewayv2_integration.project_manager_lambda.id}"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}


resource "aws_apigatewayv2_route" "delete_projects_id" {
  api_id = aws_apigatewayv2_api.main.id

  route_key = "DELETE /projects/{project_id}"

  target = "integrations/${aws_apigatewayv2_integration.project_manager_lambda.id}"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}


resource "aws_apigatewayv2_route" "get_projects_status" {
  api_id = aws_apigatewayv2_api.main.id

  route_key = "GET /projects/{project_id}/status"

  target = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}


resource "aws_apigatewayv2_route" "get_projects_reports" {
  api_id = aws_apigatewayv2_api.main.id

  route_key = "GET /projects/{project_id}/reports"

  target = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}


#base url
resource "aws_apigatewayv2_stage" "default" {
  api_id = aws_apigatewayv2_api.main.id

  name = "$default" 

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_access_logs.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip            = "$context.identity.sourceIp"
      caller        = "$context.identity.caller"
      user          = "$context.identity.user"
      requestTime   = "$context.requestTime"
      httpMethod    = "$context.httpMethod"
      resourcePath  = "$context.resourcePath"
      status        = "$context.status"
      protocol      = "$context.protocol"
      responseLength = "$context.responseLength"
      routeKey      = "$context.routeKey"
      errorMessage  = "$context.error.message"
      authorizerId  = "$context.authorizer.id"
    })
  }

  deployment_id = aws_apigatewayv2_deployment.main.id


  client_certificate_id = null 

  tags = {
    Name = "${var.name_prefix}-api-stage"
  }
}



resource "aws_apigatewayv2_deployment" "main" {
  api_id = aws_apigatewayv2_api.main.id

  triggers = {
    route_config = sha256(jsonencode([
      aws_apigatewayv2_route.get_health.route_key,
      aws_apigatewayv2_route.get_me.route_key,
      aws_apigatewayv2_route.put_me.route_key,
      aws_apigatewayv2_route.get_projects.route_key,
      aws_apigatewayv2_route.get_projects_id.route_key,
      aws_apigatewayv2_route.post_projects.route_key,
      aws_apigatewayv2_route.put_projects_id.route_key,
      aws_apigatewayv2_route.delete_projects_id.route_key,
      aws_apigatewayv2_route.get_projects_status.route_key,
      aws_apigatewayv2_route.get_projects_reports.route_key,
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }
}




resource "aws_cloudwatch_log_group" "api_access_logs" {
  name              = "/aws/apigateway/${var.name_prefix}-api-access-logs"
  retention_in_days = 7

  tags = {
    Name        = "${var.name_prefix}-api-access-logs"
    Description = "API Gateway access logs for SLA Monitor"
  }
}