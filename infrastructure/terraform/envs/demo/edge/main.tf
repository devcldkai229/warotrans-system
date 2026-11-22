# envs/demo/edge: the CloudFront entrance (web + API on one https://<id>.cloudfront.net). Applied once before the
# first runtime, then by every lab start with the new ALB and by every lab stop with the placeholder:
#   terraform apply -var "alb_dns_name=$(terraform -chdir=../runtime output -raw alb_dns_name)"
# Not destroyed with the lab: its address stays the same, robots and the app keep their settings.

terraform {
  required_version = ">= 1.10.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
  backend "s3" {
    key          = "warotrans/demo/edge.tfstate"
    region       = "ap-southeast-1"
    use_lockfile = true
  }
}

provider "aws" {
  region = "ap-southeast-1"
  default_tags {
    tags = { Project = "WaroTrans", Environment = "demo", Stack = "edge", ManagedBy = "Terraform" }
  }
}

variable "state_bucket" {
  type = string
}

variable "alb_dns_name" {
  description = "The runtime ALB; the placeholder while the lab is off."
  type        = string
  default     = "lab-off.warotrans.invalid"
}

data "terraform_remote_state" "persistent" {
  backend = "s3"
  config = {
    bucket = var.state_bucket
    key    = "warotrans/demo/persistent.tfstate"
    region = "ap-southeast-1"
  }
}

locals {
  p = data.terraform_remote_state.persistent.outputs
}

# CloudFront adds it to every request to the ALB; the ALB forwards only requests that carry it.
resource "random_password" "origin_verify" {
  length  = 40
  special = false
}

module "cdn" {
  source                          = "../../../modules/web-cdn"
  name                            = local.p.name
  web_bucket_id                   = local.p.web_bucket.id
  web_bucket_arn                  = local.p.web_bucket.arn
  web_bucket_regional_domain_name = local.p.web_bucket.regional_domain_name
  alb_dns_name                    = var.alb_dns_name
  origin_verify_value             = random_password.origin_verify.result
}

output "domain_name" {
  value = module.cdn.domain_name
}

output "web_url" {
  value = "https://${module.cdn.domain_name}"
}

output "distribution_id" {
  value = module.cdn.distribution_id
}

output "origin_verify_value" {
  value     = random_password.origin_verify.result
  sensitive = true
}
