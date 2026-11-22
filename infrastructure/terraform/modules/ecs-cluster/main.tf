# One ECS cluster, one EC2 Auto Scaling group + capacity provider per pool (design §5): "business" for the System API,
# "evidence" for the Evidence Recorder and Worker. Graviton (arm64) ECS-optimized Amazon Linux 2023. Managed scaling
# and termination protection keep a node with running tasks from being terminated by a scale-in.

variable "name" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "instance_profile_name" {
  type = string
}

variable "pools" {
  description = "pool name -> instance type, security group, size."
  type = map(object({
    instance_type     = string
    security_group_id = string
    min_size          = number
    max_size          = number
    desired_capacity  = number
  }))
}

data "aws_ssm_parameter" "ecs_ami_arm64" {
  name = "/aws/service/ecs/optimized-ami/amazon-linux-2023/arm64/recommended/image_id"
}

resource "aws_ecs_cluster" "this" {
  name = var.name
  setting {
    name  = "containerInsights"
    value = "disabled" # CloudWatch cost; enable for a stress test
  }
}

resource "aws_launch_template" "pool" {
  for_each      = var.pools
  name          = "${var.name}-${each.key}"
  image_id      = data.aws_ssm_parameter.ecs_ami_arm64.value
  instance_type = each.value.instance_type

  iam_instance_profile {
    name = var.instance_profile_name
  }

  vpc_security_group_ids = [each.value.security_group_id]

  metadata_options {
    http_tokens = "required"
    # 1: containers in bridge mode cannot reach the instance role through IMDS; tasks use their task role.
    http_put_response_hop_limit = 1
  }

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = 30
      volume_type           = "gp3"
      encrypted             = true
      delete_on_termination = true
    }
  }

  user_data = base64encode(<<-EOT
    #!/bin/bash
    cat >> /etc/ecs/ecs.config <<'CFG'
    ECS_CLUSTER=${var.name}
    ECS_INSTANCE_ATTRIBUTES={"pool":"${each.key}"}
    ECS_ENABLE_CONTAINER_METADATA=true
    ECS_CONTAINER_STOP_TIMEOUT=30s
    ECS_IMAGE_PULL_BEHAVIOR=prefer-cached
    CFG
  EOT
  )

  tag_specifications {
    resource_type = "instance"
    tags          = { Name = "${var.name}-${each.key}", Pool = each.key }
  }
}

resource "aws_autoscaling_group" "pool" {
  for_each              = var.pools
  name                  = "${var.name}-${each.key}"
  vpc_zone_identifier   = var.subnet_ids
  min_size              = each.value.min_size
  max_size              = each.value.max_size
  desired_capacity      = each.value.desired_capacity
  protect_from_scale_in = true # required by managed termination protection
  force_delete          = true # the lab-off destroy must not hang on protected instances
  health_check_type     = "EC2"

  launch_template {
    id      = aws_launch_template.pool[each.key].id
    version = "$Latest"
  }

  tag {
    key                 = "AmazonECSManaged"
    value               = "true"
    propagate_at_launch = true
  }

  lifecycle {
    ignore_changes = [desired_capacity] # owned by ECS managed scaling
  }
}

resource "aws_ecs_capacity_provider" "pool" {
  for_each = var.pools
  name     = "${var.name}-${each.key}"
  auto_scaling_group_provider {
    auto_scaling_group_arn         = aws_autoscaling_group.pool[each.key].arn
    managed_termination_protection = "ENABLED"
    managed_draining               = "ENABLED"
    managed_scaling {
      status                    = "ENABLED"
      target_capacity           = 100
      minimum_scaling_step_size = 1
      maximum_scaling_step_size = 1
    }
  }
}

resource "aws_ecs_cluster_capacity_providers" "this" {
  cluster_name       = aws_ecs_cluster.this.name
  capacity_providers = [for cp in aws_ecs_capacity_provider.pool : cp.name]
}

output "cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "cluster_arn" {
  value = aws_ecs_cluster.this.arn
}

output "capacity_providers" {
  value = { for k, cp in aws_ecs_capacity_provider.pool : k => cp.name }
}

output "asg_names" {
  value = { for k, g in aws_autoscaling_group.pool : k => g.name }
}
