# Terraform: WaroTrans on AWS

Two parts:

- **`envs/dev`**: the Evidence resources the laptop Recorder/Worker use, applied since 2026-11-17. See "Evidence AWS
  resources" below.
- **`envs/demo/*`**: the whole system on AWS for lab demos (design: `WaroTrans_AWS_Deployment_Architecture_Terraform.md`).
  See "AWS demo" just below.

## AWS demo (`envs/demo`)

Three stacks, each with its own state in `s3://warotrans-tfstate-<account>/warotrans/demo/*.tfstate`:

| Stack | Holds | Lab off |
|---|---|---|
| `persistent` | VPC + S3 gateway endpoint, security groups, ECR, RDS PostgreSQL 17, MongoDB EC2 + EBS, IoT things/policies, secrets (empty containers), IAM (tasks, GitHub OIDC), logs, web bucket, SSM release parameters | kept; RDS and MongoDB **stopped** |
| `runtime` | NAT Gateway, ECR interface endpoints, ALB, ECS cluster (business t4g.medium + evidence t4g.small), services, migration task | **destroyed** (billed per hour) |
| `edge` | CloudFront `https://<id>.cloudfront.net`: web from S3, `/api` `/hubs` `/map-assets` `/health` to the ALB | kept; origin = placeholder |

What stays the same as on the laptop:

- **Robots and the System API talk MQTT over TLS to AWS IoT Core.** Each uses its own X.509 certificate, the topics
  are unchanged.
- **The System API runs as exactly one task.** It is a singleton because of the traffic lease, the in-memory traffic
  state and SignalR without a backplane.
- **The System API and the Recorder call each other through CloudFront.** CloudFront adds the secret origin header,
  and the ALB rejects any request without it.

### First bootstrap

Run these in order from Git Bash with an admin AWS profile. Steps 2-4 are `terraform apply` (they cost money). From
step 5 on, the lab is on.

```bash
cd infrastructure/terraform
B=warotrans-tfstate-$(aws sts get-caller-identity --query Account --output text)
# 1. state bucket
terraform -chdir=bootstrap/state-backend init && terraform -chdir=bootstrap/state-backend apply
# 2. persistent (VPC, RDS, MongoDB host, IoT, ECR, IAM ...)
terraform -chdir=envs/demo/persistent init -backend-config="bucket=$B" && terraform -chdir=envs/demo/persistent apply
# 3. what does not need the VPC: JWT key + service token, the Host's IoT certificate, the semantic bundle,
#    the Evidence settings of envs/dev, the first images (recorded as the release)
scripts/demo-secrets.sh
scripts/iot-issue-cert.sh warotrans-host
scripts/upload-semantic-bundle.sh                      # ../warotrans/.../maps/map_one_v013
scripts/lab.sh evidence-settings
scripts/publish-images.sh --release
# 4. CloudFront (placeholder origin): its address is what robots, the app and the Recorder URL use
terraform -chdir=envs/demo/edge init -backend-config="bucket=$B" && terraform -chdir=envs/demo/edge apply -var state_bucket=$B
# 5. lab on (the services keep restarting until the databases exist - expected)
scripts/lab.sh start
# 6. databases (the MongoDB host finishes its setup a few minutes after the NAT exists)
scripts/db-bootstrap.sh && scripts/mongo-bootstrap.sh
scripts/restore-dev-data.sh                            # the laptop's data (decision 2026-11-22)
scripts/lab.sh migrate && scripts/lab.sh redeploy
# 7. web
scripts/web-release.sh
```

Then:

- **Change the development passwords.** The restored admin, staff and technician accounts still have the well-known
  ones.
- **Robots:**
  1. Run `scripts/iot-issue-cert.sh RBT-001` and `RBT-002`, then copy the files to each robot.
  2. Write `~/.config/warotrans/cloud.env` on each robot (robot repo `tools/cloud.env.example`).
  3. On each robot, run `sudo tools/install_chrony.sh --cloud`.
  4. Start with `MODE=cloud` (RBT-001: `MODE=cloud pi_run_semantic.sh start`; RBT-002: `tools/rbt2_mode.sh cloud`).
- **Mobile app:** set `EXPO_PUBLIC_API_URL=https://<id>.cloudfront.net`.
- **GitHub:**
  - Add the repository variables `AWS_ACCOUNT_ID`, `DEMO_WEB_URL`, `DEMO_WEB_BUCKET` and `DEMO_DISTRIBUTION_ID`.
  - Add an environment `demo` with required reviewers.

### Day to day

| What | Laptop | GitHub Actions |
|---|---|---|
| Lab on / off | `scripts/lab.sh start` / `scripts/lab.sh stop --yes` | Lab start / Lab stop |
| What is billed now | `scripts/lab.sh status` | |
| Build images (never deploys) | `scripts/publish-images.sh` | Publish images |
| Deploy a built sha (optionally migrate) | | Deploy demo |
| Web | `scripts/web-release.sh` | Web release |

Approximate cost in ap-southeast-1:

- **Lab on:** about 0.25-0.30 USD per hour. That is the 3 EC2 instances + RDS + NAT + ALB + 2 interface endpoints.
- **Lab off:** about 8-12 USD per month. That is EBS, RDS storage, S3, ECR, Secrets Manager and CloudFront.
- **RDS** starts by itself after 7 days stopped. The Lab stop workflow stops it again every Monday.

Never `terraform destroy` `persistent`: RDS and the MongoDB volume have `prevent_destroy` and deletion protection.

### Known limits of the demo

- **The robot camera live stream** (`RobotCamera:Robots`) cannot be reached from the cloud. The robots are on the lab
  LAN. Evidence video works.
- **The System API cannot be scaled out.** It needs distributed coordination first (design §5).
- **The robots need Internet** for IoT Core and time sync. Command expiry allows 2 s of clock skew.

---

# Evidence AWS resources (`envs/dev`)

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
  it, move to an S3 backend (see `backend.tf`). Apply `envs/dev` only from the machine that has
  `cloudfront_public_key.pem`: without it the plan removes the CloudFront playback distribution.
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

Without `envs/<env>/cloudfront_public_key.pem` the plan still runs but leaves CloudFront out: it warns with the check
`cloudfront_signing_key`, the CDN module gets `count = 0`, the bucket policy has no CloudFront statement and
`evidence_settings` keeps the Recorder on its Local playback provider. A distribution without its trusted key group
would serve the videos to anyone, so it is never created without the key. Run `scripts/gen-cloudfront-key.sh <env>`
and plan again to add it (6 resources).

Plans against the real account:

| Date | Signing key | Import | Add | Change | Destroy |
|---|---|---|---|---|---|
| 2026-11-17 | yes | 5 | 35 | 3 | 0 |
| 2026-11-18 | not generated yet | 5 | 29 | 3 | 0 |

The 3 changes are the existing bucket: tags only, the public-access block (block public ACLs), and the policy narrowed to
`maps/*` (the only prefix in the bucket on 2026-11-18) plus a TLS-only deny.

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
