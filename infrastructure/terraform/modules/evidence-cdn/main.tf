# CloudFront in front of the private playback prefix (spec §9.5): Origin Access Control (the bucket stays private),
# every request must be signed by the Evidence key group (signed cookies with a custom domain, signed URLs otherwise:
# the Recorder's Playback:GrantMode). The raw prefix is never reachable through it (bucket policy: playback/* only).

resource "aws_cloudfront_origin_access_control" "this" {
  name                              = "${var.name_prefix}-${var.environment}"
  description                       = "Evidence playback (HLS) from the private bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Public half of the key the Recorder signs with (scripts/gen-cloudfront-key.sh); the private half is in SSM only.
resource "aws_cloudfront_public_key" "this" {
  name    = "${var.name_prefix}-${var.environment}-${var.key_version}"
  comment = "Evidence playback grants (${var.key_version})"
  # CloudFront stores the PEM with LF; openssl on Windows writes CRLF, which would otherwise replace the key every plan.
  encoded_key = replace(var.public_key_pem, "\r\n", "\n")

  # Rotation (a new key_version): the key group moves to the new key first, then the old one is deleted. Deleting
  # first fails with PublicKeyInUse while the key group still names it.
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_cloudfront_key_group" "this" {
  name    = "${var.name_prefix}-${var.environment}"
  items   = [aws_cloudfront_public_key.this.id]
  comment = "Signs Evidence playback grants"
}

resource "aws_cloudfront_response_headers_policy" "cors" {
  name = "${var.name_prefix}-cors-${var.environment}"

  cors_config {
    # Credentials (the signed cookies of GrantMode=Cookie) forbid "*": CloudFront wants the request headers named.
    # An HLS player sends Range; the rest are the usual conditional/simple request headers.
    access_control_allow_credentials = true
    access_control_allow_headers {
      items = ["Range", "Origin", "Accept", "Accept-Encoding", "If-None-Match", "If-Modified-Since"]
    }
    access_control_allow_methods {
      items = ["GET", "HEAD", "OPTIONS"]
    }
    access_control_allow_origins {
      items = var.ui_origins
    }
    access_control_max_age_sec = 600
    origin_override            = true
  }
}

# Signed requests differ only by their signature: the cache key ignores the signature query parameters.
resource "aws_cloudfront_cache_policy" "hls" {
  name        = "${var.name_prefix}-hls-${var.environment}"
  default_ttl = 86400
  max_ttl     = 31536000
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
    enable_accept_encoding_gzip   = true
    enable_accept_encoding_brotli = true
  }
}

resource "aws_cloudfront_distribution" "this" {
  enabled         = true
  comment         = "WaroTrans Evidence playback (${var.environment})"
  price_class     = var.price_class
  is_ipv6_enabled = true
  aliases         = var.custom_domain == null ? [] : [var.custom_domain]

  origin {
    domain_name              = var.bucket_regional_domain_name
    origin_id                = "evidence-playback"
    origin_access_control_id = aws_cloudfront_origin_access_control.this.id
  }

  default_cache_behavior {
    target_origin_id           = "evidence-playback"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = aws_cloudfront_cache_policy.hls.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.cors.id
    trusted_key_groups         = [aws_cloudfront_key_group.this.id]
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = var.custom_domain == null
    acm_certificate_arn            = var.custom_domain == null ? null : var.acm_certificate_arn
    ssl_support_method             = var.custom_domain == null ? null : "sni-only"
    minimum_protocol_version       = var.custom_domain == null ? "TLSv1" : "TLSv1.2_2021"
  }
}
