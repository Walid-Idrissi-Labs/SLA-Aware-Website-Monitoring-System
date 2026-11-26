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
# this stack if it was deployed after the stack was created. Every check prints
# both sides, so a mismatch can be read straight off the screen.
SITE="${SITE:-https://sla-aware-website-monitoring-system.vercel.app}"
SITE="${SITE%/}" # a trailing slash would send //callback, which Cognito refuses
row() { printf '      %-13s %s\n' "$1" "${2:-(none)}"; }
# same <title> <label A> <value A> <label B> <value B>: ✓ only when A equals B.
same() {
  if [ -n "$3" ] && [ "$3" = "$5" ]; then ok "$1"; else bad "$1"; fi
  row "$2" "$3"
  row "$4" "$5"
}
if [ -z "$POOL" ] || [ "$POOL" = "None" ]; then
  printf '  %s–%s skipped: no user pool to compare the site against\n' "$B" "$N"
else
  CLIENT=$(aws_ cognito-idp list-user-pool-clients --user-pool-id "$POOL" \
    --query "UserPoolClients[?ClientName=='$PREFIX-app-client'].ClientId" --output text)
  HOSTED="https://$(aws_ cognito-idp describe-user-pool --user-pool-id "$POOL" \
    --query 'UserPool.Domain' --output text).auth.$REGION.amazoncognito.com"

  entry=$(curl -s --max-time 15 "$SITE/" | grep -oE 'assets/index-[^"]+\.js' | head -1)
  BUNDLE=$([ -n "$entry" ] && curl -s --max-time 15 "$SITE/$entry")
  # Every distinct value of one shape found in the build, comma-separated.
  in_build() { grep -oE "$1" <<< "$BUNDLE" | tr -d '"' | sort -u | paste -sd, - | sed 's/,/, /g'; }
  printf '  site %s · build %s\n' "$SITE" "${entry:-unreadable}"
  if [ -z "$BUNDLE" ]; then
    bad "cannot read the deployed build from $SITE"
  else
    same "API URL" \
      "site build" "$(in_build 'https://[a-z0-9]{10}\.execute-api\.[a-z0-9-]+\.amazonaws\.com')" \
      "API Gateway" "$API"
    same "user pool" "site build" "$(in_build "${REGION}_[A-Za-z0-9]{9}")" "Cognito" "$POOL"
    # shortcut: the client ID has no prefix to anchor on, so this takes every
    # 25–26 character lowercase string literal (only the client ID today); anchor
    # it if extra values start showing up here.
    # In a variable: bash 3.2 (macOS) misparses '"…"' nested inside "$(…)".
    client_re='"[a-z0-9]{25,26}"'
    same "app client" "site build" "$(in_build "$client_re")" "Cognito" "$CLIENT"
    same "sign-in domain" \
      "site build" "$(in_build 'https://[a-z0-9-]+\.auth\.[a-z0-9-]+\.amazoncognito\.com')" \
      "Cognito" "$HOSTED"
  fi

  # The API rejects every token whose issuer or audience it doesn't trust (401).
  API_ID=$(aws_ apigatewayv2 get-apis --query "Items[?Name=='$PREFIX-api'].ApiId" --output text)
  jwt=$(aws_ apigatewayv2 get-authorizers --api-id "$API_ID" \
    --query 'Items[0].JwtConfiguration.[Issuer, join(`,`, Audience)]' --output text)
  IFS=$'\t' read -r iss aud <<< "$jwt"
  same "API accepts tokens issued by" "authorizer" "$iss" \
    "user pool" "https://cognito-idp.$REGION.amazonaws.com/$POOL"
  same "API accepts tokens meant for" "authorizer" "${aud//,/, }" "app client" "$CLIENT"

  # Walk the first two hops of "Continue with Google" without signing in. Both
  # refusals are 302s to an error page, so the redirect target is all this reads.
  # The client secret is not checked: it only comes into play after a real sign-in.
  callbacks=$(aws_ cognito-idp describe-user-pool-client --user-pool-id "$POOL" --client-id "$CLIENT" \
    --query 'UserPoolClient.CallbackURLs' --output text)
  hop1=$(curl -s -o /dev/null -w '%{redirect_url}' --max-time 15 \
    "$HOSTED/oauth2/authorize?identity_provider=Google&response_type=code&client_id=$CLIENT&redirect_uri=$SITE/callback&scope=openid+email+profile")
  case "$hop1" in
    https://accounts.google.com/*)
      ok "Google sign-in, step 1: Cognito accepts the callback and hands off to Google" ;;
    *error=*)
      bad "Google sign-in, step 1: Cognito refuses it ($(sed -nE 's/.*[?&]error=([^&]+).*/\1/p' <<< "$hop1"))" ;;
    *)
      bad "Google sign-in, step 1: Cognito did not hand off to Google" ;;
  esac
  row "site sends" "$SITE/callback"
  row "app client" "${callbacks//$'\t'/, }"

  if [[ "$hop1" == https://accounts.google.com/* ]]; then
    hop2=$(curl -s -o /dev/null -w '%{redirect_url}' --max-time 15 "$hop1")
    case "$hop2" in
      *"/signin/oauth/error"*)
        # Google's reason (redirect_uri_mismatch, invalid_client, ...) is the first
        # plain token in authError, a base64url-encoded protobuf.
        a=$(sed -nE 's/.*authError=([^&]+).*/\1/p' <<< "$hop2" | sed 's/%3D/=/g' | tr '_-' '/+')
        while [ $(( ${#a} % 4 )) -ne 0 ]; do a="$a="; done
        reason=$(printf '%s' "$a" | base64 -d 2>/dev/null | LC_ALL=C tr -c 'a-z_' '\n' | grep -m1 -E '^[a-z_]{6,}$')
        bad "Google sign-in, step 2: Google refuses Cognito's request"
        verdict="refused: ${reason:-unknown reason}" ;;
      https://accounts.google.com/*)
        ok "Google sign-in, step 2: Google accepts Cognito's client ID and redirect URI"
        verdict="accepted, shows its sign-in page" ;;
      *)
        bad "Google sign-in, step 2: unexpected reply from Google"
        verdict="${hop2:-no redirect}" ;;
    esac
    row "client ID" "$(sed -nE 's/.*[?&]client_id=([^&]+).*/\1/p' <<< "$hop1")"
    row "redirect URI" "$(sed -nE 's/.*[?&]redirect_uri=([^&]+).*/\1/p' <<< "$hop1" | sed 's/%3A/:/g; s#%2F#/#g')"
    row "Google says" "$verdict"
  fi
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
