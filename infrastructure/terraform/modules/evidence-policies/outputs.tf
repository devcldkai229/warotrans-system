output "recorder_policy_json" {
  value = data.aws_iam_policy_document.recorder.json
}

output "worker_policy_json" {
  value = data.aws_iam_policy_document.worker.json
}
