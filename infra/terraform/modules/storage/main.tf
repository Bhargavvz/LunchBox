terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.70" }
  }
}

variable "name" { type = string }
variable "app_task_role_arn" { type = string }
variable "handover_retention_days" {
  type    = number
  default = 90
}
variable "kyc_noncurrent_retention_days" {
  type    = number
  default = 365
}
variable "upload_origins" { type = list(string) }

data "aws_caller_identity" "current" {}

resource "aws_kms_key" "this" {
  description             = "${var.name} data key (RDS, Redis, MQ, S3, secrets)"
  enable_key_rotation     = true
  deletion_window_in_days = 30
}

resource "aws_kms_alias" "this" {
  name          = "alias/${var.name}"
  target_key_id = aws_kms_key.this.key_id
}

locals {
  buckets = {
    handover = { name = "${var.name}-handover", expire_days = var.handover_retention_days }
    kyc      = { name = "${var.name}-kyc", expire_days = 0 }
  }
}

resource "aws_s3_bucket" "this" {
  for_each      = local.buckets
  bucket        = each.value.name
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "this" {
  for_each                = aws_s3_bucket.this
  bucket                  = each.value.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "this" {
  for_each = aws_s3_bucket.this
  bucket   = each.value.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  for_each = aws_s3_bucket.this
  bucket   = each.value.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.this.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_versioning" "kyc" {
  bucket = aws_s3_bucket.this["kyc"].id
  versioning_configuration {
    status = "Enabled"
  }
}

# Handover photos are evidence for disputes only: expire after the retention period (DPDP purpose limitation).
resource "aws_s3_bucket_lifecycle_configuration" "handover" {
  bucket = aws_s3_bucket.this["handover"].id
  rule {
    id     = "expire-handover-photos"
    status = "Enabled"
    filter {}
    expiration {
      days = var.handover_retention_days
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "kyc" {
  bucket = aws_s3_bucket.this["kyc"].id
  rule {
    id     = "kyc-noncurrent"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = var.kyc_noncurrent_retention_days
    }
    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "this" {
  for_each = aws_s3_bucket.this
  bucket   = each.value.id
  cors_rule {
    allowed_methods = ["PUT", "GET"]
    allowed_origins = var.upload_origins
    allowed_headers = ["Content-Type", "x-amz-server-side-encryption", "x-amz-server-side-encryption-aws-kms-key-id"]
    max_age_seconds = 600
  }
}

# Deny non-TLS access and uploads without KMS encryption.
resource "aws_s3_bucket_policy" "this" {
  for_each = aws_s3_bucket.this
  bucket   = each.value.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [each.value.arn, "${each.value.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
      {
        Sid       = "AppAccessOnly"
        Effect    = "Deny"
        Principal = "*"
        Action    = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource  = "${each.value.arn}/*"
        Condition = {
          StringNotEquals = {
            "aws:PrincipalArn" = [var.app_task_role_arn, "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
          }
        }
      }
    ]
  })
}

output "kms_key_arn" { value = aws_kms_key.this.arn }
output "kms_key_id" { value = aws_kms_key.this.key_id }
output "handover_bucket" { value = aws_s3_bucket.this["handover"].bucket }
output "kyc_bucket" { value = aws_s3_bucket.this["kyc"].bucket }
output "bucket_arns" { value = [for b in aws_s3_bucket.this : b.arn] }
