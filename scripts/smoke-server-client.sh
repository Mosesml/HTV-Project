#!/usr/bin/env bash
# AN7 acceptance: the real Swift ServerClient against a real server.
#   scripts/smoke-server-client.sh                  starts a local simulation server on a free port
#   scripts/smoke-server-client.sh https://host     runs against a hosted server (after AN1)
# The hosted run creates and deletes its own sessions; it sends no SMS while the server is in
# simulation mode and uses synthetic 555 numbers.
set -euo pipefail
cd "$(dirname "$0")/.."
work=work/server-client-smoke
mkdir -p "$work" work/swift-module-cache
native=app/modules/raveguard-native/ios
swiftc -swift-version 5 -parse-as-library -module-cache-path work/swift-module-cache \
  "$native/Shared/Contracts.swift" "$native/Escalation/ServerClient.swift" \
  scripts/server-client-smoke.swift -o "$work/smoke" 2>&1 | grep -v 'warning:' | grep -E 'error' || true
test -x "$work/smoke"

if [ $# -ge 1 ]; then
  exec "$work/smoke" "$1"
fi

port=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')
PORT=$port node server/src/index.js >"$work/server.log" 2>&1 &
server=$!
trap 'kill $server 2>/dev/null || true' EXIT
for _ in $(seq 1 50); do
  curl --silent --fail "http://127.0.0.1:$port/health" >/dev/null 2>&1 && break
  sleep 0.2
done
"$work/smoke" "http://127.0.0.1:$port"
