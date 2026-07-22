variable "name_prefix" {
  type = string
}

variable "cognito_user_pool_id" {
  type = string
}

variable "cognito_app_client_id" {
  type = string
}

variable "api_lambda_invoke_arn" {
  type        = string
  description = "Invoke ARN for the API Lambda integration"
}

variable "project_manager_lambda_invoke_arn" {
  type        = string
  description = "Invoke ARN for the Project Manager Lambda integration"
}
