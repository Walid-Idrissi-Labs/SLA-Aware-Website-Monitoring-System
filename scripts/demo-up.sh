#!/usr/bin/env bash
# Stands the whole demo back up: terraform apply, then points Vercel at the
# freshly-created API Gateway + Cognito resources and triggers a rebuild
# (Vite inlines VITE_* vars at build time, so a rebuild is required for the
# updated values to actually take effect).
set -euo pipefail

# Pin the Vercel CLI. The globally installed binary is whatever Homebrew last
# shipped (53.x here, which has no `env add --type` and takes the environment as
# a positional argument), so the script used to work or fail depending on the
# machine. Pinning makes the flags below deterministic.
vercel() { npx --yes vercel@65 "$@"; }

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
  vercel env rm "$NAME" -e production --yes >/dev/null 2>&1 || true
  # --type config: Vite inlines VITE_* into the browser bundle, so Vercel rejects
  # any other type ("public framework prefix cannot use visibility: secret").
  vercel env add "$NAME" --value "$VALUE" -e production --type config --force -y >/dev/null
}

DASHBOARD_URL="https://sla-aware-website-monitoring-system.vercel.app"

echo "==> Updating Vercel production environment variables..."
cd "$REPO_ROOT"
set_env VITE_API_GATEWAY_URL "$API_URL"
set_env VITE_COGNITO_CLIENT_ID "$CLIENT_ID"
set_env VITE_COGNITO_USER_POOL_ID "$POOL_ID"
set_env VITE_COGNITO_HOSTED_UI_URL "$HOSTED_UI_URL"

echo "==> Triggering a production deploy so the build picks up the new env vars..."
vercel --prod --yes

# A deploy that silently kept the old env vars succeeds exactly like a good one
# until you open the site in a browser. Check the built bundle instead of trusting
# the exit code: the API URL must be inlined in it.
echo "==> Verifying the deployed bundle points at this stack..."
BUNDLE=$(curl -s "$DASHBOARD_URL/" | grep -o 'assets/index-[^"]*\.js' | head -1 || true)
if [ -z "$BUNDLE" ]; then
  echo "    ! could not read $DASHBOARD_URL — check it by hand"
elif curl -s "$DASHBOARD_URL/$BUNDLE" | grep -Fq "$API_URL"; then
  echo "    ok — bundle references $API_URL"
else
  echo "    ! bundle does not reference $API_URL"
  echo "      The deploy built with stale env vars. Re-run this script."
  exit 1
fi

echo ""
echo "Demo is live."
echo "  Dashboard: $DASHBOARD_URL"
echo "  API:       $API_URL"
echo ""
echo "DynamoDB is empty and Cognito has no accounts yet - sign up (or sign in with"
echo "Google) to create one, then add a project to see the dashboard populate."
echo "The monitor Lambda starts checking active projects within a minute."
echo "When you're done showing it, run scripts/demo-down.sh."
