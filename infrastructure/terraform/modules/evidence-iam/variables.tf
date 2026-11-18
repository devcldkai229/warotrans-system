variable "name_prefix" {
  type    = string
  default = "warotrans-evidence"
}

variable "environment" {
  type = string
}

variable "region" {
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

variable "queue_arns" {
  type = list(string)
}

variable "mediaconvert_role_arn" {
  type = string
}

variable "signing_key_parameter_arn" {
  type = string
}
