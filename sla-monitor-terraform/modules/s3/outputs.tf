output "dashboard_bucket_name" {
  value = aws_s3_bucket.dashboard.id
}

output "dashboard_bucket_arn" {
  value = aws_s3_bucket.dashboard.arn
}


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



output "dashboard_bucket_regional_domain" {
  description = "what CloudFront uses as the origin domain"
   value = aws_s3_bucket.dashboard.bucket_regional_domain_name
}