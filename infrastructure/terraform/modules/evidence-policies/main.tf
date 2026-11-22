# The least-privilege policies of the two Evidence processes (spec §10.4), as JSON. One source for both ways they
# run: IAM users outside AWS (evidence-iam, the laptop) and ECS task roles in AWS (envs/demo).

data "aws_iam_policy_document" "recorder" {
  statement {
    sid       = "PresignRawUploads"
    actions   = ["s3:PutObject"]
    resources = ["${var.bucket_arn}/${var.raw_prefix}*"]
  }
  statement {
    sid       = "ReadForExport"
    actions   = ["s3:GetObject"]
    resources = ["${var.bucket_arn}/${var.raw_prefix}*", "${var.bucket_arn}/${var.playback_prefix}*"]
  }
  statement {
    sid       = "PlaybackSigningKey"
    actions   = ["ssm:GetParameter"]
    resources = [var.signing_key_parameter_arn]
  }
  statement {
    sid       = "DecryptSigningKey"
    actions   = ["kms:Decrypt"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.${var.region}.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "worker" {
  statement {
    sid       = "VerifyRawAndPlayback"
    actions   = ["s3:GetObject", "s3:GetObjectAttributes"]
    resources = ["${var.bucket_arn}/${var.raw_prefix}*", "${var.bucket_arn}/${var.playback_prefix}*"]
  }
  statement {
    sid       = "ListForReconciliation"
    actions   = ["s3:ListBucket"]
    resources = [var.bucket_arn]
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["${var.raw_prefix}*", "${var.playback_prefix}*"]
    }
  }
  statement {
    sid = "Queues"
    actions = [
      "sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:ChangeMessageVisibility", "sqs:SendMessage",
      "sqs:GetQueueAttributes", "sqs:GetQueueUrl"
    ]
    resources = var.queue_arns
  }
  statement {
    sid       = "MediaConvertJobs"
    actions   = ["mediaconvert:CreateJob", "mediaconvert:GetJob", "mediaconvert:ListJobs", "mediaconvert:DescribeEndpoints"]
    resources = ["*"]
  }
  statement {
    # CreateJob carries Tags (Component=Evidence, for cost allocation): tagging on create is authorized as
    # TagResource on the new job. Without it every submission fails with AccessDenied (found 2026-11-21, AWS E2E).
    sid       = "TagMediaConvertJobs"
    actions   = ["mediaconvert:TagResource"]
    resources = ["arn:aws:mediaconvert:*:*:jobs/*"]
  }
  statement {
    sid       = "PassMediaConvertRole"
    actions   = ["iam:PassRole"]
    resources = [var.mediaconvert_role_arn]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["mediaconvert.amazonaws.com"]
    }
  }
}
