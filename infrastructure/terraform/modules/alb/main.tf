# Internet-facing ALB behind CloudFront: HTTP 80 from CloudFront's origin-facing addresses only (security group), and
# only requests carrying the secret origin header CloudFront adds are forwarded (listener rules); anything else gets
# 403. /api/evidence/* goes to the Evidence Recorder, everything else to the System API.

variable "name" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "public_subnet_ids" {
  type = list(string)
}

variable "security_group_id" {
  type = string
}

variable "origin_verify_header" {
  type    = string
  default = "X-Origin-Verify"
}

variable "origin_verify_value" {
  type      = string
  sensitive = true
}

resource "aws_lb" "this" {
  name                       = var.name
  load_balancer_type         = "application"
  internal                   = false
  subnets                    = var.public_subnet_ids
  security_groups            = [var.security_group_id]
  idle_timeout               = 120 # SignalR WebSocket keep-alives are 15 s; long report downloads
  drop_invalid_header_fields = true
}

resource "aws_lb_target_group" "system" {
  name                 = "${var.name}-system"
  port                 = 5090
  protocol             = "HTTP"
  target_type          = "instance"
  vpc_id               = var.vpc_id
  deregistration_delay = 15
  health_check {
    path                = "/health"
    matcher             = "200"
    interval            = 15
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
  }
}

resource "aws_lb_target_group" "recorder" {
  name                 = "${var.name}-recorder"
  port                 = 5095
  protocol             = "HTTP"
  target_type          = "instance"
  vpc_id               = var.vpc_id
  deregistration_delay = 15
  health_check {
    path                = "/health"
    matcher             = "200"
    interval            = 15
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Forbidden"
      status_code  = "403"
    }
  }
}

resource "aws_lb_listener_rule" "recorder" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 10
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.recorder.arn
  }
  condition {
    http_header {
      http_header_name = var.origin_verify_header
      values           = [var.origin_verify_value]
    }
  }
  condition {
    path_pattern {
      values = ["/api/evidence/*", "/api/evidence"]
    }
  }
}

resource "aws_lb_listener_rule" "system" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 20
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.system.arn
  }
  condition {
    http_header {
      http_header_name = var.origin_verify_header
      values           = [var.origin_verify_value]
    }
  }
}

output "dns_name" {
  value = aws_lb.this.dns_name
}

output "arn_suffix" {
  value = aws_lb.this.arn_suffix
}

output "target_group_arns" {
  value = { system = aws_lb_target_group.system.arn, recorder = aws_lb_target_group.recorder.arn }
}
