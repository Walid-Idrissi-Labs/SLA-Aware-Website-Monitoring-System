variable "name_prefix" {
  type = string
}





variable "callback_urls" {
  description = "Allowed OAuth callback URLs (frontend domain + /callback)"
  type        = list(string)
}

variable "logout_urls" {
  description = "Allowed OAuth logout URLs (frontend domain + /login)"
  type        = list(string)
}

variable "allowed_oauth_scopes" {
  description = "OAuth scopes requested by the frontend app client"
  type        = list(string)
  default     = ["openid", "email", "profile"]
}


variable "google_client_id" {
  description = "Google OAuth Client ID"
  type        = string
}

variable "google_client_secret" {
  description = "Google OAuth Client Secret"
  type        = string
  sensitive   = true
}