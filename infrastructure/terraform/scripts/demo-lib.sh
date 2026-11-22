# Shared helpers of the demo scripts (sourced). Needs: aws CLI v2 (signed in), terraform, python3 or python, docker.
# Never prints a secret value.
set -euo pipefail

TF_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGION="${AWS_REGION:-ap-southeast-1}"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
STATE_BUCKET="${STATE_BUCKET:-warotrans-tfstate-$ACCOUNT_ID}"
PY="$(command -v python3 || command -v python)"
# Git Bash rewrites arguments that look like POSIX paths for Windows programs: keep SSM / log names as they are.
export MSYS2_ARG_CONV_EXCL="/warotrans-demo;/aws/"

declare -A TF_INITIALISED=()
tf_out() { # tf_out <stack> <output> -> raw value (strings) or JSON; the stack is initialised once per script run
  if [[ -z "${TF_INITIALISED[$1]:-}" ]]; then
    terraform -chdir="$TF_ROOT/envs/demo/$1" init -input=false -reconfigure -backend-config="bucket=$STATE_BUCKET" >/dev/null
    TF_INITIALISED[$1]=1
  fi
  terraform -chdir="$TF_ROOT/envs/demo/$1" output -json "$2" \
    | "$PY" -c 'import json,sys;v=json.load(sys.stdin);print(v if isinstance(v,str) else json.dumps(v))'
}

json_get() { # json_get <json> <key>
  "$PY" -c 'import json,sys;print(json.loads(sys.argv[1])[sys.argv[2]])' "$1" "$2"
}

secret_get() { # secret_get <secret-id> -> JSON ({} when it has no value yet)
  aws secretsmanager get-secret-value --region "$REGION" --secret-id "$1" --query SecretString --output text 2>/dev/null \
    || echo '{}'
}

secret_merge() { # secret_merge <secret-id> <json with keys to set>: keeps the other keys
  local current merged
  current="$(secret_get "$1")"
  merged="$("$PY" -c 'import json,sys;a=json.loads(sys.argv[1] or "{}");a.update(json.loads(sys.argv[2]));print(json.dumps(a))' \
    "$current" "$2")"
  aws secretsmanager put-secret-value --region "$REGION" --secret-id "$1" --secret-string "$merged" >/dev/null
}

# Windows aws.exe / python need Windows paths (Git Bash gives /c/...).
winpath() { cygpath -w "$1" 2>/dev/null || echo "$1"; }

rand() { "$PY" -c 'import secrets,sys;print(secrets.token_urlsafe(int(sys.argv[1])))' "${1:-32}"; }

# Run a shell script on the MongoDB host (inside the VPC: it reaches RDS and MongoDB) through Session Manager Run
# Command and print its output. Secrets are read ON the host from Secrets Manager (its role may), so no value passes
# through the command or its history. Needs the lab on (Session Manager goes out through the NAT).
#   remote "<script>" [timeout seconds]        DEMO_DRY_RUN=1: print the script instead
remote() {
  local instance cmd status params timeout="${2:-1800}"
  if [[ -n "${DEMO_DRY_RUN:-}" ]]; then printf '%s\n' "$1"; return 0; fi
  instance="$(tf_out persistent mongo_instance_id)"
  params="$("$PY" -c 'import json,sys;print(json.dumps({"commands":[sys.argv[1]],"executionTimeout":[sys.argv[2]]}))' \
    "$1" "$timeout")"
  cmd=$(aws ssm send-command --region "$REGION" --instance-ids "$instance" --document-name AWS-RunShellScript \
    --timeout-seconds 600 --parameters "$params" --query Command.CommandId --output text)
  status=Pending
  for _ in $(seq 1 $(( timeout / 3 + 20 ))); do
    status=$(aws ssm get-command-invocation --region "$REGION" --command-id "$cmd" --instance-id "$instance" \
      --query Status --output text 2>/dev/null || echo Pending)
    case "$status" in Success|Failed|Cancelled|TimedOut) break ;; esac
    sleep 3
  done
  aws ssm get-command-invocation --region "$REGION" --command-id "$cmd" --instance-id "$instance" \
    --query '[StandardOutputContent,StandardErrorContent]' --output text
  [[ "$status" == "Success" ]] || { echo "remote command: $status" >&2; return 1; }
}

# Preamble of every remote script: read a secret / one JSON key into a variable without echoing it.
REMOTE_PRE='set -euo pipefail
sec() { aws secretsmanager get-secret-value --region '"$REGION"' --secret-id "$1" --query SecretString --output text; }
key() { python3 -c "import json,sys;print(json.loads(sys.argv[1])[sys.argv[2]])" "$1" "$2"; }
test -f /opt/warotrans/.setup-done || { echo "MongoDB host setup not finished yet (needs the NAT; retries every minute)"; exit 3; }'
