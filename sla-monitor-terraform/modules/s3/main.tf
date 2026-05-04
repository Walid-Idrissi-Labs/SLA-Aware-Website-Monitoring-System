resource "aws_s3_bucket" "dashboard" {
  bucket = "${var.name_prefix}-dashboard-${var.account_suffix}"

  tags = {
    Name = "${var.name_prefix}-dashboard-${var.account_suffix}"
  }
}

resource "aws_s3_bucket_public_access_block" "dashboard" {
  bucket = aws_s3_bucket.dashboard.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "dashboard" {
  bucket = aws_s3_bucket.dashboard.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "dashboard" {
  bucket = aws_s3_bucket.dashboard.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}







resource "aws_s3_bucket" "reports" {
  bucket = "${var.name_prefix}-reports-${var.account_suffix}"

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

    #(AWS provider now requires each rule to explicitly declare a filter block, even if it's empty)
      #in this case, this filter still applies to all objects
    filter{} 

      transition {
        days          = 60
        storage_class = "GLACIER_IR"
      }
  }

  #if a report is overwritten, old version moved to glacier instantly
  rule {
    id     = "cleanup-old-versions"
    status = "Enabled"

    filter{}

      noncurrent_version_transition {
        noncurrent_days = 3
        storage_class   = "GLACIER_IR"
      }

    noncurrent_version_expiration {
      noncurrent_days = 90 # Permanent deletion after 3 months
    }
  }


  #cleans up failed or abandoned uploads
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

  tags = {
    Name        = "${var.name_prefix}-lambda-artifacts-${var.account_suffix}"
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


