resource "aws_dynamodb_table" "users" {
  name         = "${var.name_prefix}-users-table"
  billing_mode = "PAY_PER_REQUEST"

  hash_key = "user_id"

  attribute {
    name = "user_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  deletion_protection_enabled = false

  tags = {
    Name        = "${var.name_prefix}-users-table"
    Description = "Application-level user preferences and profile data"
  }
}


resource "aws_dynamodb_table" "projects" {
  name         = "${var.name_prefix}-projects-table"
  billing_mode = "PAY_PER_REQUEST"

  hash_key = "project_id"

  attribute {
    name = "project_id"
    type = "S"
  }

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "created_at"
    type = "S"
  }

  global_secondary_index {
    name            = "UserProjectsIndex"

    hash_key        = "user_id"
    range_key      = "created_at"

    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  deletion_protection_enabled = false

  tags = {
    Name        = "${var.name_prefix}-projects-table"
    Description = "one record per website being tracked"
  }
}



resource "aws_dynamodb_table" "checks" {
  name         = "${var.name_prefix}-checks-table"
  billing_mode = "PAY_PER_REQUEST"

  hash_key  = "project_id" 
  range_key = "timestamp"  

  attribute {
    name = "project_id"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "N" 
  }

  #ttl = 90days, defined in sla-monitor-lambda
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  
  point_in_time_recovery {
    enabled = false
  }

  
  deletion_protection_enabled = false

  tags = {
    Name        = "${var.name_prefix}-checks-table"
    Description = "Raw HTTP check results - TTL: 90 days."
  }
}





resource "aws_dynamodb_table" "incidents" {
  name         = "${var.name_prefix}-incidents-table"
  billing_mode = "PAY_PER_REQUEST"

  hash_key  = "project_id"
  range_key = "start_time"

  attribute {
    name = "project_id"
    type = "S"
  }

  attribute {
    name = "start_time"
    type = "N" 
  }

  point_in_time_recovery {
    enabled = true
  }

  deletion_protection_enabled = false

  tags = {
    Name        = "${var.name_prefix}-incidents-table"
  }
}



resource "aws_dynamodb_table" "reports" {
  name         = "${var.name_prefix}-reports-table"
  billing_mode = "PAY_PER_REQUEST"

  hash_key  = "project_id"
  range_key = "report_id"

  attribute {
    name = "project_id"
    type = "S"
  }

  attribute {
    name = "report_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  deletion_protection_enabled = false

  tags = {
    Name        = "${var.name_prefix}-reports-table"
  }
}
