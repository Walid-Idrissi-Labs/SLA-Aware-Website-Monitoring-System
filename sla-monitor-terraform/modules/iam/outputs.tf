output "monitor_lambda_role_arn" {
  value = aws_iam_role.monitor_lambda.arn
}

output "sla_processor_lambda_role_arn" {
  value = aws_iam_role.sla_processor_lambda.arn
}

output "report_generator_lambda_role_arn" {
  value = aws_iam_role.report_generator_lambda.arn
}

output "api_lambda_role_arn" {
  value = aws_iam_role.api_lambda.arn
}

output "project_manager_lambda_role_arn" {
  value = aws_iam_role.project_manager_lambda.arn
}
