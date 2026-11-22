output "queue_urls" {
  description = "Logical name -> URL (Evidence:Queues:Urls of the Recorder and the Worker)."
  value       = { for k, q in aws_sqs_queue.main : k => q.id }
}

output "queue_arns" {
  value = { for k, q in aws_sqs_queue.main : k => q.arn }
}

# For the bucket notification: S3 test-sends to the queue when the notification is created and refuses it ("Unable to
# validate the following destination configurations") while the queue policy that lets S3 send is not in place yet.
output "segment_ingest_queue_arn" {
  value      = aws_sqs_queue.main["segment-ingest"].arn
  depends_on = [aws_sqs_queue_policy.segment_ingest]
}

output "dlq_arns" {
  value = { for k, q in aws_sqs_queue.dlq : k => q.arn }
}

output "queue_names" {
  value = { for k, q in aws_sqs_queue.main : k => q.name }
}

output "dlq_names" {
  value = { for k, q in aws_sqs_queue.dlq : k => q.name }
}
