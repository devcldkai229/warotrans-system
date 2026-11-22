#!/usr/bin/env bash
# Issue an AWS IoT Core certificate for one thing. The private key is made HERE and never leaves this machine except:
#   robots:  copied to the robot by you (scp), into ~/.config/warotrans/iot/ (chmod 600)
#   host:    put into the Secrets Manager secret warotrans-demo/iot-host (ECS injects it), local copy deleted
#
#   scripts/iot-issue-cert.sh RBT-001 [outdir]       robot (policy warotrans-demo-robot)
#   scripts/iot-issue-cert.sh warotrans-host         the System API (policy warotrans-demo-host -> Secrets Manager)
#
# Re-running issues a new certificate; deactivate the old one afterwards:
#   aws iot update-certificate --certificate-id <id> --new-status INACTIVE
source "$(dirname "$0")/demo-lib.sh"
THING="${1:?thing name (RBT-001, RBT-002, SIM-001, warotrans-host)}"
OUT="${2:-$HOME/.warotrans-iot/$THING}"
mkdir -p "$OUT"; chmod 700 "$OUT"
if [[ "$THING" == "warotrans-host" ]]; then POLICY="warotrans-demo-host"; else POLICY="warotrans-demo-robot"; fi

KEY="$OUT/$THING.private.key"; CSR="$OUT/$THING.csr"; CERT="$OUT/$THING.cert.pem"
MSYS_NO_PATHCONV=1 openssl req -new -newkey rsa:2048 -nodes -keyout "$(winpath "$KEY")" -out "$(winpath "$CSR")" -subj "/CN=$THING" 2>/dev/null
chmod 600 "$KEY"
ARN=$(aws iot create-certificate-from-csr --region "$REGION" --set-as-active \
  --certificate-signing-request "file://$(winpath "$CSR")" --certificate-pem-outfile "$(winpath "$CERT")" --query certificateArn --output text)
aws iot attach-policy --region "$REGION" --policy-name "$POLICY" --target "$ARN"
aws iot attach-thing-principal --region "$REGION" --thing-name "$THING" --principal "$ARN"
curl -fsS https://www.amazontrust.com/repository/AmazonRootCA1.pem -o "$(winpath "$OUT/AmazonRootCA1.pem")"
rm -f "$CSR"
echo "certificate ${ARN##*/} attached to $THING ($POLICY)"

if [[ "$THING" == "warotrans-host" ]]; then
  "$PY" - "$(winpath "$CERT")" "$(winpath "$KEY")" > "$OUT/secret.json" <<'PY'
import json, sys
print(json.dumps({"cert_pem": open(sys.argv[1]).read(), "private_key_pem": open(sys.argv[2]).read()}))
PY
  aws secretsmanager put-secret-value --region "$REGION" --secret-id warotrans-demo/iot-host \
    --secret-string "file://$(winpath "$OUT/secret.json")" >/dev/null
  rm -f "$OUT/secret.json" "$KEY"
  echo "host certificate and key stored in warotrans-demo/iot-host (local key deleted)"
else
  echo "copy to the robot (then delete here):"
  echo "  ssh <robot> 'mkdir -p ~/.config/warotrans/iot && chmod 700 ~/.config/warotrans/iot'"
  echo "  scp $OUT/{$THING.cert.pem,$THING.private.key,AmazonRootCA1.pem} <robot>:.config/warotrans/iot/"
  echo "  ssh <robot> 'chmod 600 ~/.config/warotrans/iot/*'"
fi
echo "MQTT endpoint: $(tf_out persistent iot_endpoint):8883"
