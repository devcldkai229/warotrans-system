# Least-privilege identities of the two Evidence processes (spec §10.4). They run outside AWS (the backend server /
# laptop), so each gets an IAM user with exactly one policy. Access keys are NOT made here (they would sit in the
# state): create them with `aws iam create-access-key` and keep them in the process's environment / AWS profile.
# Robots get no AWS identity at all: they only use presigned URLs.

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

resource "aws_iam_user" "recorder" {
  name = "${var.name_prefix}-recorder-${var.environment}"
}

resource "aws_iam_user" "worker" {
  name = "${var.name_prefix}-worker-${var.environment}"
}

resource "aws_iam_user_policy" "recorder" {
  name   = "evidence-recorder"
  user   = aws_iam_user.recorder.name
  policy = data.aws_iam_policy_document.recorder.json
}

resource "aws_iam_user_policy" "worker" {
  name   = "evidence-worker"
  user   = aws_iam_user.worker.name
  policy = data.aws_iam_policy_document.worker.json
}
