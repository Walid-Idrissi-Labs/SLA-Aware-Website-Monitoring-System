output "deployment_info" {
  value = {
    region      = var.aws_region
    environment = var.environment
    account_id  = data.aws_caller_identity.current.account_id
    name_prefix = local.name_prefix
  }
}

output "dynamodb_table_names" {
  value = {
    users     = module.dynamodb.users_table_name
    projects  = module.dynamodb.projects_table_name
    checks    = module.dynamodb.checks_table_name
    incidents = module.dynamodb.incidents_table_name
    reports   = module.dynamodb.reports_table_name
  }
}

output "dynamodb_table_arns" {
  value = {
    users     = module.dynamodb.users_table_arn
    projects  = module.dynamodb.projects_table_arn
    checks    = module.dynamodb.checks_table_arn
    incidents = module.dynamodb.incidents_table_arn
    reports   = module.dynamodb.reports_table_arn
  }
}

output "s3_bucket_names" {
  value = {
    reports   = module.s3.reports_bucket_name
    artifacts = module.s3.artifacts_bucket_name
  }
}

output "s3_bucket_arns" {
  value = {
    reports   = module.s3.reports_bucket_arn
    artifacts = module.s3.artifacts_bucket_arn
  }
}

output "lambda_role_arns" {
  value = {
    monitor          = module.iam.monitor_lambda_role_arn
    sla_processor    = module.iam.sla_processor_lambda_role_arn
    report_generator = module.iam.report_generator_lambda_role_arn
    api              = module.iam.api_lambda_role_arn
    project_manager  = module.iam.project_manager_lambda_role_arn
  }
}

output "api_gateway_endpoint" {
  description = "Base URL for API Gateway. Use this as VITE_API_GATEWAY_URL in the frontend."
  value       = module.apigateway.api_endpoint
}

output "cognito_hosted_ui_url" {
  description = "Cognito Hosted UI base URL — append /login?client_id=<client_id>&redirect_uri=<frontend_url>/callback&response_type=token&scope=openid+email+profile"
  value       = "https://${module.cognito.user_pool_domain_name}.auth.${var.aws_region}.amazoncognito.com"
}

output "cognito_user_pool_domain" {
  description = "Cognito User Pool Domain for hosted UI"
  value       = module.cognito.user_pool_domain_name
}

output "cognito_app_client_id" {
  description = "Cognito App Client ID for frontend config"
  value       = module.cognito.app_client_id
}