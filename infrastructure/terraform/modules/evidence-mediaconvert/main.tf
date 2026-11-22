# MediaConvert: an on-demand queue for Evidence and the role MediaConvert assumes to read raw segments and write HLS.
# The encode settings (profile hls-v1: H.264 720p + 480p, HLS 6 s, source frame rate kept) live in the Worker's code
# (MediaConvertJobFactory), versioned with it: the provider has no job-template resource, and the settings must
# change together with the PlaybackSpan computation that depends on them.

resource "aws_media_convert_queue" "this" {
  name         = "${var.name_prefix}-${var.environment}"
  pricing_plan = "ON_DEMAND"
  description  = "WaroTrans Evidence transcodes (raw MJPEG AVI -> HLS)"
}

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["mediaconvert.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [var.account_id]
    }
  }
}

resource "aws_iam_role" "mediaconvert" {
  name               = "${var.name_prefix}-mediaconvert-${var.environment}"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

data "aws_iam_policy_document" "mediaconvert" {
  statement {
    sid       = "ReadRawSegments"
    actions   = ["s3:GetObject"]
    resources = ["${var.bucket_arn}/${var.raw_prefix}*"]
  }
  statement {
    sid       = "WritePlayback"
    actions   = ["s3:PutObject"]
    resources = ["${var.bucket_arn}/${var.playback_prefix}*"]
  }
  statement {
    sid       = "ListForInputs"
    actions   = ["s3:ListBucket"]
    resources = [var.bucket_arn]
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["${var.raw_prefix}*", "${var.playback_prefix}*"]
    }
  }
}

resource "aws_iam_role_policy" "mediaconvert" {
  name   = "s3-evidence"
  role   = aws_iam_role.mediaconvert.id
  policy = data.aws_iam_policy_document.mediaconvert.json
}
