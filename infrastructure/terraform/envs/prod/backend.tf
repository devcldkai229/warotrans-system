# Local state for dev (git-ignored). For a shared environment move it to an S3 backend with locking, e.g.:
#   terraform {
#     backend "s3" {
#       bucket       = "<state bucket>"
#       key          = "warotrans/evidence/prod.tfstate"
#       region       = "ap-southeast-1"
#       use_lockfile = true
#     }
#   }
# then `terraform init -migrate-state`.
terraform {
  backend "local" {
    path = "terraform.tfstate"
  }
}
