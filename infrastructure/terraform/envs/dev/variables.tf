variable "environment" {
  type    = string
  default = "dev"
}

variable "region" {
  description = "Same region as the bucket and MediaConvert (S3 -> SQS notifications need one region)."
  type        = string
  default     = "ap-southeast-1"
}

variable "bucket_name" {
  description = "The existing bucket (imports.tf)."
  type        = string
  default     = "warotrans-ob-storage"
}

variable "public_map_assets" {
  type    = bool
  default = true
}

variable "raw_retention_days" {
  type    = number
  default = 90
}

variable "playback_retention_days" {
  type    = number
  default = 30
}

variable "cloudfront_public_key_file" {
  description = "PEM written by scripts/gen-cloudfront-key.sh."
  type        = string
  default     = "cloudfront_public_key.pem"
}

variable "cloudfront_key_version" {
  type    = string
  default = "v1"
}

variable "signing_key_parameter_name" {
  description = "SSM SecureString holding the CloudFront private key (scripts/gen-cloudfront-key.sh)."
  type        = string
  default     = "/warotrans/evidence/dev/cloudfront-private-key"
}

variable "ui_origins" {
  type    = list(string)
  default = ["http://localhost:5173", "http://127.0.0.1:5173"]
}

variable "playback_custom_domain" {
  type    = string
  default = null
}

variable "playback_acm_certificate_arn" {
  type    = string
  default = null
}

variable "alert_email" {
  type    = string
  default = null
}
