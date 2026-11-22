variable "name_prefix" {
  type    = string
  default = "warotrans-evidence"
}

variable "environment" {
  type = string
}

variable "queue_names" {
  type = map(string)
}

variable "dlq_names" {
  type = map(string)
}

variable "max_receive_count" {
  type    = number
  default = 5
}

variable "max_age_seconds" {
  type    = number
  default = 900
}

variable "alert_email" {
  type    = string
  default = null
}
