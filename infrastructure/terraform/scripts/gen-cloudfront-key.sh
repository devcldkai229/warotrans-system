#!/usr/bin/env bash
# Makes the CloudFront signing key pair of an environment.
#   infrastructure/terraform/scripts/gen-cloudfront-key.sh dev [v1]
# - the PRIVATE key goes straight to SSM Parameter Store as a SecureString (the Recorder reads it there) and is
#   deleted from disk;
# - the PUBLIC key is written to envs/<env>/cloudfront_public_key.pem for Terraform (git-ignored).
# Rotation: run with a new version (v2), set cloudfront_key_version, apply, switch the Recorder, remove v1.
set -euo pipefail
ENV="${1:?environment (dev|prod)}"
VERSION="${2:-v1}"
REGION="${AWS_REGION:-ap-southeast-1}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
PARAM="/warotrans/evidence/${ENV}/cloudfront-private-key"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
openssl genrsa -out "$TMP/private.pem" 2048 2>/dev/null
openssl rsa -pubout -in "$TMP/private.pem" -out "$HERE/envs/${ENV}/cloudfront_public_key.pem" 2>/dev/null
# Git Bash on Windows: aws.exe cannot open an MSYS path (/tmp/...) inside file://, so give it the Windows form.
KEYFILE="$TMP/private.pem"
if command -v cygpath >/dev/null 2>&1; then KEYFILE="$(cygpath -m "$KEYFILE")"; fi
# MSYS_NO_PATHCONV: otherwise Git Bash turns the parameter name /warotrans/... into C:/Program Files/Git/warotrans/...
MSYS_NO_PATHCONV=1 aws ssm put-parameter --region "$REGION" --name "$PARAM" --type SecureString --overwrite \
  --value "file://$KEYFILE" --description "WaroTrans Evidence CloudFront signing key ${VERSION}" >/dev/null
echo "private key -> SSM ${PARAM} (${REGION}); public key -> envs/${ENV}/cloudfront_public_key.pem"
