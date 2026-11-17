resource "aws_cognito_user_pool" "main" {
  name = "${var.name_prefix}-user-pool"

  # Email-based sign-in via an ALIAS, not as the username attribute.
  #
  # With `username_attributes = ["email"]` Cognito freezes the user's email at
  # creation, because the email *is* the username. Federated sign-in re-applies
  # the IdP attribute mapping (email -> email) on every login, which is an
  # update, so the second Google sign-in of any account fails with:
  #   invalid_request: user.email: Attribute cannot be updated.
  # `username_attributes` is create-only, so this cannot be corrected in place.
  #
  # As an alias the attribute stays writable, federated sign-in keeps working,
  # and Cognito can link a Google identity to an email/password account that
  # uses the same verified address. Sign-up must then send `email` as a real
  # attribute — see signUp() in frontend/src/lib/cognito.ts.
  alias_attributes = ["email"]

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

  schema {
    name                = "name"
    attribute_data_type = "String"
    required            = false
    mutable             = true
  }

  tags = {
    Name = "${var.name_prefix}-user-pool"
  }

  lifecycle {
    // `schema` used to be ignored because Terraform reported perpetual drift on
    // it. It has to be managed now: the email attribute's mutability is what
    // decides whether federated sign-in can work more than once.
    ignore_changes = []
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
    token_url                     = "https://oauth2.googleapis.com/token"

  }


  attribute_mapping = {
    email          = "email"
    email_verified = "email_verified"
    name           = "name"
    username       = "sub"
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