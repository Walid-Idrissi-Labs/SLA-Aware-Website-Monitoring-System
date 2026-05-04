terraform {

  cloud {
    
    organization = "Walids-Labs"

    workspaces {
      name = "SLA-Aware-Monitor-Workspace"
    }
  }
}


provider "aws" {
  region = var.aws_region


  default_tags {
    tags = {
      Project     = "sla-monitor"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}


data "aws_caller_identity" "current" {}
data "aws_region" "current" {}


locals {
  account_suffix = substr(data.aws_caller_identity.current.account_id, -8, 8)

  name_prefix = "${var.project_slug}-${var.environment}"

  account_id = data.aws_caller_identity.current.account_id

  region = data.aws_region.current.name
}



module "dynamodb" {
  source = "./modules/dynamodb"

  name_prefix = local.name_prefix
}


module "s3" {
  source = "./modules/s3"

  name_prefix    = local.name_prefix
  account_suffix = local.account_suffix
}


module "iam" {
  source = "./modules/iam"

  name_prefix = local.name_prefix
  account_id  = local.account_id
  region      = local.region


  users_table_arn     = module.dynamodb.users_table_arn
  projects_table_arn  = module.dynamodb.projects_table_arn
  checks_table_arn    = module.dynamodb.checks_table_arn
  incidents_table_arn = module.dynamodb.incidents_table_arn
  reports_table_arn   = module.dynamodb.reports_table_arn


  projects_gsi_arn = module.dynamodb.projects_gsi_arn


  reports_bucket_arn   = module.s3.reports_bucket_arn
  artifacts_bucket_arn = module.s3.artifacts_bucket_arn


  ssm_parameter_prefix = "/sla-monitor/${var.environment}/*"
}






resource "aws_cloudwatch_event_rule" "monitor" {
  name           = "${local.name_prefix}-monitor-rule-prod"
  description    = "Fires every minute to trigger the Monitor Lambda"
  schedule_expression = "rate(1 minute)"

  tags = {
    FunctionName = "monitor"
    Schedule      = "rate(1 minute)"
  }
}


resource "aws_cloudwatch_event_rule" "sla_processor" {
  name           = "${local.name_prefix}-processor-rule-prod"
  description    = "Fires every hour at :00 UTC to trigger the SLA Processor Lambda"
  schedule_expression = "cron(0 * * * ? *)"

  tags = {
    FunctionName = "sla_processor"
    Schedule      = "cron(0 * * * ? *)"
  }
}


resource "aws_cloudwatch_event_rule" "report_generator" {
  name           = "${local.name_prefix}-reporter-rule-prod"
  description    = "Fires every Monday at 08:00 UTC to trigger the Report Generator Lambda"
  schedule_expression = "cron(0 8 ? * MON *)"

  tags = {
    FunctionName = "report_generator"
    Schedule      = "cron(0 8 ? * MON *)"
  }
}



resource "aws_cloudwatch_event_target" "monitor" {
  rule      = aws_cloudwatch_event_rule.monitor.name
  target_id = "MonitorLambda"
  arn       = module.lambda_monitor.function_arn
}

resource "aws_cloudwatch_event_target" "sla_processor" {
  rule      = aws_cloudwatch_event_rule.sla_processor.name
  target_id = "SlaProcessorLambda"
  arn       = module.lambda_sla_processor.function_arn
}

resource "aws_cloudwatch_event_target" "report_generator" {
  rule      = aws_cloudwatch_event_rule.report_generator.name
  target_id = "ReportGeneratorLambda"
  arn       = module.lambda_report_generator.function_arn
}




resource "aws_lambda_permission" "allow_eventbridge_monitor" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name  = module.lambda_monitor.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.monitor.arn
}

resource "aws_lambda_permission" "allow_eventbridge_sla_processor" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name  = module.lambda_sla_processor.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.sla_processor.arn
}

resource "aws_lambda_permission" "allow_eventbridge_report_generator" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name  = module.lambda_report_generator.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.report_generator.arn
}



module "lambda_monitor" {
  source = "./modules/lambda"

  function_name = "${local.name_prefix}-monitor-lambda"
  description   = "Runs HTTP checks against all active projects per minute"
  role_arn      = module.iam.monitor_lambda_role_arn
  source_dir    = "${path.module}/lambda_src/monitor"
  artifacts_bucket_name = module.s3.artifacts_bucket_name

  environment_variables = {
    PROJECTS_TABLE_NAME        = module.dynamodb.projects_table_name
    CHECKS_TABLE_NAME          = module.dynamodb.checks_table_name
    SES_SENDER_PARAM_PATH      = "/sla-monitor/${var.environment}/ses/sender-email"
    FAILURE_THRESHOLD_DEFAULT  = "3"
    HTTP_TIMEOUT_SECONDS        = "10"
  }

  eventbridge_rule_arns    = [aws_cloudwatch_event_rule.monitor.arn]
  api_gateway_execution_arn = ""
}

module "lambda_sla_processor" {
  source = "./modules/lambda"

  function_name = "${local.name_prefix}-sla-processor-lambda"
  description   = "Hourly SLA breach detection and incident management"
  role_arn      = module.iam.sla_processor_lambda_role_arn
  source_dir    = "${path.module}/lambda_src/sla_processor"
  artifacts_bucket_name = module.s3.artifacts_bucket_name

  memory_mb       = 512
  timeout_seconds = 300
  log_retention_days = 14

  environment_variables = {
    PROJECTS_TABLE_NAME  = module.dynamodb.projects_table_name
    CHECKS_TABLE_NAME    = module.dynamodb.checks_table_name
    INCIDENTS_TABLE_NAME = module.dynamodb.incidents_table_name
    FAILURE_THRESHOLD_DEFAULT  = "3"
  }

  eventbridge_rule_arns    = [aws_cloudwatch_event_rule.sla_processor.arn]
  api_gateway_execution_arn = ""
}

module "lambda_report_generator" {
  source = "./modules/lambda"

  function_name = "${local.name_prefix}-report-generator-lambda"
  description   = "Weekly SLA report generation and email distribution"
  role_arn      = module.iam.report_generator_lambda_role_arn
  source_dir    = "${path.module}/lambda_src/report_generator"
  artifacts_bucket_name = module.s3.artifacts_bucket_name

  memory_mb       = 512
  timeout_seconds = 300
  log_retention_days = 30

  environment_variables = {
    PROJECTS_TABLE_NAME   = module.dynamodb.projects_table_name
    CHECKS_TABLE_NAME     = module.dynamodb.checks_table_name
    INCIDENTS_TABLE_NAME  = module.dynamodb.incidents_table_name
    REPORTS_TABLE_NAME    = module.dynamodb.reports_table_name
    REPORTS_BUCKET_NAME   = module.s3.reports_bucket_name
    SES_SENDER_PARAM_PATH = "/sla-monitor/${var.environment}/ses/sender-email"
  }

  eventbridge_rule_arns    = [aws_cloudwatch_event_rule.report_generator.arn]
  api_gateway_execution_arn = ""
}

module "lambda_api" {
  source = "./modules/lambda"

  function_name = "${local.name_prefix}-api-lambda"
  description   = "REST API handler for dashboard backend"
  role_arn      = module.iam.api_lambda_role_arn
  source_dir    = "${path.module}/lambda_src/api"
  artifacts_bucket_name = module.s3.artifacts_bucket_name

  memory_mb = 256
  timeout_seconds = 10
  log_retention_days = 7

  environment_variables = {
    USERS_TABLE_NAME    = module.dynamodb.users_table_name
    PROJECTS_TABLE_NAME = module.dynamodb.projects_table_name
    PROJECT_GSI_NAME = module.dynamodb.projects_gsi_name
    CHECKS_TABLE_NAME   = module.dynamodb.checks_table_name
    INCIDENTS_TABLE_NAME = module.dynamodb.incidents_table_name
    REPORTS_TABLE_NAME  = module.dynamodb.reports_table_name
  }

  eventbridge_rule_arns    = []
  api_gateway_execution_arn = ""
}

module "lambda_project_manager" {
  source = "./modules/lambda"

  function_name = "${local.name_prefix}-project-manager-lambda"
  description   = "User and project lifecycle management"
  role_arn      = module.iam.project_manager_lambda_role_arn
  source_dir    = "${path.module}/lambda_src/project_manager"
  artifacts_bucket_name = module.s3.artifacts_bucket_name

  memory_mb = 256
  timeout_seconds = 10
  log_retention_days = 7

  environment_variables = {
    USERS_TABLE_NAME    = module.dynamodb.users_table_name
    PROJECTS_TABLE_NAME = module.dynamodb.projects_table_name
  }

  eventbridge_rule_arns    = []
  api_gateway_execution_arn = ""
}
