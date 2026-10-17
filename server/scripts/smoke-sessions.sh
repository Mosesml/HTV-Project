#!/usr/bin/env bash
set -euo pipefail
# Uses synthetic settings and never prints the bearer token. Requires curl and Node.
base="${1:-http://127.0.0.1:3000}"
base="${base%/}"
scratch=$(mktemp -d)
sid=''
cleanup() {
  if [[ -n "$sid" ]]; then
    curl -sS --max-time 10 -X DELETE -H @"$scratch/auth" "$base/v1/sessions/$sid" >/dev/null || true
  fi
  rm -rf "$scratch"
}
trap cleanup EXIT
expect() {
  local expected="$1"
  shift
  local actual
  actual=$(curl -sS --max-time 10 -o "$scratch/response" -w '%{http_code}' "$@")
  if [[ "$actual" != "$expected" ]]; then
    echo "Expected HTTP $expected, received $actual" >&2
    exit 1
  fi
}
expect 201 -H 'Content-Type: application/json' \
  --data '{"wearerName":"Smoke test","selfDescription":"Synthetic settings","recipients":[],"demo":true}' \
  "$base/v1/sessions"
sid=$(node -e 'const fs=require("node:fs"); const r=JSON.parse(fs.readFileSync(process.argv[1])); process.stdout.write(r.data.sessionId)' "$scratch/response")
node -e 'const fs=require("node:fs"); const r=JSON.parse(fs.readFileSync(process.argv[1])); fs.writeFileSync(process.argv[2], "Authorization: Bearer " + r.data.token + "\n", {mode:0o600})' "$scratch/response" "$scratch/auth"
expect 401 -X POST -H 'Authorization: Bearer invalid' "$base/v1/sessions/$sid/heartbeat"
expect 204 -X POST -H @"$scratch/auth" "$base/v1/sessions/$sid/heartbeat"
expect 204 -X DELETE -H @"$scratch/auth" "$base/v1/sessions/$sid"
expect 401 -X POST -H @"$scratch/auth" "$base/v1/sessions/$sid/heartbeat"
sid=''
echo 'PASS: create, bad-token rejection, heartbeat, delete, revoked-token rejection'
