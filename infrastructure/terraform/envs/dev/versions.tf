terraform {
  required_version = ">= 1.5.0" # import blocks

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = "WaroTrans"
      Component   = "Evidence"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}
