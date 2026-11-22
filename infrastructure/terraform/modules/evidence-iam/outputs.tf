output "recorder_user" {
  value = aws_iam_user.recorder.name
}

output "worker_user" {
  value = aws_iam_user.worker.name
}
