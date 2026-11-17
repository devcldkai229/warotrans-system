# Evidence storage on the EXISTING bucket (created before Terraform; brought in with import blocks, never recreated).
#
# Raw segments:      raw/transport-requests/...   private; robots PUT through presigned URLs; S3 -> SQS on .avi only
# Playback (HLS):    playback/transport-requests/... private; read only by CloudFront (OAC)
# Map assets:        maps/...                     public read, as before Terraform (the only prefix that stays public)
#
# Bucket-wide resources (policy, lifecycle, notification, public access block) replace what is there on apply. What
# existed on 2026-11-17 (read before writing this): SSE-S3 with bucket key, BucketOwnerEnforced, public access block
# all false, a policy giving s3:GetObject on EVERY object to everyone, no lifecycle, no notification, no CORS. The
# policy below keeps public read for maps/ only: raw evidence must never be public.

resource "aws_s3_bucket" "this" {
  bucket = var.bucket_name

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_ownership_controls" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# ACLs are off (BucketOwnerEnforced). Public *policy* must stay allowed while maps/ is served publicly; when the map
# assets move behind presigned URLs (docs/security/01, known gap), set block_public_policy / restrict_public_buckets.
resource "aws_s3_bucket_public_access_block" "this" {
  bucket                  = aws_s3_bucket.this.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = !var.public_map_assets
  restrict_public_buckets = !var.public_map_assets
}

data "aws_iam_policy_document" "bucket" {
  dynamic "statement" {
    for_each = var.public_map_assets ? [1] : []
    content {
      sid       = "PublicReadMapAssetsOnly"
      effect    = "Allow"
      actions   = ["s3:GetObject"]
      resources = ["${aws_s3_bucket.this.arn}/${var.maps_prefix}*"]
      principals {
        type        = "*"
        identifiers = ["*"]
      }
    }
  }

  dynamic "statement" {
    for_each = var.cloudfront_distribution_arn == null ? [] : [1]
    content {
      sid       = "CloudFrontReadsPlaybackOnly"
      effect    = "Allow"
      actions   = ["s3:GetObject"]
      resources = ["${aws_s3_bucket.this.arn}/${var.playback_prefix}*"]
      principals {
        type        = "Service"
        identifiers = ["cloudfront.amazonaws.com"]
      }
      condition {
        test     = "StringEquals"
        variable = "AWS:SourceArn"
        values   = [var.cloudfront_distribution_arn]
      }
    }
  }

  statement {
    sid     = "TlsOnly"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.this.arn,
      "${aws_s3_bucket.this.arn}/*",
    ]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "this" {
  bucket     = aws_s3_bucket.this.id
  policy     = data.aws_iam_policy_document.bucket.json
  depends_on = [aws_s3_bucket_public_access_block.this]
}

resource "aws_s3_bucket_lifecycle_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    id     = "evidence-raw-retention"
    status = "Enabled"
    filter {
      prefix = var.raw_prefix
    }
    expiration {
      days = var.raw_retention_days
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  rule {
    id     = "evidence-playback-retention"
    status = "Enabled"
    filter {
      prefix = var.playback_prefix
    }
    expiration {
      days = var.playback_retention_days
    }
  }
}

# Only raw .avi segments notify ingest: sidecars, playback output and map assets never do (no loop, spec §7.2).
resource "aws_s3_bucket_notification" "this" {
  bucket = aws_s3_bucket.this.id

  queue {
    id            = "evidence-raw-segments"
    queue_arn     = var.segment_ingest_queue_arn
    events        = ["s3:ObjectCreated:*"]
    filter_prefix = var.raw_prefix
    filter_suffix = ".avi"
  }
}
