#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo 'Andy local QA: server HTTP tests + curl smoke + portable Swift escalation tests + Swift client smoke'
npm --prefix server run qa
python3 scripts/check_escalation_fake.py
bash scripts/smoke-server-client.sh
git diff --check
echo 'PASS: local QA. Full Swift suites and Docker must also pass in GitHub Actions.'
echo 'Hosting, SMS and physical-device acceptance remain separate; see docs/andy-qa.md.'
