resource "aws_cognito_user_pool" "main" {
  name = "${var.name_prefix}-user-pool"

  # email-based sign-in
  username_attributes = ["email"]

  password_policy {
    minimum_length    = 8
    require_lowercase = false 
    require_numbers    = true
    require_symbols    = true
    require_uppercase  = true
  }

#users can register themselves without admin.
  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  email_verification_subject = "Verify your email for SLA Monitor"
  email_verification_message = <<-EOF
    Welcome to SLA Monitor! Click the link below to verify your email address:
    {####}
  EOF


  #Cognito's managed email sender for verification emails.
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  mfa_configuration = "OFF"


  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = false
  }

  schema {
    name                = "name"
    attribute_data_type = "String"
    required            = false
    mutable             = true
  }

  tags = {
    Name        = "${var.name_prefix}-user-pool"
  }
}



resource "aws_cognito_user_pool_domain" "main" {
  domain       = "${var.name_prefix}-auth"
  user_pool_id = aws_cognito_user_pool.main.id

  # Cognito pre-built hosted login/singup UI
}



resource "aws_cognito_user_pool_client" "app_client" {
  name         = "${var.name_prefix}-app-client"
  user_pool_id = aws_cognito_user_pool.main.id


  generate_secret = false


  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]


  allowed_oauth_scopes = var.allowed_oauth_scopes

  allowed_oauth_flows = ["implicit"]

  #TODO : once CloudFront is done
  callback_urls = var.callback_urls
  logout_urls   = var.logout_urls

  access_token_validity  = 1   # hours
  id_token_validity      = 1   # hours
  refresh_token_validity = 30  # days

  #token recoked on logour
  enable_token_revocation = true
}