resource "aws_cognito_user_pool" "main" {
  name = "${var.name_prefix}-user-pool"

  # The email is the sign-in name, not an alias. With an alias, only the last
  # account to verify an address can sign in with it, so a Google account and a
  # password account on the same address could lock each other out.
  # Create-only: changing this replaces the pool.
  username_attributes = ["email"]

  #*tells cognito to auto send email (and to treat the email as verified)
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 8
    require_lowercase = false
    require_numbers   = true
    require_symbols   = true
    require_uppercase = true
  }

  #users can register themselves without admin.
  admin_create_user_config {
    allow_admin_create_user_only = false
  }


  email_verification_subject = "SLA Monitor : Verify Your Email Address"
  email_verification_message = <<-EOF
    Welcome to SLA Monitor!
    
    Your verification code is: {####}
    
    Enter this code on the verification page to complete your registration.
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
    // Must stay mutable. An IdP attribute mapping that writes an immutable
    // attribute only succeeds on the sign-in that creates the user; every later
    // sign-in fails with "user.email: Attribute cannot be updated".
    mutable = true
  }

  # No `name` block: it is a standard attribute and already optional + mutable.
  # Declaring those defaults makes the provider drop it from state, then try to
  # add it back as a custom attribute on every apply.

  tags = {
    Name = "${var.name_prefix}-user-pool"
  }

}



resource "aws_cognito_user_pool_domain" "main" {
  domain       = "${var.name_prefix}-auth"
  user_pool_id = aws_cognito_user_pool.main.id

  # Cognito pre-built hosted login/singup UI
}


resource "aws_cognito_identity_provider" "google" {
  user_pool_id  = aws_cognito_user_pool.main.id
  provider_name = "Google"
  provider_type = "Google"

  provider_details = {
    client_id                     = var.google_client_id
    client_secret                 = var.google_client_secret
    authorize_scopes              = "openid email profile"
    attributes_url                = "https://people.googleapis.com/v1/people/me?personFields="
    attributes_url_add_attributes = "true"
    authorize_url                 = "https://accounts.google.com/o/oauth2/v2/auth"
    oidc_issuer                   = "https://accounts.google.com"
    token_request_method          = "POST"
    # Cognito pins Google's endpoints and returns this value whatever is sent;
    # anything else shows up as a change on every plan.
    token_url = "https://www.googleapis.com/oauth2/v4/token"

  }


  attribute_mapping = {
    email    = "email"
    name     = "name"
    username = "sub"
  }

}



resource "aws_cognito_user_pool_client" "app_client" {
  name         = "${var.name_prefix}-app-client"
  user_pool_id = aws_cognito_user_pool.main.id


  generate_secret = false


  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  allowed_oauth_flows_user_pool_client = true

  allowed_oauth_scopes = var.allowed_oauth_scopes

  # allowed_oauth_flows = ["implicit"] #! deprecated by AWS
  allowed_oauth_flows = ["code"]

  callback_urls = var.callback_urls
  logout_urls   = var.logout_urls

  supported_identity_providers = ["COGNITO", "Google"]

  access_token_validity  = 1  # hours
  id_token_validity      = 1  # hours
  refresh_token_validity = 30 # days

  #token recoked on logour
  enable_token_revocation = true

  depends_on = [aws_cognito_identity_provider.google]
}


resource "aws_cognito_user_pool_ui_customization" "this" {
  user_pool_id = aws_cognito_user_pool.main.id
  client_id    = aws_cognito_user_pool_client.app_client.id
  css          = file("${path.module}/hosted-ui.css")
}