# table Names
output "users_table_name"{
      value = aws_dynamodb_table.users.name
}

output "projects_table_name" {
      value = aws_dynamodb_table.projects.name
}

output "checks_table_name" {
      value = aws_dynamodb_table.checks.name
}

output "incidents_table_name" {
      value = aws_dynamodb_table.incidents.name
}

output "reports_table_name" {
      value = aws_dynamodb_table.reports.name
}


# table ARNs
output "users_table_arn"{
      value = aws_dynamodb_table.users.arn
}

output "projects_table_arn" {
      value = aws_dynamodb_table.projects.arn
}

output "checks_table_arn" {
      value = aws_dynamodb_table.checks.arn
}

output "incidents_table_arn" {
      value = aws_dynamodb_table.incidents.arn
}

output "reports_table_arn" {
      value = aws_dynamodb_table.reports.arn
}


output "projects_gsi_name" {
      # value = "${aws_dynamodb_table.projects.name}/index/UserProjectsIndex"
      value = "UserProjectsIndex"
}

# for IAM query
output "projects_gsi_arn" {
      value = "${aws_dynamodb_table.projects.arn}/index/UserProjectsIndex"  
}
