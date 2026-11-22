variable "name_prefix" {
  type    = string
  default = "warotrans-evidence"
}

variable "environment" {
  type = string
}

variable "max_receive_count" {
  description = "Receives before a message goes to its DLQ (spec §8.4)."
  type        = number
  default     = 5
}

variable "bucket_arn" {
  type = string
}

variable "account_id" {
  type = string
}
