resource "aws_s3_bucket" "reports" {
  bucket = "${var.name_prefix}-reports-${var.account_suffix}"

  # Regenerated content (report JSON/HTML) - shouldn't block `terraform destroy`
  # on the demo teardown/redeploy cycle.
  force_destroy = true

  tags = {
    Name = "${var.name_prefix}-reports-${var.account_suffix}"
  }
}

resource "aws_s3_bucket_public_access_block" "reports" {
  bucket = aws_s3_bucket.reports.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "reports" {
  bucket = aws_s3_bucket.reports.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "reports" {
  bucket = aws_s3_bucket.reports.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "reports" {
  bucket = aws_s3_bucket.reports.id

  rule {
    id     = "archive-old-reports"
    status = "Enabled"

    filter {}

    transition {
      days          = 365
      storage_class = "GLACIER"
    }
  }

  rule {
    id     = "cleanup-old-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }

  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 2
    }
  }
}

resource "aws_s3_bucket" "artifacts" {
  bucket = "${var.name_prefix}-lambda-artifacts-${var.account_suffix}"

  # Regenerated content (Lambda deployment packages) - shouldn't block
  # `terraform destroy` on the demo teardown/redeploy cycle.
  force_destroy = true

  tags = {
    Name = "${var.name_prefix}-lambda-artifacts-${var.account_suffix}"
  }
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    id     = "expire-old-lambda-zips"
    status = "Enabled"

    filter {
      prefix = "lambda/"
    }

    noncurrent_version_expiration {
      noncurrent_days = 7
    }
  }
}