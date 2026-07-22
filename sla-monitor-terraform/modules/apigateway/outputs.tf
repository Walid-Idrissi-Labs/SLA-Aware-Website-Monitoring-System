data "aws_region" "current" {}

output "api_id" {
  value = aws_apigatewayv2_api.main.id
}

output "api_execution_arn" {
  description = "passed to Lambda modules to grant invoke permission"
  value       = aws_apigatewayv2_api.main.execution_arn
}

output "api_arn" {
  value = aws_apigatewayv2_api.main.arn
}

output "api_endpoint" {
  description = "frontend API base URL"
  value       = aws_apigatewayv2_api.main.api_endpoint
}

output "stage_name" {
  description = "($default)"
  value       = aws_apigatewayv2_stage.default.name
}

output "authorizer_id" {
  value = aws_apigatewayv2_authorizer.jwt.id
}