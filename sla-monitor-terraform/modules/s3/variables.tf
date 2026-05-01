variable "name_prefix" {
  type        = string
}

variable "account_suffix" {
  description = "last 8 characters of the AWS accountID, to guarantee global uniqueness"
  type        = string
}
