variable "name_prefix" {
  type    = string
  default = "warotrans-evidence"
}

variable "environment" {
  type = string
}

variable "account_id" {
  type = string
}

variable "bucket_arn" {
  type = string
}

variable "raw_prefix" {
  type = string
}

variable "playback_prefix" {
  type = string
}
