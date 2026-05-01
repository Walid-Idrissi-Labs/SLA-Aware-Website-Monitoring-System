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
    dashboard = module.s3.dashboard_bucket_name
    reports   = module.s3.reports_bucket_name
    artifacts = module.s3.artifacts_bucket_name
  }
}

output "s3_bucket_arns" {
  value = {
    dashboard = module.s3.dashboard_bucket_arn
    reports   = module.s3.reports_bucket_arn
    artifacts = module.s3.artifacts_bucket_arn
  }
}





output "lambda_role_arns" {
  description = <<-EOT
    ARNs of all Lambda IAM execution roles. These will be consumed by the Lambda
    module in the next Terraform session when creating the actual Lambda functions.
    Each Lambda function will reference its corresponding role ARN here.
  EOT
  value = {
    monitor         = module.iam.monitor_lambda_role_arn
    sla_processor   = module.iam.sla_processor_lambda_role_arn
    report_generator = module.iam.report_generator_lambda_role_arn
    api             = module.iam.api_lambda_role_arn
    project_manager = module.iam.project_manager_lambda_role_arn
  }
}