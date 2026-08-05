#!/usr/bin/env bash
# Stands the whole demo back up: terraform apply, then points Vercel at the
# freshly-created API Gateway + Cognito resources and triggers a rebuild
# (Vite inlines VITE_* vars at build time, so a rebuild is required for the
# updated values to actually take effect).
set -euo pipefail

trap 'echo ""; echo "demo-up.sh failed partway through."; \
      echo "AWS resources from this run may already exist and be billing."; \
      echo "terraform apply / vercel are safe to redo, so first try: scripts/demo-up.sh"; \
      echo "If it keeps failing, tear down whatever was created: scripts/demo-down.sh"' ERR

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TF_DIR="$REPO_ROOT/sla-monitor-terraform"

echo "==> Applying Terraform..."
cd "$TF_DIR"
terraform apply -auto-approve

API_URL=$(terraform output -raw api_gateway_endpoint)
CLIENT_ID=$(terraform output -raw cognito_app_client_id)
POOL_ID=$(terraform output -raw cognito_user_pool_id)
HOSTED_UI_URL=$(terraform output -raw cognito_hosted_ui_url)

set_env () {
  local NAME="$1" VALUE="$2"
  vercel env rm "$NAME" production --yes >/dev/null 2>&1 || true
  printf '%s' "$VALUE" | vercel env add "$NAME" production >/dev/null
}

echo "==> Updating Vercel production environment variables..."
cd "$REPO_ROOT"
set_env VITE_API_GATEWAY_URL "$API_URL"
set_env VITE_COGNITO_CLIENT_ID "$CLIENT_ID"
set_env VITE_COGNITO_USER_POOL_ID "$POOL_ID"
set_env VITE_COGNITO_HOSTED_UI_URL "$HOSTED_UI_URL"

echo "==> Triggering a production deploy so the build picks up the new env vars..."
vercel --prod --yes

echo ""
echo "Demo is live."
echo "  Dashboard: https://sla-aware-website-monitoring-system.vercel.app"
echo "  API:       $API_URL"
echo ""
echo "DynamoDB is empty and Cognito has no accounts yet - sign up (or sign in with"
echo "Google) to create one, then add a project to see the dashboard populate."
echo "The monitor Lambda starts checking active projects within a minute."
echo "When you're done showing it, run scripts/demo-down.sh."
