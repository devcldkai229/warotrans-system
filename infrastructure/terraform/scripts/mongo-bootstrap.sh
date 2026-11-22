#!/usr/bin/env bash
# MongoDB users (admin; warotrans_app readWrite on warotrans_operations) and the "mongo" connection string.
# Passwords are generated here into the secret warotrans-demo/mongo; the host reads them itself, so they never appear in
# Session Manager command history. Needs the lab on and the host's first setup finished. Idempotent: existing
# passwords are kept unless --rotate.
#   scripts/mongo-bootstrap.sh [--rotate]
source "$(dirname "$0")/demo-lib.sh"
HOST="$(tf_out persistent mongo_private_dns)"

current="$(secret_get warotrans-demo/mongo)"
get() { "$PY" -c 'import json,sys;print(json.loads(sys.argv[1]).get(sys.argv[2],""))' "$current" "$1"; }
ADMIN_PW="$(get admin_password)"; APP_PW="$(get app_password)"
OLD_ADMIN_PW="$ADMIN_PW"
if [[ "${1:-}" == "--rotate" || -z "$ADMIN_PW" ]]; then ADMIN_PW="$(rand 32)"; fi
if [[ "${1:-}" == "--rotate" || -z "$APP_PW" ]]; then APP_PW="$(rand 32)"; fi
secret_merge warotrans-demo/mongo "{\"admin_password\":\"$ADMIN_PW\",\"app_password\":\"$APP_PW\",\"previous_admin_password\":\"$OLD_ADMIN_PW\"}"

# On the host: the admin user is made through the localhost exception the first time; afterwards the current (or,
# right after a rotation, the previous) admin password signs in to update both users.
remote "$REMOTE_PRE
S=\$(sec warotrans-demo/mongo)
A=\$(key \"\$S\" admin_password); P=\$(key \"\$S\" app_password); OLD=\$(key \"\$S\" previous_admin_password)
M='mongosh --quiet --tls --tlsAllowInvalidCertificates --host localhost'
AUTH=''
for pw in \"\$A\" \"\$OLD\"; do
  if [ -n \"\$pw\" ] && \$M -u admin -p \"\$pw\" --authenticationDatabase admin --eval 'db.runCommand({ping: 1})' >/dev/null 2>&1; then
    AUTH=\"-u admin -p \$pw --authenticationDatabase admin\"; break
  fi
done
if [ -z \"\$AUTH\" ]; then
  # Localhost exception: no users yet; it allows exactly one thing, creating the first user.
  A=\"\$A\" \$M --eval 'db.getSiblingDB(\"admin\").createUser({user: \"admin\", pwd: process.env.A, roles: [{role: \"root\", db: \"admin\"}]})' >/dev/null
  AUTH=\"-u admin -p \$A --authenticationDatabase admin\"
fi
A=\"\$A\" P=\"\$P\" \$M \$AUTH --eval '
const admin = db.getSiblingDB(\"admin\");
const set = (u, p, roles) => admin.getUser(u) ? admin.updateUser(u, {pwd: p, roles}) : admin.createUser({user: u, pwd: p, roles});
set(\"admin\", process.env.A, [{role: \"root\", db: \"admin\"}]);
set(\"warotrans_app\", process.env.P, [{role: \"readWrite\", db: \"warotrans_operations\"}]);
print(\"users ok\");'"

secret_merge warotrans-demo/connection-strings \
  "{\"mongo\":\"mongodb://warotrans_app:$APP_PW@$HOST:27017/warotrans_operations?authSource=admin&tls=true&tlsInsecure=true\"}"
echo "MongoDB: users admin / warotrans_app, connection string stored"
