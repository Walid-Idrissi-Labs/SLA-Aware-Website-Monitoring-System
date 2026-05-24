variable "name_prefix" {
  type        = string
}





#TODO
variable "callback_urls" {
  description = "Allowed OAuth callback URLs (Vercel frontend domain + /callback). Update after Vercel deployment."
  type        = list(string)
  default     = ["https://sla-aware-website-monitoring-system.vercel.app/callback"]
}

#TODO
variable "logout_urls" {
  description = "Allowed OAuth logout URLs (Vercel frontend domain + /login). Update after Vercel deployment."
  type        = list(string)
  default     = ["https://sla-aware-website-monitoring-system.vercel.app/login"]
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
}