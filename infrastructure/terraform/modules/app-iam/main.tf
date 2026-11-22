# IAM for the ECS workloads: the node instance role, the task execution role (pull images, read secrets, write logs)
# and one task role per service. The Evidence task roles carry the same least-privilege policies as the laptop's IAM
# users (modules/evidence-policies).

variable "name" {
  type = string
}

variable "secret_arns" {
  description = "Secrets Manager secrets the tasks may receive as environment variables."
  type        = list(string)
}

variable "map_bucket_arn" {
  type = string
}

variable "map_prefixes" {
  description = "Prefixes the System API reads and writes (map assets, semantic bundles)."
  type        = list(string)
  default     = ["maps/", "semantic/"]
}

variable "recorder_policy_json" {
  type = string
}

variable "worker_policy_json" {
  type = string
}

locals {
  ecs_tasks_trust = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

# --- ECS nodes
resource "aws_iam_role" "node" {
  name = "${var.name}-ecs-node"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ec2.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy_attachment" "node" {
  for_each = toset([
    "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role",
    "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
  ])
  role       = aws_iam_role.node.name
  policy_arn = each.value
}

resource "aws_iam_instance_profile" "node" {
  name = "${var.name}-ecs-node"
  role = aws_iam_role.node.name
}

# --- Task execution
resource "aws_iam_role" "execution" {
  name               = "${var.name}-ecs-execution"
  assume_role_policy = local.ecs_tasks_trust
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secrets" {
  name = "secrets"
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = var.secret_arns }]
  })
}

# --- System API
resource "aws_iam_role" "system" {
  name               = "${var.name}-task-system"
  assume_role_policy = local.ecs_tasks_trust
}

resource "aws_iam_role_policy" "system" {
  name = "maps"
  role = aws_iam_role.system.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = [for p in var.map_prefixes : "${var.map_bucket_arn}/${p}*"]
      },
      {
        Effect    = "Allow"
        Action    = ["s3:ListBucket"]
        Resource  = var.map_bucket_arn
        Condition = { StringLike = { "s3:prefix" = [for p in var.map_prefixes : "${p}*"] } }
      },
    ]
  })
}

# --- Evidence
resource "aws_iam_role" "recorder" {
  name               = "${var.name}-task-evidence-recorder"
  assume_role_policy = local.ecs_tasks_trust
}

resource "aws_iam_role_policy" "recorder" {
  name   = "evidence-recorder"
  role   = aws_iam_role.recorder.id
  policy = var.recorder_policy_json
}

resource "aws_iam_role" "worker" {
  name               = "${var.name}-task-evidence-worker"
  assume_role_policy = local.ecs_tasks_trust
}

resource "aws_iam_role_policy" "worker" {
  name   = "evidence-worker"
  role   = aws_iam_role.worker.id
  policy = var.worker_policy_json
}

output "node_instance_profile_name" {
  value = aws_iam_instance_profile.node.name
}

output "execution_role_arn" {
  value = aws_iam_role.execution.arn
}

output "task_role_arns" {
  value = {
    system   = aws_iam_role.system.arn
    recorder = aws_iam_role.recorder.arn
    worker   = aws_iam_role.worker.arn
  }
}
