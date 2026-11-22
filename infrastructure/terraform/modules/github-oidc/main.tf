# GitHub Actions -> AWS without stored keys (design §8). Three roles, each limited to this repository:
#   publish: push images to the ECR repositories (any branch/ref of the repository; it never deploys)
#   deploy:  register task definitions, update ECS services, run the migration task, release the web (environment demo)
#   lab:     Terraform apply/destroy of envs/demo/runtime and edge, start/stop RDS and MongoDB (environment demo)
# The deploy and lab roles can only be assumed from a job running in the GitHub environment "demo", which has
# required reviewers.

variable "name" {
  type = string
}

variable "repository" {
  description = "owner/name"
  type        = string
}

variable "create_provider" {
  description = "false when the account already has the token.actions.githubusercontent.com provider."
  type        = bool
  default     = false
}

variable "ecr_repository_arns" {
  type = list(string)
}

variable "pass_role_arns" {
  description = "Task and execution roles the deploy role hands to ECS."
  type        = list(string)
}

variable "web_bucket_arn" {
  type = string
}

variable "state_bucket_arn" {
  type = string
}

data "aws_caller_identity" "current" {}

resource "aws_iam_openid_connect_provider" "github" {
  count          = var.create_provider ? 1 : 0
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

locals {
  provider_arn = var.create_provider ? aws_iam_openid_connect_provider.github[0].arn : "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com"

  trust = { for k, sub in {
    publish = "repo:${var.repository}:*"
    deploy  = "repo:${var.repository}:environment:demo"
    lab     = "repo:${var.repository}:environment:demo"
    } : k => jsonencode({
      Version = "2012-10-17"
      Statement = [{
        Effect    = "Allow"
        Principal = { Federated = local.provider_arn }
        Action    = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = { "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com" }
          StringLike   = { "token.actions.githubusercontent.com:sub" = sub }
        }
      }]
  }) }
}

resource "aws_iam_role" "this" {
  for_each             = local.trust
  name                 = "${var.name}-github-${each.key}"
  assume_role_policy   = each.value
  max_session_duration = 3600
}

resource "aws_iam_role_policy" "publish" {
  name = "ecr-push"
  role = aws_iam_role.this["publish"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["ecr:GetAuthorizationToken"], Resource = "*" },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload", "ecr:PutImage", "ecr:BatchGetImage", "ecr:DescribeImages",
          "ecr:DescribeImageScanFindings",
        ]
        Resource = var.ecr_repository_arns
      },
    ]
  })
}

resource "aws_iam_role_policy" "deploy" {
  name = "ecs-deploy"
  role = aws_iam_role.this["deploy"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecs:RegisterTaskDefinition", "ecs:DescribeTaskDefinition", "ecs:DescribeServices", "ecs:UpdateService",
          "ecs:RunTask", "ecs:DescribeTasks", "ecs:ListTasks", "ecs:DescribeClusters",
          "ecr:DescribeImages", "logs:GetLogEvents", "logs:FilterLogEvents",
          "elasticloadbalancing:DescribeTargetHealth", "elasticloadbalancing:DescribeTargetGroups",
          "cloudfront:CreateInvalidation", "cloudfront:GetInvalidation", "cloudfront:ListDistributions",
        ]
        Resource = "*"
      },
      { Effect = "Allow", Action = "iam:PassRole", Resource = var.pass_role_arns },
      {
        Effect   = "Allow"
        Action   = ["ssm:GetParameter", "ssm:PutParameter"]
        Resource = "arn:aws:ssm:*:${data.aws_caller_identity.current.account_id}:parameter/${var.name}/release"
      },
      { Effect = "Allow", Action = ["s3:ListBucket"], Resource = var.web_bucket_arn },
      { Effect = "Allow", Action = ["s3:PutObject", "s3:DeleteObject", "s3:GetObject"], Resource = "${var.web_bucket_arn}/*" },
      { Effect = "Allow", Action = ["s3:GetObject"], Resource = "${var.state_bucket_arn}/*" },
      { Effect = "Allow", Action = ["s3:ListBucket"], Resource = var.state_bucket_arn },
    ]
  })
}

# Terraform of the runtime/edge stacks creates VPC networking, load balancers, ECS, EC2 Auto Scaling and CloudFront;
# PowerUser covers those, the IAM statements cover what it needs without making IAM principals.
resource "aws_iam_role_policy_attachment" "lab_power_user" {
  role       = aws_iam_role.this["lab"].name
  policy_arn = "arn:aws:iam::aws:policy/PowerUserAccess"
}

resource "aws_iam_role_policy" "lab_iam" {
  name = "iam-for-runtime"
  role = aws_iam_role.this["lab"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["iam:PassRole", "iam:GetRole", "iam:GetInstanceProfile"], Resource = "*" },
      { Effect = "Allow", Action = "iam:CreateServiceLinkedRole", Resource = "*" },
    ]
  })
}

output "role_arns" {
  value = { for k, r in aws_iam_role.this : k => r.arn }
}
