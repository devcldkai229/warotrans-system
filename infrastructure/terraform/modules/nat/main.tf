# Managed NAT Gateway (design §1: mandatory while the lab runs) and the default routes of the private route tables.
# Runtime stack only: destroyed with the lab, because it is billed per hour even when nothing uses it.

variable "name" {
  type = string
}

variable "public_subnet_id" {
  type = string
}

variable "private_route_table_ids" {
  type = list(string)
}

resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = { Name = "${var.name}-nat" }
}

resource "aws_nat_gateway" "this" {
  allocation_id = aws_eip.nat.id
  subnet_id     = var.public_subnet_id
  tags          = { Name = var.name }
}

resource "aws_route" "default" {
  count                  = length(var.private_route_table_ids)
  route_table_id         = var.private_route_table_ids[count.index]
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.this.id
}

output "nat_gateway_id" {
  value = aws_nat_gateway.this.id
}

output "public_ip" {
  value = aws_eip.nat.public_ip
}
