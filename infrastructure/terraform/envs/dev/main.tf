data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  # The CloudFront private key lives in SSM (SecureString) only; put there by scripts/gen-cloudfront-key.sh. Terraform
  # references it by ARN and never reads it (a data source would copy the secret into the state).
  signing_key_parameter_arn = "arn:aws:ssm:${var.region}:${local.account_id}:parameter${var.signing_key_parameter_name}"

  # CloudFront only exists with its signing key: a distribution without a trusted key group would serve the evidence
  # videos to anyone. Until scripts/gen-cloudfront-key.sh wrote the public key next to this file, the CDN (and the
  # bucket policy statement for it) is left out of the plan instead of failing it.
  cloudfront_public_key_path = "${path.module}/${var.cloudfront_public_key_file}"
  cdn_enabled                = fileexists(local.cloudfront_public_key_path)
}

check "cloudfront_signing_key" {
  assert {
    condition     = local.cdn_enabled
    error_message = "No CloudFront public key at ${local.cloudfront_public_key_path}: CloudFront playback is NOT in this plan. Run scripts/gen-cloudfront-key.sh ${var.environment} first (it puts the private key in SSM), then plan again."
  }
}

module "queues" {
  source      = "../../modules/evidence-queues"
  environment = var.environment
  bucket_arn  = module.storage.bucket_arn
  account_id  = local.account_id
}

module "storage" {
  source                      = "../../modules/evidence-storage"
  bucket_name                 = var.bucket_name
  public_map_assets           = var.public_map_assets
  raw_retention_days          = var.raw_retention_days
  playback_retention_days     = var.playback_retention_days
  segment_ingest_queue_arn    = module.queues.queue_arns["segment-ingest"]
  cloudfront_distribution_arn = local.cdn_enabled ? module.cdn[0].distribution_arn : null
}

module "mediaconvert" {
  source          = "../../modules/evidence-mediaconvert"
  environment     = var.environment
  account_id      = local.account_id
  bucket_arn      = module.storage.bucket_arn
  raw_prefix      = module.storage.raw_prefix
  playback_prefix = module.storage.playback_prefix
}

module "events" {
  source                 = "../../modules/evidence-events"
  environment            = var.environment
  mediaconvert_queue_arn = module.mediaconvert.queue_arn
  result_queue_arn       = module.queues.queue_arns["media-result"]
  result_queue_url       = module.queues.queue_urls["media-result"]
}

module "cdn" {
  source                      = "../../modules/evidence-cdn"
  count                       = local.cdn_enabled ? 1 : 0
  environment                 = var.environment
  bucket_regional_domain_name = module.storage.bucket_regional_domain_name
  public_key_pem              = file(local.cloudfront_public_key_path)
  key_version                 = var.cloudfront_key_version
  ui_origins                  = var.ui_origins
  custom_domain               = var.playback_custom_domain
  acm_certificate_arn         = var.playback_acm_certificate_arn
}

module "iam" {
  source                    = "../../modules/evidence-iam"
  environment               = var.environment
  region                    = var.region
  bucket_arn                = module.storage.bucket_arn
  raw_prefix                = module.storage.raw_prefix
  playback_prefix           = module.storage.playback_prefix
  queue_arns                = values(module.queues.queue_arns)
  mediaconvert_role_arn     = module.mediaconvert.role_arn
  signing_key_parameter_arn = local.signing_key_parameter_arn
}

module "alarms" {
  source      = "../../modules/evidence-alarms"
  environment = var.environment
  queue_names = module.queues.queue_names
  dlq_names   = module.queues.dlq_names
  alert_email = var.alert_email
}
