# MongoDB Community 8 on one EC2 instance (design §7): private data subnet, data on its own gp3 EBS volume that
# survives the instance, TLS + authentication, no SSH (Session Manager), daily mongodump to S3.
# Stand-alone like the local development MongoDB (the Operations module uses no transactions or change streams).
#
# The setup needs the Internet (MongoDB's package repository, Session Manager) and the NAT only exists while the lab
# is on: user_data installs a systemd unit that retries every minute until the setup has finished once.
# Users are created afterwards by scripts/mongo-bootstrap.sh (Session Manager), passwords in Secrets Manager.

variable "name" {
  type = string
}

variable "subnet_id" {
  type = string
}

variable "availability_zone" {
  type = string
}

variable "security_group_id" {
  type = string
}

variable "instance_type" {
  type    = string
  default = "t4g.small"
}

variable "data_volume_gb" {
  type    = number
  default = 30
}

variable "backup_bucket" {
  type = string
}

variable "backup_prefix" {
  type    = string
  default = "backups/mongo/"
}

variable "secret_arn" {
  description = "Secrets Manager secret with admin_password (scripts/mongo-bootstrap.sh)."
  type        = string
}

variable "admin_secret_arns" {
  description = "Further secrets the host reads when the scripts run database administration on it (RDS master, connection strings)."
  type        = list(string)
  default     = []
}

variable "restore_prefix" {
  description = "Where scripts/restore-dev-data.sh puts the laptop dumps for this host to restore."
  type        = string
  default     = "backups/laptop/"
}

data "aws_ssm_parameter" "al2023_arm64" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

data "aws_region" "current" {}

resource "aws_iam_role" "this" {
  name = "${var.name}-instance"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ec2.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.this.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "backup" {
  name = "backup"
  role = aws_iam_role.this.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["s3:PutObject"], Resource = "arn:aws:s3:::${var.backup_bucket}/${var.backup_prefix}*" },
      { Effect = "Allow", Action = ["s3:GetObject"], Resource = "arn:aws:s3:::${var.backup_bucket}/${var.restore_prefix}*" },
      { Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = concat([var.secret_arn], var.admin_secret_arns) },
    ]
  })
}

resource "aws_iam_instance_profile" "this" {
  name = "${var.name}-instance"
  role = aws_iam_role.this.name
}

resource "aws_ebs_volume" "data" {
  availability_zone = var.availability_zone
  size              = var.data_volume_gb
  type              = "gp3"
  encrypted         = true
  tags              = { Name = "${var.name}-data", Backup = "mongo" }
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_instance" "this" {
  ami                    = data.aws_ssm_parameter.al2023_arm64.value
  instance_type          = var.instance_type
  subnet_id              = var.subnet_id
  vpc_security_group_ids = [var.security_group_id]
  iam_instance_profile   = aws_iam_instance_profile.this.name
  ebs_optimized          = true

  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = 8
    encrypted   = true
  }

  user_data = templatefile("${path.module}/setup.sh.tftpl", {
    volume_id     = replace(aws_ebs_volume.data.id, "-", "")
    backup_bucket = var.backup_bucket
    backup_prefix = var.backup_prefix
    secret_arn    = var.secret_arn
    region        = data.aws_region.current.name
  })

  tags = { Name = var.name }

  lifecycle {
    # A new AMI or setup script must never replace the database host by surprise.
    ignore_changes = [ami, user_data]
  }
}

resource "aws_volume_attachment" "data" {
  device_name = "/dev/sdf"
  volume_id   = aws_ebs_volume.data.id
  instance_id = aws_instance.this.id
}

output "instance_id" {
  value = aws_instance.this.id
}

output "private_dns" {
  value = aws_instance.this.private_dns
}

output "private_ip" {
  value = aws_instance.this.private_ip
}
