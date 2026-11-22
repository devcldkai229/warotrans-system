# ECR PrivateLink (design §4.3): images are pulled without the NAT; layers come through the S3 gateway endpoint of
# the persistent stack. One ENI per service in App subnet A (cheaper; every node in the VPC can use it). Billed per
# hour, so it lives in the runtime stack.

variable "name" {
  type = string
}

variable "region" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "security_group_id" {
  type = string
}

resource "aws_vpc_endpoint" "this" {
  for_each            = toset(["ecr.api", "ecr.dkr"])
  vpc_id              = var.vpc_id
  service_name        = "com.amazonaws.${var.region}.${each.value}"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  subnet_ids          = var.subnet_ids
  security_group_ids  = [var.security_group_id]
  tags                = { Name = "${var.name}-${each.value}" }
}

output "endpoint_ids" {
  value = { for k, e in aws_vpc_endpoint.this : k => e.id }
}
