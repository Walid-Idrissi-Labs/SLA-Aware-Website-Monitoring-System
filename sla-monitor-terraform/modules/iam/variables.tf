variable "name_prefix" {
  type        = string
}

variable "account_id" {
  type        = string
}

variable "region" {
  type        = string
}


variable "users_table_arn" {
  type        = string
}

variable "projects_table_arn" {
  type        = string
}

variable "projects_gsi_arn" {
  type        = string
}

variable "checks_table_arn" {
  type        = string
}

variable "incidents_table_arn" {
  type        = string
}

variable "reports_table_arn" {
  type        = string
}



variable "reports_bucket_arn" {
  type        = string
}

variable "artifacts_bucket_arn" {
  type        = string
}


variable "ssm_parameter_prefix" {
  type        = string
}
