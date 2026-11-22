# envs/demo/persistent: everything that keeps data or identity and costs (almost) nothing while the lab is off
# (design §9): VPC, S3 gateway endpoint, security groups, ECR, RDS (stopped when off), MongoDB EC2 + EBS (stopped when
# off), IoT things and policies, secrets (values written by scripts, never by Terraform), IAM, logs, the web bucket,
# a budget alarm. NEVER `terraform destroy` this stack.

terraform {
  required_version = ">= 1.10.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
  }
  backend "s3" {
    key          = "warotrans/demo/persistent.tfstate"
    region       = "ap-southeast-1"
    use_lockfile = true
    # bucket: -backend-config="bucket=warotrans-tfstate-<account id>" (bootstrap/state-backend output)
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = "WaroTrans", Environment = "demo", Stack = "persistent", ManagedBy = "Terraform" }
  }
}

variable "region" {
  type    = string
  default = "ap-southeast-1"
}

variable "name" {
  type    = string
  default = "warotrans-demo"
}

variable "github_repository" {
  type    = string
  default = "devcldkai229/warotrans-system"
}

variable "evidence_bucket" {
  description = "The existing bucket of envs/dev (maps/, raw/, playback/); the System API's semantic/ and backups/ go there too."
  type        = string
  default     = "warotrans-ob-storage"
}

variable "evidence_environment" {
  description = "Suffix of the Evidence queues / MediaConvert of envs/dev the demo shares."
  type        = string
  default     = "dev"
}

variable "robot_things" {
  type    = list(string)
  default = ["RBT-001", "RBT-002", "SIM-001"]
}

variable "budget_monthly_usd" {
  type    = number
  default = 40
}

variable "alert_email" {
  description = "Budget and anomaly alerts; null = no budget notification."
  type        = string
  default     = null
}

data "aws_caller_identity" "current" {}

locals {
  account_id        = data.aws_caller_identity.current.account_id
  evidence_bucket   = "arn:aws:s3:::${var.evidence_bucket}"
  state_bucket_name = "warotrans-tfstate-${local.account_id}"
  secret_names      = ["connection-strings", "app", "iot-host", "mongo"]
}

module "network" {
  source = "../../../modules/network"
  name   = var.name
  region = var.region
}

module "sg" {
  source = "../../../modules/security-groups"
  name   = var.name
  vpc_id = module.network.vpc_id
}

module "ecr" {
  source       = "../../../modules/ecr"
  repositories = ["warotrans-system", "warotrans-evidence-recorder", "warotrans-evidence-worker"]
}

# Containers for the secret values; scripts/demo-secrets.sh, db-bootstrap.sh, mongo-bootstrap.sh and
# iot-issue-cert.sh put the values (JSON) so they never pass through the Terraform state.
#   connection-strings: system_postgres, system_postgres_migrator, evidence_postgres, mongo
#   app:                jwt_key, evidence_service_token
#   iot-host:           cert_pem, private_key_pem
#   mongo:              admin_password, app_password
resource "aws_secretsmanager_secret" "this" {
  for_each                = toset(local.secret_names)
  name                    = "${var.name}/${each.value}"
  recovery_window_in_days = 7
}

module "rds" {
  source            = "../../../modules/rds-postgres"
  name              = var.name
  subnet_ids        = module.network.data_subnet_ids
  security_group_id = module.sg.rds_sg_id
}

module "mongo" {
  source            = "../../../modules/mongodb-ec2"
  name              = "${var.name}-mongo"
  subnet_id         = module.network.data_subnet_ids[0]
  availability_zone = "${var.region}a"
  security_group_id = module.sg.mongo_sg_id
  backup_bucket     = var.evidence_bucket
  secret_arn        = aws_secretsmanager_secret.this["mongo"].arn
  admin_secret_arns = [module.rds.master_secret_arn, aws_secretsmanager_secret.this["connection-strings"].arn]
}

module "iot" {
  source       = "../../../modules/aws-iot"
  name         = var.name
  robot_things = var.robot_things
}

# The Evidence tasks get the same least-privilege policies as the laptop's IAM users of envs/dev.
module "evidence_policies" {
  source                    = "../../../modules/evidence-policies"
  region                    = var.region
  bucket_arn                = local.evidence_bucket
  raw_prefix                = "raw/"
  playback_prefix           = "playback/"
  queue_arns                = [for q in ["segment-ingest", "media-process", "media-result"] : "arn:aws:sqs:${var.region}:${local.account_id}:warotrans-evidence-${q}-${var.evidence_environment}"]
  mediaconvert_role_arn     = "arn:aws:iam::${local.account_id}:role/warotrans-evidence-mediaconvert-${var.evidence_environment}"
  signing_key_parameter_arn = "arn:aws:ssm:${var.region}:${local.account_id}:parameter/warotrans/evidence/${var.evidence_environment}/cloudfront-private-key"
}

module "iam" {
  source               = "../../../modules/app-iam"
  name                 = var.name
  secret_arns          = [for s in aws_secretsmanager_secret.this : s.arn]
  map_bucket_arn       = local.evidence_bucket
  recorder_policy_json = module.evidence_policies.recorder_policy_json
  worker_policy_json   = module.evidence_policies.worker_policy_json
}

resource "aws_s3_bucket" "web" {
  bucket = "${var.name}-web-${local.account_id}"
}

resource "aws_s3_bucket_public_access_block" "web" {
  bucket                  = aws_s3_bucket.web.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "web" {
  bucket = aws_s3_bucket.web.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "web" {
  bucket = aws_s3_bucket.web.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

module "github" {
  source              = "../../../modules/github-oidc"
  name                = var.name
  repository          = var.github_repository
  create_provider     = false # the account already has token.actions.githubusercontent.com
  ecr_repository_arns = module.ecr.repository_arns
  pass_role_arns      = concat([module.iam.execution_role_arn], values(module.iam.task_role_arns))
  web_bucket_arn      = aws_s3_bucket.web.arn
  state_bucket_arn    = "arn:aws:s3:::${local.state_bucket_name}"
}

# What the runtime stack starts with (no local files needed, so the lab can be started from GitHub Actions):
#   release:           {"git_sha": ..., "images": {"system": "<repo>@sha256:..", "evidence-recorder": .., "evidence-worker": ..}}
#                      written by deploy-demo.yml after a successful deploy (scripts/publish-images.sh --release once)
#   evidence-settings: the Evidence__* settings of envs/dev (scripts/lab.sh evidence-settings)
# Terraform only creates them; their values belong to the release process.
resource "aws_ssm_parameter" "runtime" {
  for_each = { release = jsonencode({ images = {} }), "evidence-settings" = jsonencode({}) }
  name     = "/${var.name}/${each.key}"
  type     = "String"
  value    = each.value
  lifecycle {
    ignore_changes = [value]
  }
}

# Logs outlive the runtime stack (investigate a lab session after it was switched off).
resource "aws_cloudwatch_log_group" "this" {
  for_each          = toset(["system", "evidence-recorder", "evidence-worker", "migrate"])
  name              = "/${var.name}/${each.value}"
  retention_in_days = 14
}

resource "aws_budgets_budget" "monthly" {
  count        = var.alert_email == null ? 0 : 1
  name         = "${var.name}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.budget_monthly_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"
  cost_filter {
    name   = "TagKeyValue"
    values = ["user:Project$WaroTrans"]
  }
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alert_email]
  }
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }
}
