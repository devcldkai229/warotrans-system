variable "name_prefix" {
  type    = string
  default = "warotrans-evidence"
}

variable "environment" {
  type = string
}

variable "mediaconvert_queue_arn" {
  type = string
}

variable "result_queue_arn" {
  type = string
}

variable "result_queue_url" {
  type = string
}
