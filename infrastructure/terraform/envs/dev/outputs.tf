output "queue_urls" {
  value = module.queues.queue_urls
}

output "mediaconvert_queue_arn" {
  value = module.mediaconvert.queue_arn
}

output "mediaconvert_role_arn" {
  value = module.mediaconvert.role_arn
}

output "playback_domain" {
  value = module.cdn.domain_name
}

output "cloudfront_key_pair_id" {
  value = module.cdn.public_key_id
}

output "iam_users" {
  value = { recorder = module.iam.recorder_user, worker = module.iam.worker_user }
}

# Paste into the Recorder's and Worker's configuration (environment variables shown; no secret in here).
output "evidence_settings" {
  value = {
    "Evidence__Storage__Provider"                 = "S3"
    "Evidence__Storage__RawBucket"                = module.storage.bucket_name
    "Evidence__Storage__PlaybackBucket"           = module.storage.bucket_name
    "Evidence__Storage__Region"                   = var.region
    "Evidence__Queues__Provider"                  = "Sqs"
    "Evidence__Queues__Region"                    = var.region
    "Evidence__Queues__Urls__segment-ingest"      = module.queues.queue_urls["segment-ingest"]
    "Evidence__Queues__Urls__media-process"       = module.queues.queue_urls["media-process"]
    "Evidence__Queues__Urls__media-result"        = module.queues.queue_urls["media-result"]
    "Evidence__Media__Provider"                   = "MediaConvert"
    "Evidence__Media__MediaConvertQueueArn"       = module.mediaconvert.queue_arn
    "Evidence__Media__MediaConvertRoleArn"        = module.mediaconvert.role_arn
    "Evidence__Playback__Provider"                = "CloudFront"
    "Evidence__Playback__CloudFrontDomain"        = module.cdn.domain_name
    "Evidence__Playback__CloudFrontKeyPairId"     = module.cdn.public_key_id
    "Evidence__Playback__PrivateKeyParameterName" = var.signing_key_parameter_name
  }
}
