# RDS PostgreSQL 17 (design §7): Single-AZ, encrypted, TLS only, 7-day backups, private. The master password is kept
# by RDS in Secrets Manager (never in the Terraform state). Application roles and databases are created by
# scripts/db-bootstrap.sh (owner role for migrations, DML-only role for the API).

variable "name" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "security_group_id" {
  type = string
}

variable "instance_class" {
  type    = string
  default = "db.t4g.small"
}

variable "allocated_storage_gb" {
  type    = number
  default = 20
}

variable "engine_version" {
  type    = string
  default = "17"
}

resource "aws_db_subnet_group" "this" {
  name       = var.name
  subnet_ids = var.subnet_ids
}

resource "aws_db_parameter_group" "this" {
  name   = "${var.name}-pg17"
  family = "postgres17"
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
}

resource "aws_db_instance" "this" {
  identifier                   = var.name
  engine                       = "postgres"
  engine_version               = var.engine_version
  auto_minor_version_upgrade   = true
  instance_class               = var.instance_class
  allocated_storage            = var.allocated_storage_gb
  storage_type                 = "gp3"
  storage_encrypted            = true
  multi_az                     = false
  publicly_accessible          = false
  db_subnet_group_name         = aws_db_subnet_group.this.name
  vpc_security_group_ids       = [var.security_group_id]
  parameter_group_name         = aws_db_parameter_group.this.name
  username                     = "warotrans_admin"
  manage_master_user_password  = true
  db_name                      = "postgres"
  backup_retention_period      = 7
  backup_window                = "18:00-18:30" # 01:00 Asia/Ho_Chi_Minh
  maintenance_window           = "sun:19:00-sun:19:30"
  copy_tags_to_snapshot        = true
  deletion_protection          = true
  skip_final_snapshot          = false
  final_snapshot_identifier    = "${var.name}-final"
  performance_insights_enabled = false

  lifecycle {
    prevent_destroy = true
  }
}

output "endpoint" {
  value = aws_db_instance.this.address
}

output "port" {
  value = aws_db_instance.this.port
}

output "identifier" {
  value = aws_db_instance.this.identifier
}

output "arn" {
  value = aws_db_instance.this.arn
}

output "master_secret_arn" {
  value = aws_db_instance.this.master_user_secret[0].secret_arn
}
