# Operational alarms (spec §8.7, §12.3): anything in a DLQ, and a work queue whose oldest message waits too long.
resource "aws_sns_topic" "alerts" {
  name = "${var.name_prefix}-alerts-${var.environment}"
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.alert_email == null ? 0 : 1
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_cloudwatch_metric_alarm" "dlq_not_empty" {
  for_each            = var.dlq_names
  alarm_name          = "${each.value}-not-empty"
  alarm_description   = "Evidence ${each.key}: messages failed ${var.max_receive_count} times and wait in the DLQ (fix, then redrive)."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  dimensions          = { QueueName = each.value }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "oldest_message" {
  for_each            = var.queue_names
  alarm_name          = "${each.value}-backlog"
  alarm_description   = "Evidence ${each.key}: the oldest message waits more than ${var.max_age_seconds} s (Worker down or too slow)."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateAgeOfOldestMessage"
  dimensions          = { QueueName = each.value }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  threshold           = var.max_age_seconds
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}
