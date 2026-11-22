# Least-privilege identities of the two Evidence processes (spec §10.4). They run outside AWS (the backend server /
# laptop), so each gets an IAM user with exactly one policy. Access keys are NOT made here (they would sit in the
# state): create them with `aws iam create-access-key` and keep them in the process's environment / AWS profile.
# Robots get no AWS identity at all: they only use presigned URLs.

module "policies" {
  source                    = "../evidence-policies"
  region                    = var.region
  bucket_arn                = var.bucket_arn
  raw_prefix                = var.raw_prefix
  playback_prefix           = var.playback_prefix
  queue_arns                = var.queue_arns
  mediaconvert_role_arn     = var.mediaconvert_role_arn
  signing_key_parameter_arn = var.signing_key_parameter_arn
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
  policy = module.policies.recorder_policy_json
}

resource "aws_iam_user_policy" "worker" {
  name   = "evidence-worker"
  user   = aws_iam_user.worker.name
  policy = module.policies.worker_policy_json
}
