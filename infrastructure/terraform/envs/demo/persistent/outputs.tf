# Read by envs/demo/runtime and edge (terraform_remote_state) and by the scripts.

output "region" {
  value = var.region
}

output "name" {
  value = var.name
}

output "vpc_id" {
  value = module.network.vpc_id
}

output "public_subnet_ids" {
  value = module.network.public_subnet_ids
}

output "app_subnet_ids" {
  value = module.network.app_subnet_ids
}

output "data_subnet_ids" {
  value = module.network.data_subnet_ids
}

output "private_route_table_ids" {
  value = [module.network.app_route_table_id, module.network.data_route_table_id]
}

output "security_groups" {
  value = {
    alb      = module.sg.alb_sg_id
    business = module.sg.business_sg_id
    evidence = module.sg.evidence_sg_id
    vpce     = module.sg.vpce_sg_id
  }
}

output "ecr_repository_urls" {
  value = module.ecr.repository_urls
}

output "rds_endpoint" {
  value = module.rds.endpoint
}

output "rds_identifier" {
  value = module.rds.identifier
}

output "rds_master_secret_arn" {
  value = module.rds.master_secret_arn
}

output "mongo_instance_id" {
  value = module.mongo.instance_id
}

output "mongo_private_dns" {
  value = module.mongo.private_dns
}

output "iot_endpoint" {
  value = module.iot.endpoint
}

output "iot_policies" {
  value = { robot = module.iot.robot_policy_name, host = module.iot.host_policy_name }
}

output "secret_arns" {
  value = { for k, s in aws_secretsmanager_secret.this : k => s.arn }
}

output "iam" {
  value = {
    node_instance_profile = module.iam.node_instance_profile_name
    execution_role_arn    = module.iam.execution_role_arn
    task_role_arns        = module.iam.task_role_arns
  }
}

output "github_role_arns" {
  value = module.github.role_arns
}

output "log_groups" {
  value = { for k, g in aws_cloudwatch_log_group.this : k => g.name }
}

output "web_bucket" {
  value = {
    id                   = aws_s3_bucket.web.id
    arn                  = aws_s3_bucket.web.arn
    regional_domain_name = aws_s3_bucket.web.bucket_regional_domain_name
  }
}

output "evidence_bucket" {
  value = var.evidence_bucket
}

output "runtime_parameters" {
  value = { for k, p in aws_ssm_parameter.runtime : k => p.name }
}
