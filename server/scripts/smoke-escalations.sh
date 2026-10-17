#!/usr/bin/env bash
set -euo pipefail
# Simulation-only AN5 smoke. Requires the server one-second scheduler, curl and Node.
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
expect 200 "$base/health"
node -e 'const fs=require("node:fs"); const h=JSON.parse(fs.readFileSync(process.argv[1])); if(h.notificationsEnabled!==false || h.stage!=="escalation-simulation") process.exit(1)' "$scratch/response"
expect 201 -H 'Content-Type: application/json' \
  --data '{"wearerName":"Smoke test","selfDescription":"Synthetic","recipients":[{"id":"f4a94c98-0c17-4ab3-bd04-d7f40f5ad782","name":"Synthetic contact","phoneE164":"+14165550123","kind":"contact","order":0,"permissions":{"receiveAlerts":true,"seeLocation":false,"seeFullBrief":false,"canResolve":true}}],"demo":true}' \
  "$base/v1/sessions"
sid=$(node -e 'const fs=require("node:fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1])).data.sessionId)' "$scratch/response")
node -e 'const fs=require("node:fs"); const r=JSON.parse(fs.readFileSync(process.argv[1])); fs.writeFileSync(process.argv[2], "Authorization: Bearer " + r.data.token + "\n", {mode:0o600})' "$scratch/response" "$scratch/auth"
node -e 'const fs=require("node:fs"); const at=new Date().toISOString(); fs.writeFileSync(process.argv[1], JSON.stringify({deadline:at, facts:{wearerName:"Smoke test",selfDescription:"Synthetic",lastActiveState:"unknown",trigger:{kind:"manual",at,reason:"Simulation"},promptsUnanswered:0}}))' "$scratch/register"
expect 201 -H @"$scratch/auth" -H 'Content-Type: application/json' --data-binary @"$scratch/register" "$base/v1/sessions/$sid/escalations"
eid=$(node -e 'const fs=require("node:fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1])).data.escalationId)' "$scratch/response")
# Wait for the independent server sweep, without heartbeat or fire requests.
notified=false
for attempt in {1..6}; do
  expect 200 -H @"$scratch/auth" "$base/v1/escalations/$eid"
  if node -e 'const fs=require("node:fs"); const s=JSON.parse(fs.readFileSync(process.argv[1])).data; process.exit(s.state==="notifying" && s.recipients[0].notifiedAt ? 0 : 1)' "$scratch/response"; then
    notified=true
    break
  fi
  sleep 1
done
[[ "$notified" == true ]] || { echo 'Deadline did not produce a simulated notification' >&2; exit 1; }
expect 204 -H @"$scratch/auth" -H 'Content-Type: application/json' --data '{"mode":"safe"}' "$base/v1/escalations/$eid/cancel"
expect 200 -H @"$scratch/auth" "$base/v1/escalations/$eid"
node -e 'const fs=require("node:fs"); const s=JSON.parse(fs.readFileSync(process.argv[1])).data; if(s.state!=="resolved" || s.sosOpen) process.exit(1)' "$scratch/response"
expect 204 -X DELETE -H @"$scratch/auth" "$base/v1/sessions/$sid"
sid=''
echo 'PASS: deadline sweep, simulated primary notification, late-safe stop, session cleanup (no SMS)'
