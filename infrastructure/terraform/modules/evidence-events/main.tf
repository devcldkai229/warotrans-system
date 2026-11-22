# MediaConvert job state changes of the Evidence queue -> the media-result SQS queue (spec §8.1, §9.4).
resource "aws_cloudwatch_event_rule" "mediaconvert" {
  name        = "${var.name_prefix}-mediaconvert-${var.environment}"
  description = "Evidence MediaConvert jobs: COMPLETE / ERROR / CANCELED / PROGRESSING"
  event_pattern = jsonencode({
    source        = ["aws.mediaconvert"]
    "detail-type" = ["MediaConvert Job State Change"]
    detail = {
      status = ["COMPLETE", "ERROR", "CANCELED", "PROGRESSING"]
      queue  = [var.mediaconvert_queue_arn]
    }
  })
}

resource "aws_cloudwatch_event_target" "result_queue" {
  rule      = aws_cloudwatch_event_rule.mediaconvert.name
  target_id = "evidence-media-result"
  arn       = var.result_queue_arn
}

# Only this rule may put messages on the result queue.
data "aws_iam_policy_document" "result_queue" {
  statement {
    sid       = "EvidenceMediaConvertRuleOnly"
    effect    = "Allow"
    actions   = ["sqs:SendMessage"]
    resources = [var.result_queue_arn]
    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }
    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [aws_cloudwatch_event_rule.mediaconvert.arn]
    }
  }
}

resource "aws_sqs_queue_policy" "result_queue" {
  queue_url = var.result_queue_url
  policy    = data.aws_iam_policy_document.result_queue.json
}
