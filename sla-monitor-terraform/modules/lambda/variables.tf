variable "function_name" {
  type        = string
}

variable "description" {
  type        = string
}

variable "handler" {
  type    = string
  default = "handler.lambda_handler"
}

variable "runtime" {
  type    = string
  default = "python3.12"
}

variable "role_arn" {
  type = string
}



variable "source_dir" {
  type = string
}

variable "artifacts_bucket_name" {
  type = string
}




variable "memory_mb" {
  type    = number
  default = 256

  validation {
    condition     = contains([128, 256, 512, 1024, 1769, 2048, 3008, 4096, 5120, 6144, 7168, 8192, 10240], var.memory_mb)
    error_message = "memory_mb not valid Lambda memory allocation"
  }
}

variable "timeout_seconds" {
  type    = number
  default = 30

  validation {
    condition     = var.timeout_seconds >= 1 && var.timeout_seconds <= 900
    error_message = "timeout_seconds must be between 1 and 900 (15 minutes, Lambda maximum)."
  }
}

variable "environment_variables" {
  type    = map(string)
  default = {}
}

variable "log_retention_days" {
  type    = number
  default = 14
}




variable "eventbridge_rule_arns" {
  type    = list(string)
  default = []
}

variable "api_gateway_execution_arn" {
  type    = string
  default = ""
}



variable "enable_api_gateway_permission" {
  type = bool
  default = false
  description = "Whether to create the API Gateway invoke permission for this lambda"
}


variable "layer_arns" {
  description = "list of Lambda Layer ARNs to attach to the function"
  type       = list(string)
  default    = []
}