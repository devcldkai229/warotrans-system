output "queue_urls" {
  description = "Logical name -> URL (Evidence:Queues:Urls of the Recorder and the Worker)."
  value       = { for k, q in aws_sqs_queue.main : k => q.id }
}

output "queue_arns" {
  value = { for k, q in aws_sqs_queue.main : k => q.arn }
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
