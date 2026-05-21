variable "name_prefix" {
  type        = string
}

variable "cognito_user_pool_id" {
  type        = string
}

variable "cognito_app_client_id" {
  type        = string
}

variable "api_lambda_invoke_arn" {
  type        = string
  description = "Invoke ARN for the API Lambda integration"
}

variable "project_manager_lambda_invoke_arn" {
  type        = string
  description = "Invoke ARN for the Project Manager Lambda integration"
}

variable "api_lambda_qualified_arn" {
  type        = string
  default     = null
  #!integration_uri for AWS_PROXY must be the Lambda's invoke_arn
  description = "Deprecated. Use api_lambda_invoke_arn instead"
}

variable "project_manager_lambda_qualified_arn" {
  type        = string
  default     = null
  #!integration_uri for AWS_PROXY must be the Lambda's invoke_arn
  description = "Deprecated. Use project_manager_lambda_invoke_arn instead"
}
