# Terraform: Evidence AWS resources

Everything the Evidence Recorder and Worker need on AWS (ADR 0012), in `ap-southeast-1`:

| Module | What it makes |
|---|---|
| `evidence-storage` | The **existing** bucket `warotrans-ob-storage` (imported, `prevent_destroy`), its encryption, ownership, public-access block, lifecycle (`raw/` 90 d, `playback/` 30 d), the `raw/transport-requests/*.avi` notification and the bucket policy |
| `evidence-queues` | SQS `segment-ingest`, `media-process`, `media-result`, each with a DLQ (`maxReceiveCount` 5) |
| `evidence-mediaconvert` | MediaConvert queue, service role, HLS job template (720p + 480p, 6 s, source frame rate) |
| `evidence-events` | EventBridge rule: MediaConvert COMPLETE / ERROR / CANCELED → `media-result` |
| `evidence-cdn` | CloudFront over `playback/` with OAC, the signing public key + key group, CORS for the UI origins |
| `evidence-iam` | IAM users `warotrans-evidence-recorder-<env>` and `-worker-<env>`, least privilege. **No access keys** are made here |
| `evidence-alarms` | CloudWatch alarms on DLQ depth and oldest message age, SNS topic (email optional) |

`envs/dev` and `envs/prod` compose the modules; only the values differ.

## Safety rules

- **The bucket already exists** and serves the map assets. `envs/<env>/imports.tf` adopts it and its current
  settings on the first plan. A plan must never show `destroy` or `must be replaced` for anything under
  `module.storage`. If it does, stop.
- **The bucket policy changes.** The bucket policy before Terraform gave public read on *every* object. Terraform narrows it to
  `maps/*` (kept public for the existing map links, `public_map_assets = true`) and adds CloudFront's read of
  `playback/*`. Evidence video is never public. Check that the map links in the web app still load after the apply.
- State is local (`terraform.tfstate`, git-ignored). Keep it safe; whoever runs the next apply needs it. To share
  it, move to an S3 backend (see `backend.tf`).
- Nothing secret goes into `*.tf` or `terraform.tfvars`. The CloudFront private key goes to SSM only.
- `apply` creates paid resources: MediaConvert per minute of output, CloudFront and S3 traffic, SQS and alarms (small).

## First apply (dev)

```bash
cd infrastructure/terraform
aws sts get-caller-identity                              # the profile with admin rights on the account
scripts/gen-cloudfront-key.sh dev v1                     # private key -> SSM, public key -> envs/dev/cloudfront_public_key.pem
cd envs/dev
cp terraform.tfvars.example terraform.tfvars             # adjust ui_origins, alert_email
terraform init
terraform plan -out dev.tfplan                           # review: 5 imports, no destroy, the policy diff
terraform apply dev.tfplan
terraform output evidence_settings                       # paste into the Recorder's and Worker's environment
```

Then make the access keys by hand (they are not in the state on purpose) and put them in the services' environment
or AWS profile:

```bash
aws iam create-access-key --user-name warotrans-evidence-recorder-dev
aws iam create-access-key --user-name warotrans-evidence-worker-dev
```

The plan of 2026-11-17 against the real account showed: 5 to import, 35 to add, 3 to change, 0 to destroy.

## Checks

```bash
terraform fmt -check -recursive
terraform -chdir=envs/dev init -backend=false && terraform -chdir=envs/dev validate
```

CI runs both on every PR (`.github/workflows/pr-check.yml`, job `terraform`). `plan` and `apply` stay manual because they
need AWS credentials.

## Key rotation (CloudFront)

1. `scripts/gen-cloudfront-key.sh dev v2`, then set `cloudfront_key_version = "v2"` and run `terraform apply`.
2. Point the Recorder at the new key: set `Evidence__Playback__CloudFrontKeyPairId` (output `cloudfront_key_pair_id`).
3. Remove the old public key at the next apply.
