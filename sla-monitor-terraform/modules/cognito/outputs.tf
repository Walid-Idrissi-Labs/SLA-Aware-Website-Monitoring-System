data "aws_region" "current" {}

output "user_pool_id" {
  value       = aws_cognito_user_pool.main.id
}

output "user_pool_arn" {
  value       = aws_cognito_user_pool.main.arn
}

output "app_client_id" {
  description = "used as JWT audience"
  value       = aws_cognito_user_pool_client.app_client.id
}

output "user_pool_domain_name" {
  description = "Cognito hosted UI domain name"
  value       = aws_cognito_user_pool_domain.main.domain
}

output "user_pool_domain_url" {
  description = "Full hosted UI URL, frontend redirects here when unauthenticated"
  value       = "https://${aws_cognito_user_pool_domain.main.domain}.auth.us-east-1.amazoncognito.com"
}

output "issuer_url" {
  description = "JWT issuer URL for API Gateway authorizer"
  value       = "https://cognito-idp.${data.aws_region.current.name}.amazonaws.com/${aws_cognito_user_pool.main.id}"
}