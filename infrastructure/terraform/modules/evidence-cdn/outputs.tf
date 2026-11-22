output "distribution_arn" {
  value = aws_cloudfront_distribution.this.arn
}

output "distribution_id" {
  value = aws_cloudfront_distribution.this.id
}

output "domain_name" {
  value = aws_cloudfront_distribution.this.domain_name
}

output "public_key_id" {
  description = "Evidence:Playback:CloudFrontKeyPairId of the Recorder."
  value       = aws_cloudfront_public_key.this.id
}
