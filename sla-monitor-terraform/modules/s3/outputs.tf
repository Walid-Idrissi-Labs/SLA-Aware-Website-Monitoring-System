output "reports_bucket_name" {
  value = aws_s3_bucket.reports.id
}

output "reports_bucket_arn" {
  value = aws_s3_bucket.reports.arn
}

output "artifacts_bucket_name" {
  value = aws_s3_bucket.artifacts.id
}

output "artifacts_bucket_arn" {
  value = aws_s3_bucket.artifacts.arn
}