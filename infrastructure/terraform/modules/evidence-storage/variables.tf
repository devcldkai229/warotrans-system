variable "bucket_name" {
  description = "The existing bucket (imported, never recreated)."
  type        = string
}

variable "raw_prefix" {
  description = "Original segments; must match EvidenceKeys.RawPrefix."
  type        = string
  default     = "raw/transport-requests/"
}

variable "playback_prefix" {
  description = "HLS output; must match EvidenceKeys.PlaybackPrefix."
  type        = string
  default     = "playback/transport-requests/"
}

variable "maps_prefix" {
  description = "Map assets of the Navigation module (MapAssetStorage:S3:KeyPrefix)."
  type        = string
  default     = "maps/"
}

variable "public_map_assets" {
  description = "Keep maps/ publicly readable as today (Navigation's S3MapAssetStore uses public URLs)."
  type        = bool
  default     = true
}

variable "raw_retention_days" {
  description = "Proposal (spec §7.3), not an approved policy: raw originals kept this long."
  type        = number
  default     = 90
}

variable "playback_retention_days" {
  description = "Proposal: HLS renditions kept this long (re-made from raw if needed)."
  type        = number
  default     = 30
}

variable "segment_ingest_queue_arn" {
  type = string
}

variable "cloudfront_distribution_arn" {
  description = "Null until the distribution exists (first apply creates it, the policy follows)."
  type        = string
  default     = null
}
