# envs/demo/runtime: what is billed per hour and only exists while the lab is on (design §9-10): NAT Gateway, ECR
# interface endpoints, ALB, the ECS cluster with its two node pools and the three services (+ the migration task
# definition). `terraform destroy` of THIS stack is the lab-off switch; it holds no data.
#
#   terraform init -backend-config="bucket=<state bucket>"
#   terraform apply -var state_bucket=<state bucket>
# Images: the current release in SSM /warotrans-demo/release (deploy-demo.yml); Evidence settings in
# /warotrans-demo/evidence-settings. Both can be overridden with -var for a one-off.

terraform {
  required_version = ">= 1.10.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
  }
  backend "s3" {
    key          = "warotrans/demo/runtime.tfstate"
    region       = "ap-southeast-1"
    use_lockfile = true
  }
}

provider "aws" {
  region = "ap-southeast-1"
  default_tags {
    tags = { Project = "WaroTrans", Environment = "demo", Stack = "runtime", ManagedBy = "Terraform" }
  }
}

variable "state_bucket" {
  type = string
}

variable "images" {
  description = "Override of the release images (repository@sha256:digest) for system, evidence-recorder, evidence-worker."
  type        = map(string)
  default     = null
}

variable "semantic_bundle_s3_uri" {
  description = "Semantic bundle of the map the robots run (same files as the robots' BUNDLE)."
  type        = string
  default     = "s3://warotrans-ob-storage/semantic/map_one_v013/"
}

variable "evidence_settings" {
  description = "Override of the Evidence__* settings (default: SSM /warotrans-demo/evidence-settings)."
  type        = map(string)
  default     = null
}

variable "business_instance_type" {
  type    = string
  default = "t4g.medium"
}

variable "evidence_instance_type" {
  type    = string
  default = "t4g.small"
}

data "terraform_remote_state" "persistent" {
  backend = "s3"
  config = {
    bucket = var.state_bucket
    key    = "warotrans/demo/persistent.tfstate"
    region = "ap-southeast-1"
  }
}

data "terraform_remote_state" "edge" {
  backend = "s3"
  config = {
    bucket = var.state_bucket
    key    = "warotrans/demo/edge.tfstate"
    region = "ap-southeast-1"
  }
}

data "aws_ssm_parameter" "release" {
  name = data.terraform_remote_state.persistent.outputs.runtime_parameters.release
}

data "aws_ssm_parameter" "evidence_settings" {
  name = data.terraform_remote_state.persistent.outputs.runtime_parameters["evidence-settings"]
}

locals {
  images            = coalesce(var.images, jsondecode(data.aws_ssm_parameter.release.value).images)
  evidence_settings = coalesce(var.evidence_settings, jsondecode(data.aws_ssm_parameter.evidence_settings.value))
}

check "release" {
  assert {
    condition     = alltrue([for k in ["system", "evidence-recorder", "evidence-worker"] : can(local.images[k])])
    error_message = "No release images: run scripts/publish-images.sh --release (first time) or deploy-demo.yml."
  }
}

locals {
  p       = data.terraform_remote_state.persistent.outputs
  web_url = data.terraform_remote_state.edge.outputs.web_url
  region  = local.p.region
  s       = local.p.secret_arns
  # ECS secret reference to one JSON key of a Secrets Manager secret
  ref = { for k, arn in local.s : k => "${arn}:%s::" }
}

module "nat" {
  source                  = "../../../modules/nat"
  name                    = local.p.name
  public_subnet_id        = local.p.public_subnet_ids[0]
  private_route_table_ids = local.p.private_route_table_ids
}

module "ecr_endpoints" {
  source            = "../../../modules/ecr-endpoints"
  name              = local.p.name
  region            = local.region
  vpc_id            = local.p.vpc_id
  subnet_ids        = [local.p.app_subnet_ids[0]]
  security_group_id = local.p.security_groups.vpce
}

module "alb" {
  source              = "../../../modules/alb"
  name                = local.p.name
  vpc_id              = local.p.vpc_id
  public_subnet_ids   = local.p.public_subnet_ids
  security_group_id   = local.p.security_groups.alb
  origin_verify_value = data.terraform_remote_state.edge.outputs.origin_verify_value
}

module "cluster" {
  source                = "../../../modules/ecs-cluster"
  name                  = local.p.name
  subnet_ids            = local.p.app_subnet_ids
  instance_profile_name = local.p.iam.node_instance_profile
  pools = {
    business = {
      instance_type     = var.business_instance_type
      security_group_id = local.p.security_groups.business
      min_size          = 1
      max_size          = 1 # 2 only after multi-replica safety tests (design §5)
      desired_capacity  = 1
    }
    evidence = {
      instance_type     = var.evidence_instance_type
      security_group_id = local.p.security_groups.evidence
      min_size          = 1
      max_size          = 1
      desired_capacity  = 1
    }
  }
  depends_on = [module.nat, module.ecr_endpoints] # nodes need egress to join the cluster
}

locals {
  system_environment = {
    ASPNETCORE_FORWARDEDHEADERS_ENABLED = "true"
    Mqtt__Host                          = local.p.iot_endpoint
    Mongo__DatabaseName                 = "warotrans_operations"
    EvidenceBridge__RecorderBaseUrl     = local.web_url # through CloudFront: it adds the origin header
    Cors__AllowedOrigins__0             = local.web_url
    Traffic__SemanticMapS3Uri           = var.semantic_bundle_s3_uri
    Traffic__SemanticMapS3Region        = local.region
    MapAssetStorage__S3__BucketName     = local.p.evidence_bucket
    MapAssetStorage__S3__Region         = local.region
  }
  system_secrets = {
    ConnectionStrings__PostgreSQL = format(local.ref["connection-strings"], "system_postgres")
    Postgres__ConnectionString    = format(local.ref["connection-strings"], "system_postgres")
    ConnectionStrings__MongoDB    = format(local.ref["connection-strings"], "mongo")
    Mongo__ConnectionString       = format(local.ref["connection-strings"], "mongo")
    Authentication__Jwt__Key      = format(local.ref["app"], "jwt_key")
    EvidenceBridge__ServiceToken  = format(local.ref["app"], "evidence_service_token")
    Mqtt__ClientCertificatePem    = format(local.ref["iot-host"], "cert_pem")
    Mqtt__ClientPrivateKeyPem     = format(local.ref["iot-host"], "private_key_pem")
  }
  evidence_environment = merge(local.evidence_settings, {
    ASPNETCORE_FORWARDEDHEADERS_ENABLED = "true"
    Evidence__CoreBaseUrl               = local.web_url
    Evidence__MigrateOnStartup          = "true" # the Recorder is the only owner of the Evidence migrations (ADR 0012)
  })
  evidence_secrets = {
    ConnectionStrings__Evidence = format(local.ref["connection-strings"], "evidence_postgres")
    Evidence__ServiceToken      = format(local.ref["app"], "evidence_service_token")
    Authentication__Jwt__Key    = format(local.ref["app"], "jwt_key")
  }
}

module "system" {
  source             = "../../../modules/ecs-service"
  name               = "warotrans-system"
  cluster_arn        = module.cluster.cluster_arn
  capacity_provider  = module.cluster.capacity_providers["business"]
  image              = local.images["system"]
  container_port     = 5090
  cpu                = 512
  memory_reservation = 1024
  memory             = 2560
  environment        = local.system_environment
  secrets            = local.system_secrets
  execution_role_arn = local.p.iam.execution_role_arn
  task_role_arn      = local.p.iam.task_role_arns.system
  log_group          = local.p.log_groups.system
  region             = local.region
  target_group_arn   = module.alb.target_group_arns.system
  depends_on         = [module.cluster]
}

# One-off: `aws ecs run-task --task-definition warotrans-system-migrate` (deploy-demo.yml, run_migrations=true).
module "migrate" {
  source             = "../../../modules/ecs-service"
  name               = "warotrans-system-migrate"
  create_service     = false
  cluster_arn        = module.cluster.cluster_arn
  capacity_provider  = module.cluster.capacity_providers["business"]
  image              = local.images["system"]
  command            = ["--migrate"]
  cpu                = 256
  memory_reservation = 384
  memory             = 768
  environment        = { Mongo__DatabaseName = "warotrans_operations" }
  secrets = {
    ConnectionStrings__PostgreSQL = format(local.ref["connection-strings"], "system_postgres_migrator")
    Postgres__ConnectionString    = format(local.ref["connection-strings"], "system_postgres_migrator")
    ConnectionStrings__MongoDB    = format(local.ref["connection-strings"], "mongo")
    Mongo__ConnectionString       = format(local.ref["connection-strings"], "mongo")
    Authentication__Jwt__Key      = format(local.ref["app"], "jwt_key")
    EvidenceBridge__ServiceToken  = format(local.ref["app"], "evidence_service_token") # validated at start
  }
  execution_role_arn = local.p.iam.execution_role_arn
  task_role_arn      = local.p.iam.task_role_arns.system
  log_group          = local.p.log_groups.migrate
  region             = local.region
}

module "recorder" {
  source             = "../../../modules/ecs-service"
  name               = "warotrans-evidence-recorder"
  cluster_arn        = module.cluster.cluster_arn
  capacity_provider  = module.cluster.capacity_providers["evidence"]
  image              = local.images["evidence-recorder"]
  container_port     = 5095
  cpu                = 256
  memory_reservation = 384
  memory             = 768
  environment        = local.evidence_environment
  secrets            = local.evidence_secrets
  execution_role_arn = local.p.iam.execution_role_arn
  task_role_arn      = local.p.iam.task_role_arns.recorder
  log_group          = local.p.log_groups["evidence-recorder"]
  region             = local.region
  target_group_arn   = module.alb.target_group_arns.recorder
  depends_on         = [module.cluster]
}

module "worker" {
  source             = "../../../modules/ecs-service"
  name               = "warotrans-evidence-worker"
  cluster_arn        = module.cluster.cluster_arn
  capacity_provider  = module.cluster.capacity_providers["evidence"]
  image              = local.images["evidence-worker"]
  cpu                = 256
  memory_reservation = 512
  memory             = 896
  environment        = local.evidence_environment
  secrets            = { ConnectionStrings__Evidence = format(local.ref["connection-strings"], "evidence_postgres") }
  execution_role_arn = local.p.iam.execution_role_arn
  task_role_arn      = local.p.iam.task_role_arns.worker
  log_group          = local.p.log_groups["evidence-worker"]
  region             = local.region
  depends_on         = [module.cluster]
}

output "alb_dns_name" {
  value = module.alb.dns_name
}

output "cluster_name" {
  value = module.cluster.cluster_name
}

output "services" {
  value = {
    system   = module.system.service_name
    recorder = module.recorder.service_name
    worker   = module.worker.service_name
  }
}

output "migrate_task_family" {
  value = module.migrate.family
}

output "nat_public_ip" {
  value = module.nat.public_ip
}

output "app_subnet_ids" {
  value = local.p.app_subnet_ids
}

output "business_sg_id" {
  value = local.p.security_groups.business
}
