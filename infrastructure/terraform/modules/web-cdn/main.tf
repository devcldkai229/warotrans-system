# The one public entrance (no own domain): https://<id>.cloudfront.net serves the web app from the private S3 bucket
# and passes /api/*, /hubs/* (WebSocket), /map-assets/* and /health to the ALB with the secret origin header. Same
# origin for the browser: the HttpOnly refresh cookie stays first-party, no CORS between web and API.
# The distribution survives the lab being off (stable address for robots and the app); its ALB origin is updated by
# every lab start.

variable "name" {
  type = string
}

variable "web_bucket_id" {
  type = string
}

variable "web_bucket_arn" {
  type = string
}

variable "web_bucket_regional_domain_name" {
  type = string
}

variable "alb_dns_name" {
  description = "Current ALB; a placeholder while the lab is off (API calls then fail with 502, the web still loads)."
  type        = string
}

variable "origin_verify_header" {
  type    = string
  default = "X-Origin-Verify"
}

variable "origin_verify_value" {
  type      = string
  sensitive = true
}

locals {
  # AWS managed policies
  caching_optimized                 = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  caching_disabled                  = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
  all_viewer_and_cloudfront_headers = "33f36d7e-f396-46d9-90e0-52428a34d9dc" # incl. CloudFront-Forwarded-Proto
  api_paths                         = ["/api/*", "/hubs/*", "/map-assets/*", "/health"]
}

resource "aws_cloudfront_origin_access_control" "web" {
  name                              = "${var.name}-web"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Deep links (/tech/fleet/RBT-001) are client-side routes: anything without a file extension is the SPA's index.html.
# Only the default (S3) behaviour runs it, so API 403/404 responses stay what the API said.
resource "aws_cloudfront_function" "spa" {
  name    = "${var.name}-spa-rewrite"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = <<-JS
    function handler(event) {
      var request = event.request;
      var last = request.uri.split('/').pop();
      if (last.indexOf('.') === -1) {
        request.uri = '/index.html';
      }
      return request;
    }
  JS
}

resource "aws_cloudfront_distribution" "this" {
  enabled             = true
  comment             = var.name
  default_root_object = "index.html"
  price_class         = "PriceClass_200" # includes Singapore / Vietnam edges
  http_version        = "http2and3"
  is_ipv6_enabled     = true

  origin {
    origin_id                = "web"
    domain_name              = var.web_bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id
  }

  origin {
    origin_id   = "alb"
    domain_name = var.alb_dns_name
    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "http-only" # ALB without a certificate (no own domain); CloudFront <-> ALB in AWS
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 60
      origin_keepalive_timeout = 60
    }
    custom_header {
      name  = var.origin_verify_header
      value = var.origin_verify_value
    }
  }

  default_cache_behavior {
    target_origin_id       = "web"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = local.caching_optimized
    compress               = true
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa.arn
    }
  }

  dynamic "ordered_cache_behavior" {
    for_each = local.api_paths
    content {
      path_pattern             = ordered_cache_behavior.value
      target_origin_id         = "alb"
      viewer_protocol_policy   = "redirect-to-https"
      allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods           = ["GET", "HEAD"]
      cache_policy_id          = local.caching_disabled
      origin_request_policy_id = local.all_viewer_and_cloudfront_headers
      compress                 = true
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

resource "aws_s3_bucket_policy" "web" {
  bucket = var.web_bucket_id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "CloudFrontRead"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${var.web_bucket_arn}/*"
        Condition = { StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.this.arn } }
      },
      {
        Sid       = "TlsOnly"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [var.web_bucket_arn, "${var.web_bucket_arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
    ]
  })
}

output "domain_name" {
  value = aws_cloudfront_distribution.this.domain_name
}

output "distribution_id" {
  value = aws_cloudfront_distribution.this.id
}
