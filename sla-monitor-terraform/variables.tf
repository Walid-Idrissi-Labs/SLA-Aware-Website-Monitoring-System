variable "aws_region" {
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  type        = string
  default     = "prod"

}

variable "project_slug" {
  description = "prefix for all resource names in this project"
  type        = string
  default     = "sla-monitor"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]+[a-z0-9]$", var.project_slug))
    error_message = "project_slug must be lowercase alphanumeric with hyphens, e.g. sla-monitor."
  }
}


variable "ses_sender_email" {
  type = string
  description = "User-verified SES sender email"
  default = ""
}