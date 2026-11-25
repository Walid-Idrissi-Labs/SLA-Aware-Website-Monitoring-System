#!/usr/bin/env bash
# Read-only snapshot of the deployed SLA Monitor stack: what exists, what state
# it is in, and since when.
#
# Nothing here writes: only list/describe/get calls, plus unauthenticated GETs of
# /health, the public site, and the first two redirects of Google sign-in (no
# account is used). Safe to run at any time, including while someone else is applying.
#
#   ./scripts/status.sh
#   AWS_REGION=eu-west-1 ./scripts/status.sh
#   SITE=https://preview.example.vercel.app ./scripts/status.sh
#
# Exits 1 if anything expected is missing, so it can gate a demo.
set -uo pipefail

REGION="${AWS_REGION:-us-east-1}"
PREFIX="${PREFIX:-sla-monitor-prod}"

if [ -t 1 ]; then
  G=$'\033[32m'; R=$'\033[31m'; B=$'\033[1m'; N=$'\033[0m'
else
  G=; R=; B=; N=
fi

MISSING=0
ok() { printf '  %s✓%s %s\n' "$G" "$N" "$*"; }
bad() { printf '  %s✗%s %s\n' "$R" "$N" "$*"; MISSING=$((MISSING + 1)); }
section() { printf '\n%s%s%s\n' "$B" "$1" "$N"; }
# Drop fractional seconds so timestamps line up in a column.
trim() { printf '%s' "${1%%.*}"; }

# TZ=UTC so every service reports in the same timezone; some return local offsets.
aws_() { TZ=UTC aws --region "$REGION" --no-cli-pager "$@" 2>/dev/null; }

section "Account"
ACCOUNT=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)
if [ -z "$ACCOUNT" ]; then
  bad "cannot reach AWS — check your profile/credentials"
  exit 1
fi
SUFFIX="${ACCOUNT: -8}"
printf '  account %s · region %s · prefix %s\n' "$ACCOUNT" "$REGION" "$PREFIX"

section "DynamoDB"
for t in users projects checks incidents reports; do
  name="$PREFIX-$t-table"
  row=$(aws_ dynamodb describe-table --table-name "$name" \
    --query 'Table.[TableStatus,CreationDateTime,ItemCount]' --output text)
  if [ -n "$row" ]; then
    IFS=$'\t' read -r status created items <<< "$row"
    ok "$(printf '%-9s %-7s created %-25s items %s' "$t" "$status" "$(trim "$created")" "$items")"
  else
    bad "$(printf '%-9s %s not found' "$t" "$name")"
  fi
done

section "Lambda"
for f in monitor sla-processor report-generator api project-manager; do
  name="$PREFIX-$f-lambda"
  row=$(aws_ lambda get-function-configuration --function-name "$name" \
    --query '[LastModified,MemorySize,Timeout]' --output text)
  if [ -n "$row" ]; then
    IFS=$'\t' read -r modified mem tmo <<< "$row"
    ok "$(printf '%-16s deployed %-25s %sMB / %ss' "$f" "$(trim "$modified")" "$mem" "$tmo")"
  else
    bad "$(printf '%-16s %s not found' "$f" "$name")"
  fi
done

section "EventBridge"
rules=$(aws_ events list-rules \
  --query "Rules[?starts_with(Name,'$PREFIX')].[Name,State,ScheduleExpression]" --output text)
if [ -z "$rules" ]; then
  bad "no rules found for $PREFIX"
else
  while IFS=$'\t' read -r rname rstate rschedule; do
    [ -z "$rname" ] && continue
    if [ "$rstate" = "ENABLED" ]; then
      ok "$(printf '%-38s %-8s %s' "$rname" "$rstate" "$rschedule")"
    else
      bad "$(printf '%-38s %-8s %s' "$rname" "$rstate" "$rschedule")"
    fi
  done <<< "$rules"
fi

section "API Gateway"
API=$(aws_ apigatewayv2 get-apis --query "Items[?Name=='$PREFIX-api'].ApiEndpoint" --output text)
if [ -n "$API" ] && [ "$API" != "None" ]; then
  ok "$API"
  CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$API/health" 2>/dev/null || echo 000)
  if [ "$CODE" = "200" ]; then
    ok "GET /health → 200"
  else
    bad "GET /health → $CODE"
  fi
else
  bad "HTTP API $PREFIX-api not found"
fi

section "S3"
buckets=$(aws_ s3api list-buckets --query "Buckets[?contains(Name,'$PREFIX')].[Name,CreationDate]" --output text)
for b in "$PREFIX-reports-$SUFFIX" "$PREFIX-lambda-artifacts-$SUFFIX"; do
  created=$(printf '%s\n' "$buckets" | awk -v b="$b" '$1==b {print $2}')
  if [ -n "$created" ]; then
    ok "$(printf '%-42s created %s' "$b" "$(trim "$created")")"
  else
    bad "$b not found"
  fi
done

section "Cognito"
POOL=$(aws_ cognito-idp list-user-pools --max-results 60 \
  --query "UserPools[?Name=='$PREFIX-user-pool'].Id" --output text)
if [ -n "$POOL" ] && [ "$POOL" != "None" ]; then
  row=$(aws_ cognito-idp describe-user-pool --user-pool-id "$POOL" \
    --query 'UserPool.[CreationDate,EstimatedNumberOfUsers]' --output text)
  IFS=$'\t' read -r created users <<< "$row"
  ok "$(printf '%-24s %-22s created %-25s users %s' "$POOL" "$PREFIX-user-pool" "$(trim "$created")" "$users")"
  # Federated sign-in breaks on the second login if `email` is immutable, and
  # Cognito can only set that at pool creation — so a rebuilt pool silently
  # regresses it. Assert it here rather than find out weeks later.
  mutable=$(aws_ cognito-idp describe-user-pool --user-pool-id "$POOL" \
    --query 'UserPool.SchemaAttributes[?Name==`email`].Mutable' --output text)
  if [ "$mutable" = "True" ]; then
    ok "$(printf '%-24s                      email attribute is mutable' "")"
  else
    bad "email attribute is NOT mutable (reported: '$mutable') — Google sign-in will work once, then fail"
  fi
else
  bad "user pool $PREFIX-user-pool not found"
fi

section "Frontend wiring"
# Vite inlines the VITE_* values at build time, so the live site only talks to
# this stack if it was deployed after the stack was created.
SITE="${SITE:-https://sla-aware-website-monitoring-system.vercel.app}"
if [ -z "$POOL" ] || [ "$POOL" = "None" ]; then
  printf '  %s–%s skipped: no user pool to compare the site against\n' "$B" "$N"
else
  CLIENT=$(aws_ cognito-idp list-user-pool-clients --user-pool-id "$POOL" \
    --query "UserPoolClients[?ClientName=='$PREFIX-app-client'].ClientId" --output text)
  HOSTED="https://$(aws_ cognito-idp describe-user-pool --user-pool-id "$POOL" \
    --query 'UserPool.Domain' --output text).auth.$REGION.amazoncognito.com"

  entry=$(curl -s --max-time 15 "$SITE/" | grep -oE 'assets/index-[^"]+\.js' | head -1)
  BUNDLE=$([ -n "$entry" ] && curl -s --max-time 15 "$SITE/$entry")
  # in_site <label> <value this stack expects> [regex for what the build has instead]
  in_site() {
    # A substring test, not `printf | grep -q`: under pipefail an early grep exit
    # SIGPIPEs the writer and reads as "not found".
    if [[ "$BUNDLE" == *"$2"* ]]; then
      ok "$(printf '%-15s %s' "$1" "$2")"
      return
    fi
    local found=""
    [ -n "${3:-}" ] && found=$(grep -oE "$3" <<< "$BUNDLE" | head -1)
    bad "$(printf '%-15s site is built with %s, stack has %s — redeploy: ./scripts/demo-up.sh' \
      "$1" "${found:-a different value}" "$2")"
  }
  if [ -z "$BUNDLE" ]; then
    bad "cannot read the deployed build from $SITE"
  else
    in_site "API URL" "$API" 'https://[a-z0-9]{10}\.execute-api\.[a-z0-9-]+\.amazonaws\.com'
    in_site "user pool" "$POOL" "${REGION}_[A-Za-z0-9]{9}"
    in_site "app client" "$CLIENT"
    in_site "sign-in domain" "$HOSTED" 'https://[a-z0-9-]+\.auth\.[a-z0-9-]+\.amazoncognito\.com'
  fi

  # The API rejects every token whose issuer or audience it doesn't trust (401).
  API_ID=$(aws_ apigatewayv2 get-apis --query "Items[?Name=='$PREFIX-api'].ApiId" --output text)
  jwt=$(aws_ apigatewayv2 get-authorizers --api-id "$API_ID" \
    --query 'Items[0].JwtConfiguration.[Issuer, join(`,`, Audience)]' --output text)
  IFS=$'\t' read -r iss aud <<< "$jwt"
  if [ "$iss" = "https://cognito-idp.$REGION.amazonaws.com/$POOL" ] && [[ ",$aud," == *",$CLIENT,"* ]]; then
    ok "$(printf '%-15s accepts tokens from this pool and app client' "API authorizer")"
  else
    bad "$(printf '%-15s trusts issuer %s, audience %s' "API authorizer" "${iss:-none}" "${aud:-none}")"
  fi

  # Walk the first two hops of "Continue with Google" without signing in. Both
  # refusals are 302s to an error page, so the redirect target is all this reads.
  # The client secret is only used after a real sign-in, so it can't be checked here.
  hop1=$(curl -s -o /dev/null -w '%{redirect_url}' --max-time 15 \
    "$HOSTED/oauth2/authorize?identity_provider=Google&response_type=code&client_id=$CLIENT&redirect_uri=$SITE/callback&scope=openid+email+profile")
  case "$hop1" in
    https://accounts.google.com/*)
      ok "$(printf '%-15s Cognito accepts %s/callback and hands off to Google' "Google sign-in" "$SITE")"
      hop2=$(curl -s -o /dev/null -w '%{redirect_url}' --max-time 15 "$hop1")
      gclient=$(printf '%s' "$hop1" | sed -nE 's/.*[?&]client_id=([^&]+).*/\1/p')
      case "$hop2" in
        *"/signin/oauth/error"*)
          # Google's reason (redirect_uri_mismatch, invalid_client, ...) is the first
          # plain token in authError, a base64url-encoded protobuf.
          a=$(printf '%s' "$hop2" | sed -nE 's/.*authError=([^&]+).*/\1/p' | sed 's/%3D/=/g' | tr '_-' '/+')
          while [ $(( ${#a} % 4 )) -ne 0 ]; do a="$a="; done
          reason=$(printf '%s' "$a" | base64 -d 2>/dev/null | LC_ALL=C tr -c 'a-z_' '\n' | grep -m1 -E '^[a-z_]{6,}$')
          bad "$(printf '%-15s Google refuses client %s: %s' "Google sign-in" "${gclient%%-*}…" "${reason:-unknown reason}")" ;;
        https://accounts.google.com/*)
          ok "$(printf '%-15s Google accepts client %s and the Cognito redirect URI' "Google sign-in" "${gclient%%-*}…")" ;;
        *)
          bad "$(printf '%-15s unexpected reply from Google: %s' "Google sign-in" "${hop2:-no redirect}")" ;;
      esac ;;
    *error=*)
      bad "$(printf '%-15s Cognito refuses it: %s' "Google sign-in" "$(printf '%s' "$hop1" | sed -nE 's/.*[?&]error=([^&]+).*/\1/p')")" ;;
    *)
      bad "$(printf '%-15s Cognito did not hand off to Google (got: %s)' "Google sign-in" "${hop1:-no redirect}")" ;;
  esac
fi

section "SSM"
env_name="${PREFIX##*-}"
param="/sla-monitor/$env_name/ses/sender-email"
# Only the name and timestamp: the value is a SecureString and has no business in
# a terminal or a screenshot.
row=$(aws_ ssm get-parameter --name "$param" --query 'Parameter.LastModifiedDate' --output text)
if [ -n "$row" ]; then
  ok "$(printf '%-34s updated %s' "$param" "$(trim "$row")")"
else
  bad "$param not found"
fi

section "Recent activity"
latest=$(aws_ dynamodb scan --table-name "$PREFIX-checks-table" --max-items 1 \
  --query 'Items[0].#ts.N' --expression-attribute-names '{"#ts":"timestamp"}' --output text)
if [ -n "$latest" ] && [ "$latest" != "None" ]; then
  secs=$((latest / 1000))
  ok "last check written $(date -u -r "$secs" '+%Y-%m-%d %H:%M:%S UTC' 2>/dev/null || echo "$latest ms")"
else
  printf '  %s–%s no checks yet (no active projects — expected on a fresh stack)\n' "$B" "$N"
fi

section "Result"
if [ "$MISSING" -eq 0 ]; then
  printf '  %sAll expected resources present.%s\n\n' "$G" "$N"
  printf '  Billing note: the monitor rule fires every minute while this is up.\n'
  printf '  Tear down with ./scripts/demo-down.sh\n'
  exit 0
fi

printf '  %s%s check(s) failed.%s See the ✗ lines above.\n\n' "$R" "$MISSING" "$N"
exit 1
