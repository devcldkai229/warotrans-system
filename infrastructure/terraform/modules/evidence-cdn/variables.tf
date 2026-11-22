variable "name_prefix" {
  type    = string
  default = "warotrans-evidence"
}

variable "environment" {
  type = string
}

variable "bucket_regional_domain_name" {
  type = string
}

variable "public_key_pem" {
  description = "PEM public key from scripts/gen-cloudfront-key.sh (the private key goes to SSM, never here)."
  type        = string
}

variable "key_version" {
  description = "Bump to rotate the signing key (a new public key is created next to the key group)."
  type        = string
  default     = "v1"
}

variable "ui_origins" {
  description = "Web origins allowed to fetch HLS (CORS)."
  type        = list(string)
}

variable "price_class" {
  type    = string
  default = "PriceClass_200" # includes Asia
}

variable "custom_domain" {
  description = "e.g. media.example.com under the UI's parent domain, needed for signed cookies; null = *.cloudfront.net (signed URLs)."
  type        = string
  default     = null
}

variable "acm_certificate_arn" {
  description = "us-east-1 ACM certificate for custom_domain."
  type        = string
  default     = null
}
