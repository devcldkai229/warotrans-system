# AWS IoT Core: one thing per robot (and one for the Host), each certificate limited to its own topics.
# Certificates are NOT made here (the private key would sit in the state): scripts/iot-issue-cert.sh creates one from a
# CSR made on the machine that keeps the key, then attaches it to the thing and its policy.
#
# Topics are the existing ones (warotrans/v1/robots/<code>/<kind>, warotrans/v1/traffic/epoch). Client ids: a robot
# connects as its thing name (= robot code), the Host as <host_client_id> (subscriber) and <host_client_id>-cmd-pub.

variable "name" {
  type = string
}

variable "robot_things" {
  description = "Robot codes; each is a thing name and the MQTT client id of that robot."
  type        = list(string)
}

variable "host_client_id" {
  type    = string
  default = "warotrans-host"
}

variable "topic_prefix" {
  type    = string
  default = "warotrans/v1"
}

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

data "aws_iot_endpoint" "ats" {
  endpoint_type = "iot:Data-ATS"
}

locals {
  arn = "arn:aws:iot:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}"
  own = "${var.topic_prefix}/robots/$${iot:Connection.Thing.ThingName}"
}

resource "aws_iot_thing" "robot" {
  for_each = toset(var.robot_things)
  name     = each.value
}

resource "aws_iot_thing" "host" {
  name = var.host_client_id
}

# A robot: connect as its own thing, publish and receive only under its own topics, plus the fleet-wide epoch.
resource "aws_iot_policy" "robot" {
  name = "${var.name}-robot"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Action    = "iot:Connect"
        Resource  = "${local.arn}:client/$${iot:Connection.Thing.ThingName}"
        Condition = { Bool = { "iot:Connection.Thing.IsAttached" = "true" } }
      },
      { Effect = "Allow", Action = "iot:Publish", Resource = "${local.arn}:topic/${local.own}/*" },
      {
        Effect = "Allow"
        Action = "iot:Subscribe"
        Resource = [
          "${local.arn}:topicfilter/${local.own}/*",
          "${local.arn}:topicfilter/${var.topic_prefix}/traffic/epoch",
        ]
      },
      {
        Effect = "Allow"
        Action = "iot:Receive"
        Resource = [
          "${local.arn}:topic/${local.own}/*",
          "${local.arn}:topic/${var.topic_prefix}/traffic/epoch",
        ]
      },
    ]
  })
}

# The Host: its two fixed client ids, every robot's topics, the retained epoch.
resource "aws_iot_policy" "host" {
  name = "${var.name}-host"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = "iot:Connect"
        Resource = [
          "${local.arn}:client/${var.host_client_id}",
          "${local.arn}:client/${var.host_client_id}-cmd-pub",
          # an operator's probe with the Host certificate, without taking the Host's own sessions over
          "${local.arn}:client/${var.host_client_id}-diag",
        ]
      },
      {
        Effect = "Allow"
        Action = ["iot:Publish", "iot:Receive"]
        Resource = [
          "${local.arn}:topic/${var.topic_prefix}/robots/*",
          "${local.arn}:topic/${var.topic_prefix}/traffic/epoch",
        ]
      },
      { Effect = "Allow", Action = "iot:RetainPublish", Resource = "${local.arn}:topic/${var.topic_prefix}/traffic/epoch" },
      { Effect = "Allow", Action = "iot:Subscribe", Resource = "${local.arn}:topicfilter/${var.topic_prefix}/robots/*" },
    ]
  })
}

output "endpoint" {
  description = "MQTT host (TLS 8883) for robots and the Host."
  value       = data.aws_iot_endpoint.ats.endpoint_address
}

output "robot_policy_name" {
  value = aws_iot_policy.robot.name
}

output "host_policy_name" {
  value = aws_iot_policy.host.name
}
