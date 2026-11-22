# One ECS service on EC2 (bridge networking, dynamic host port) placed on its own capacity provider (design §5).
# Terraform makes the service with a known-good bootstrap image; releases after that are task definition revisions
# registered by .github/workflows/deploy-demo.yml, so task_definition and desired_count are ignored here.

variable "name" {
  type = string
}

variable "cluster_arn" {
  type = string
}

variable "capacity_provider" {
  type = string
}

variable "image" {
  description = "Bootstrap image: <repository>@sha256:<digest>."
  type        = string
}

variable "container_port" {
  type    = number
  default = 0
}

variable "cpu" {
  type = number
}

variable "memory_reservation" {
  type = number
}

variable "memory" {
  description = "Hard limit (MiB); the container is killed above it."
  type        = number
}

variable "environment" {
  type    = map(string)
  default = {}
}

variable "secrets" {
  description = "ENV_NAME -> Secrets Manager reference (<secret arn>:<json key>::)."
  type        = map(string)
  default     = {}
}

variable "command" {
  type    = list(string)
  default = null
}

variable "execution_role_arn" {
  type = string
}

variable "task_role_arn" {
  type = string
}

variable "log_group" {
  type = string
}

variable "region" {
  type = string
}

variable "target_group_arn" {
  type    = string
  default = null
}

variable "desired_count" {
  type    = number
  default = 1
}

variable "health_check_grace_seconds" {
  type    = number
  default = 120
}

variable "create_service" {
  description = "false: only the task definition (the one-off migration task)."
  type        = bool
  default     = true
}

resource "aws_ecs_task_definition" "this" {
  family                   = var.name
  network_mode             = "bridge"
  requires_compatibilities = ["EC2"]
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.task_role_arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([merge({
    name              = var.name
    image             = var.image
    essential         = true
    cpu               = var.cpu
    memoryReservation = var.memory_reservation
    memory            = var.memory
    environment       = [for k in sort(keys(var.environment)) : { name = k, value = var.environment[k] }]
    secrets           = [for k in sort(keys(var.secrets)) : { name = k, valueFrom = var.secrets[k] }]
    portMappings      = var.container_port > 0 ? [{ containerPort = var.container_port, hostPort = 0, protocol = "tcp" }] : []
    stopTimeout       = 30
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = var.log_group
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = var.name
      }
    }
  }, var.command == null ? {} : { command = var.command })])
}

resource "aws_ecs_service" "this" {
  count           = var.create_service ? 1 : 0
  name            = var.name
  cluster         = var.cluster_arn
  task_definition = aws_ecs_task_definition.this.arn
  desired_count   = var.desired_count
  # One task at a time: the System API is a singleton (traffic coordinator lease, in-memory traffic state, SignalR
  # without a backplane), and the small nodes have no room for a second copy during a rollout.
  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100
  health_check_grace_period_seconds  = var.target_group_arn == null ? null : var.health_check_grace_seconds
  enable_execute_command             = false

  capacity_provider_strategy {
    capacity_provider = var.capacity_provider
    weight            = 1
    base              = 0
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  dynamic "load_balancer" {
    for_each = var.target_group_arn == null ? [] : [var.target_group_arn]
    content {
      target_group_arn = load_balancer.value
      container_name   = var.name
      container_port   = var.container_port
    }
  }

  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }
}

output "task_definition_arn" {
  value = aws_ecs_task_definition.this.arn
}

output "family" {
  value = aws_ecs_task_definition.this.family
}

output "service_name" {
  value = var.create_service ? aws_ecs_service.this[0].name : null
}
