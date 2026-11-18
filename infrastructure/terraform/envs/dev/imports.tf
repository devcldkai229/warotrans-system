# The bucket existed before Terraform (created by hand for the map assets). These blocks adopt it and its existing
# settings into the state on the first plan/apply; nothing is recreated (prevent_destroy guards the bucket).
# Requires Terraform >= 1.5. After the first successful apply these blocks are no-ops and may stay.

import {
  to = module.storage.aws_s3_bucket.this
  id = var.bucket_name
}

import {
  to = module.storage.aws_s3_bucket_server_side_encryption_configuration.this
  id = var.bucket_name
}

import {
  to = module.storage.aws_s3_bucket_ownership_controls.this
  id = var.bucket_name
}

import {
  to = module.storage.aws_s3_bucket_public_access_block.this
  id = var.bucket_name
}

# The existing policy (public read of EVERY object) is adopted, then narrowed to maps/ by the plan: review that diff.
import {
  to = module.storage.aws_s3_bucket_policy.this
  id = var.bucket_name
}
