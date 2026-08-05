#!/usr/bin/env bash
# Tears down every AWS resource for the demo so it costs nothing while idle.
# This destroys Cognito too, so all accounts and all DynamoDB data
# (checks/incidents/projects/reports/users) are gone after this runs.
set -euo pipefail

trap 'echo ""; echo "demo-down.sh failed partway through."; \
      echo "Some AWS resources may still exist and be billing."; \
      echo "terraform destroy is safe to redo, so just re-run: scripts/demo-down.sh"' ERR

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TF_DIR="$REPO_ROOT/sla-monitor-terraform"

cd "$TF_DIR"

echo "==> Reading DynamoDB table names..."
TABLE_NAMES=$(terraform output -json dynamodb_table_names | python3 -c '
import json, sys
for name in json.load(sys.stdin).values():
    print(name)
')

echo "==> Disabling deletion protection (required before destroy)..."
while IFS= read -r TABLE; do
  echo "    $TABLE"
  aws dynamodb update-table --table-name "$TABLE" --no-deletion-protection-enabled >/dev/null
done <<< "$TABLE_NAMES"

echo "==> Destroying Terraform-managed infrastructure..."
terraform destroy -auto-approve

echo ""
echo "Done. Nothing billable is left running for this project."
echo "Run scripts/demo-up.sh to bring it back up before your next demo."
