# Three SQS Standard work queues, each with its DLQ (spec §8.1). At least once, any order: consumers are idempotent.
# No video bytes ever go on a queue.

locals {
  queues = {
    "segment-ingest" = { visibility = 120 }
    "media-process"  = { visibility = 300 }
    "media-result"   = { visibility = 120 }
  }
}

resource "aws_sqs_queue" "dlq" {
  for_each                  = local.queues
  name                      = "${var.name_prefix}-${each.key}-dlq-${var.environment}"
  message_retention_seconds = 1209600 # 14 days: time to find and fix the cause, then redrive
  sqs_managed_sse_enabled   = true
}

resource "aws_sqs_queue" "main" {
  for_each                   = local.queues
  name                       = "${var.name_prefix}-${each.key}-${var.environment}"
  visibility_timeout_seconds = each.value.visibility
  receive_wait_time_seconds  = 20     # long polling
  message_retention_seconds  = 345600 # 4 days
  sqs_managed_sse_enabled    = true
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq[each.key].arn
    maxReceiveCount     = var.max_receive_count
  })
}

resource "aws_sqs_queue_redrive_allow_policy" "dlq" {
  for_each  = local.queues
  queue_url = aws_sqs_queue.dlq[each.key].id
  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns   = [aws_sqs_queue.main[each.key].arn]
  })
}

# S3 may send raw-segment notifications of this bucket only.
data "aws_iam_policy_document" "segment_ingest" {
  statement {
    sid       = "S3RawSegmentsOnly"
    effect    = "Allow"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.main["segment-ingest"].arn]
    principals {
      type        = "Service"
      identifiers = ["s3.amazonaws.com"]
    }
    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [var.bucket_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [var.account_id]
    }
  }
}

resource "aws_sqs_queue_policy" "segment_ingest" {
  queue_url = aws_sqs_queue.main["segment-ingest"].id
  policy    = data.aws_iam_policy_document.segment_ingest.json
}

# The media-result queue policy lives in evidence-events: it names the rule ARN (no module cycle).
