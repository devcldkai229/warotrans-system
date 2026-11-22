# Security groups of the demo (design §4.2). Rules are separate resources so groups can reference each other.
# The ALB admits CloudFront only (AWS-managed origin-facing prefix list); the secret origin header is checked by the
# ALB listener rules (runtime stack). ECS nodes run tasks in bridge mode on dynamic host ports.

variable "name" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "dynamic_port_from" {
  description = "ECS bridge-mode dynamic host ports (AL2023 ephemeral range)."
  type        = number
  default     = 32768
}

variable "dynamic_port_to" {
  type    = number
  default = 65535
}

data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

resource "aws_security_group" "alb" {
  name        = "${var.name}-alb"
  description = "ALB: HTTP from CloudFront only"
  vpc_id      = var.vpc_id
}

resource "aws_security_group" "business" {
  name        = "${var.name}-ecs-business"
  description = "ECS nodes running the System API"
  vpc_id      = var.vpc_id
}

resource "aws_security_group" "evidence" {
  name        = "${var.name}-ecs-evidence"
  description = "ECS nodes running Evidence Recorder and Worker"
  vpc_id      = var.vpc_id
}

resource "aws_security_group" "rds" {
  name        = "${var.name}-rds"
  description = "PostgreSQL from the app tiers; no outbound"
  vpc_id      = var.vpc_id
}

resource "aws_security_group" "mongo" {
  name        = "${var.name}-mongo"
  description = "MongoDB from the System API; managed through Session Manager, no SSH"
  vpc_id      = var.vpc_id
}

resource "aws_security_group" "vpce" {
  name        = "${var.name}-vpce"
  description = "Interface endpoints: TLS from the ECS nodes"
  vpc_id      = var.vpc_id
}

# --- ALB
resource "aws_vpc_security_group_ingress_rule" "alb_from_cloudfront" {
  security_group_id = aws_security_group.alb.id
  description       = "CloudFront origin-facing"
  prefix_list_id    = data.aws_ec2_managed_prefix_list.cloudfront.id
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
}

resource "aws_vpc_security_group_egress_rule" "alb_to_business" {
  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = aws_security_group.business.id
  ip_protocol                  = "tcp"
  from_port                    = var.dynamic_port_from
  to_port                      = var.dynamic_port_to
}

resource "aws_vpc_security_group_egress_rule" "alb_to_evidence" {
  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = aws_security_group.evidence.id
  ip_protocol                  = "tcp"
  from_port                    = var.dynamic_port_from
  to_port                      = var.dynamic_port_to
}

# --- ECS nodes: from the ALB on the dynamic ports; out to anything (NAT, endpoints, RDS, MongoDB, IoT Core).
resource "aws_vpc_security_group_ingress_rule" "business_from_alb" {
  security_group_id            = aws_security_group.business.id
  referenced_security_group_id = aws_security_group.alb.id
  ip_protocol                  = "tcp"
  from_port                    = var.dynamic_port_from
  to_port                      = var.dynamic_port_to
}

resource "aws_vpc_security_group_ingress_rule" "evidence_from_alb" {
  security_group_id            = aws_security_group.evidence.id
  referenced_security_group_id = aws_security_group.alb.id
  ip_protocol                  = "tcp"
  from_port                    = var.dynamic_port_from
  to_port                      = var.dynamic_port_to
}

resource "aws_vpc_security_group_egress_rule" "business_out" {
  security_group_id = aws_security_group.business.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_vpc_security_group_egress_rule" "evidence_out" {
  security_group_id = aws_security_group.evidence.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# --- RDS: 5432 from the app tiers and from the MongoDB host (Session Manager port forwarding for restores).
resource "aws_vpc_security_group_ingress_rule" "rds_from" {
  for_each = {
    business = aws_security_group.business.id
    evidence = aws_security_group.evidence.id
    mongo    = aws_security_group.mongo.id
  }
  security_group_id            = aws_security_group.rds.id
  referenced_security_group_id = each.value
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

# --- MongoDB: 27017 from the System API only; out for packages, Session Manager, backups (via NAT / S3 endpoint).
resource "aws_vpc_security_group_ingress_rule" "mongo_from_business" {
  security_group_id            = aws_security_group.mongo.id
  referenced_security_group_id = aws_security_group.business.id
  ip_protocol                  = "tcp"
  from_port                    = 27017
  to_port                      = 27017
}

resource "aws_vpc_security_group_egress_rule" "mongo_out" {
  security_group_id = aws_security_group.mongo.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# --- Interface endpoints (ECR api/dkr)
resource "aws_vpc_security_group_ingress_rule" "vpce_from" {
  for_each = {
    business = aws_security_group.business.id
    evidence = aws_security_group.evidence.id
  }
  security_group_id            = aws_security_group.vpce.id
  referenced_security_group_id = each.value
  ip_protocol                  = "tcp"
  from_port                    = 443
  to_port                      = 443
}

output "alb_sg_id" {
  value = aws_security_group.alb.id
}

output "business_sg_id" {
  value = aws_security_group.business.id
}

output "evidence_sg_id" {
  value = aws_security_group.evidence.id
}

output "rds_sg_id" {
  value = aws_security_group.rds.id
}

output "mongo_sg_id" {
  value = aws_security_group.mongo.id
}

output "vpce_sg_id" {
  value = aws_security_group.vpce.id
}
