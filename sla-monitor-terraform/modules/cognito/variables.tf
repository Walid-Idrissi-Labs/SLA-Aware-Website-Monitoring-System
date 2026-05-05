variable "name_prefix" {
  type        = string
}






variable "callback_urls" {
  description = "Allowed OAuth callback URLs (CloudFront domain + /callback)"
  type        = list(string)
  default     = ["http://localhost:3000/callback"]
}

variable "logout_urls" {
  description = "Allowed OAuth logout URLs (CloudFront domain + /login)"
  type        = list(string)
  default     = ["http://localhost:3000/login"]
}

variable "allowed_oauth_scopes" {
  description = "OAuth scopes requested by the frontend app client"
  type        = list(string)
  default     = ["openid", "email", "profile"]
}