output "queue_arn" {
  value = aws_media_convert_queue.this.arn
}

output "role_arn" {
  value = aws_iam_role.mediaconvert.arn
}
