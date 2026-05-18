terraform {
  required_version = ">= 1.8.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.50" }
  }
}

variable "name_prefix" { type = string }
variable "tags" {
  type    = map(string)
  default = {}
}

# Per ForgeMsg architecture (CLAUDE.md): contact uploads, exports, and
# deliverability log archives are S3-backed. Each bucket is isolated so
# lifecycle policies can differ.
locals {
  buckets = {
    uploads        = { lifecycle_days = 0 } # keep indefinitely
    exports        = { lifecycle_days = 30 }
    deliverability = { lifecycle_days = 365 }
  }
}

resource "aws_s3_bucket" "this" {
  for_each = local.buckets
  bucket   = "${var.name_prefix}-${each.key}"
  tags     = var.tags
}

resource "aws_s3_bucket_versioning" "this" {
  for_each = aws_s3_bucket.this
  bucket   = each.value.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  for_each = aws_s3_bucket.this
  bucket   = each.value.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "this" {
  for_each                = aws_s3_bucket.this
  bucket                  = each.value.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "this" {
  for_each = { for k, v in local.buckets : k => v if v.lifecycle_days > 0 }
  bucket   = aws_s3_bucket.this[each.key].id

  rule {
    id     = "${each.key}-expire"
    status = "Enabled"

    filter {}

    expiration {
      days = each.value.lifecycle_days
    }

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

output "bucket_arns" {
  value = { for k, v in aws_s3_bucket.this : k => v.arn }
}

output "bucket_names" {
  value = { for k, v in aws_s3_bucket.this : k => v.id }
}
