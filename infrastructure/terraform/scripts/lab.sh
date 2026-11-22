#!/usr/bin/env bash
# Lab switch of the AWS demo (design §10), same steps as .github/workflows/lab-start.yml / lab-stop.yml:
#   scripts/lab.sh start      RDS + MongoDB on, runtime stack (NAT, ECR endpoints, ALB, ECS) applied, CloudFront -> ALB
#   scripts/lab.sh stop --yes ECS to 0, CloudFront -> placeholder, runtime stack DESTROYED, MongoDB + RDS stopped
#   scripts/lab.sh status     what is running / billed per hour right now
#   scripts/lab.sh migrate    one-off migration task (Host --migrate), waits for its exit code
#   scripts/lab.sh redeploy   restart the three services (new secrets, new task definition)
#   scripts/lab.sh deploy     the release in SSM (scripts/publish-images.sh --release): new task definitions, services
#                             moved onto them (the laptop twin of deploy-demo.yml, without migrations)
#   scripts/lab.sh evidence-settings   copy envs/dev's evidence_settings output to SSM /warotrans-demo/evidence-settings
# The runtime stack reads the release images and the Evidence settings from SSM (no local files).
source "$(dirname "$0")/demo-lib.sh"
RUNTIME="$TF_ROOT/envs/demo/runtime"; EDGE="$TF_ROOT/envs/demo/edge"; PERSISTENT="$TF_ROOT/envs/demo/persistent"
DEV_ENV_DIR="${DEV_ENV_DIR:-$TF_ROOT/envs/dev}"
SERVICES=(warotrans-system warotrans-evidence-recorder warotrans-evidence-worker)
CLUSTER=warotrans-demo

init() { terraform -chdir="$1" init -input=false -reconfigure -backend-config="bucket=$STATE_BUCKET" >/dev/null; }

rds_id() { tf_out persistent rds_identifier; }
mongo_id() { tf_out persistent mongo_instance_id; }

start() {
  init "$PERSISTENT"; init "$RUNTIME"; init "$EDGE"

  echo "== databases on"
  local rds; rds="$(rds_id)"
  if [[ "$(aws rds describe-db-instances --region "$REGION" --db-instance-identifier "$rds" --query 'DBInstances[0].DBInstanceStatus' --output text)" == "stopped" ]]; then
    aws rds start-db-instance --region "$REGION" --db-instance-identifier "$rds" >/dev/null
  fi
  aws ec2 start-instances --region "$REGION" --instance-ids "$(mongo_id)" >/dev/null
  aws ec2 wait instance-running --region "$REGION" --instance-ids "$(mongo_id)"
  aws rds wait db-instance-available --region "$REGION" --db-instance-identifier "$rds"

  echo "== runtime stack (NAT, ECR endpoints, ALB, ECS)"
  terraform -chdir="$RUNTIME" apply -input=false -auto-approve -var "state_bucket=$STATE_BUCKET"
  echo "== CloudFront -> ALB"
  terraform -chdir="$EDGE" apply -input=false -auto-approve -var "state_bucket=$STATE_BUCKET" \
    -var "alb_dns_name=$(terraform -chdir="$RUNTIME" output -raw alb_dns_name)"

  echo "== waiting for the services"
  aws ecs wait services-stable --region "$REGION" --cluster "$CLUSTER" --services "${SERVICES[@]}" || true
  status
  local url; url="$(terraform -chdir="$EDGE" output -raw web_url)"
  for _ in $(seq 1 40); do
    if [[ "$(curl -s -o /dev/null -w '%{http_code}' "$url/health")" == "200" ]]; then echo "$url/health: 200"; return 0; fi
    sleep 15
  done
  echo "$url/health did not answer 200 (CloudFront may still be deploying the new origin; see 'status')"
}

stop() {
  [[ "${1:-}" == "--yes" ]] || {
    echo "Stops the lab: no robot may be moving or holding cargo, no recording uploading. Re-run with --yes."; exit 2; }
  init "$PERSISTENT"; init "$RUNTIME"; init "$EDGE"
  echo "== services to 0"
  for s in "${SERVICES[@]}"; do
    aws ecs update-service --region "$REGION" --cluster "$CLUSTER" --service "$s" --desired-count 0 >/dev/null 2>&1 || true
  done
  aws ecs wait services-stable --region "$REGION" --cluster "$CLUSTER" --services "${SERVICES[@]}" 2>/dev/null || true
  echo "== CloudFront -> placeholder"
  terraform -chdir="$EDGE" apply -input=false -auto-approve -var "state_bucket=$STATE_BUCKET"
  echo "== runtime stack destroyed (persistent data untouched)"
  terraform -chdir="$RUNTIME" destroy -input=false -auto-approve -var "state_bucket=$STATE_BUCKET"
  echo "== databases off"
  aws ec2 stop-instances --region "$REGION" --instance-ids "$(mongo_id)" >/dev/null
  aws rds stop-db-instance --region "$REGION" --db-instance-identifier "$(rds_id)" >/dev/null 2>&1 || true
  status
  echo "RDS starts by itself after 7 days stopped: stop it again (lab-stop.yml schedule) or start/stop the lab."
}

status() {
  local tag=Name=tag:Project,Values=WaroTrans
  echo "NAT gateways (billed hourly): $(aws ec2 describe-nat-gateways --region "$REGION" --filter "$tag" Name=state,Values=available,pending --query 'length(NatGateways)' --output text)"
  echo "Load balancers: $(aws elbv2 describe-load-balancers --region "$REGION" --query "length(LoadBalancers[?starts_with(LoadBalancerName,'warotrans-demo')])" --output text)"
  echo "Interface endpoints: $(aws ec2 describe-vpc-endpoints --region "$REGION" --filters "$tag" Name=vpc-endpoint-type,Values=Interface --query 'length(VpcEndpoints[?State!=`deleted`])' --output text)"
  echo "EC2 running: $(aws ec2 describe-instances --region "$REGION" --filters "$tag" Name=instance-state-name,Values=running,pending --query 'Reservations[].Instances[].Tags[?Key==`Name`]|[].Value' --output text)"
  echo "RDS: $(aws rds describe-db-instances --region "$REGION" --db-instance-identifier "$(rds_id)" --query 'DBInstances[0].DBInstanceStatus' --output text 2>/dev/null)"
  aws ecs describe-services --region "$REGION" --cluster "$CLUSTER" --services "${SERVICES[@]}" \
    --query 'services[].[serviceName,status,desiredCount,runningCount]' --output text 2>/dev/null || echo "ECS cluster: none"
}

migrate() {
  init "$RUNTIME"
  local arn
  arn=$(aws ecs run-task --region "$REGION" --cluster "$CLUSTER" --task-definition warotrans-system-migrate \
    --capacity-provider-strategy "capacityProvider=warotrans-demo-business,weight=1" \
    --query 'tasks[0].taskArn' --output text)
  echo "migration task ${arn##*/} started"
  aws ecs wait tasks-stopped --region "$REGION" --cluster "$CLUSTER" --tasks "$arn"
  local code; code=$(aws ecs describe-tasks --region "$REGION" --cluster "$CLUSTER" --tasks "$arn" \
    --query 'tasks[0].containers[0].exitCode' --output text)
  echo "exit code $code (logs: /warotrans-demo/migrate)"
  [[ "$code" == "0" ]]
}

deploy() {
  init "$RUNTIME"
  terraform -chdir="$RUNTIME" apply -input=false -auto-approve -var "state_bucket=$STATE_BUCKET" >/dev/null
  for s in "${SERVICES[@]}"; do
    # The service ignores task definition changes in Terraform: move it onto the newest revision explicitly.
    aws ecs update-service --region "$REGION" --cluster "$CLUSTER" --service "$s" --task-definition "$s"       --desired-count 1 --query 'service.taskDefinition' --output text
  done
  aws ecs wait services-stable --region "$REGION" --cluster "$CLUSTER" --services "${SERVICES[@]}"
  status
}

evidence_settings() {
  local v
  v="$(terraform -chdir="$DEV_ENV_DIR" output -json evidence_settings)"
  "$PY" -c 'import json,sys;d=json.loads(sys.argv[1]);assert d["Evidence__Playback__Provider"]=="CloudFront", "no CloudFront key in envs/dev"' "$v"
  aws ssm put-parameter --region "$REGION" --name /warotrans-demo/evidence-settings --type String --overwrite --value "$v" >/dev/null
  echo "/warotrans-demo/evidence-settings: $(echo "$v" | "$PY" -c 'import json,sys;print(len(json.load(sys.stdin)))') settings"
}

redeploy() {
  for s in "${SERVICES[@]}"; do
    aws ecs update-service --region "$REGION" --cluster "$CLUSTER" --service "$s" --desired-count 1 --force-new-deployment >/dev/null
  done
  aws ecs wait services-stable --region "$REGION" --cluster "$CLUSTER" --services "${SERVICES[@]}"
  status
}

case "${1:-status}" in
  start) start ;;
  stop) stop "${2:-}" ;;
  status) init "$PERSISTENT"; status ;;
  migrate) migrate ;;
  redeploy) redeploy ;;
  deploy) deploy ;;
  evidence-settings) evidence_settings ;;
  *) echo "usage: $0 start | stop --yes | status | migrate | redeploy | deploy | evidence-settings"; exit 2 ;;
esac
