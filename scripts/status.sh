#!/usr/bin/env bash
# Read-only snapshot of the deployed SLA Monitor stack: what exists, what state
# it is in, and since when.
#
# Nothing here writes: only list/describe/get calls, plus one unauthenticated
# GET /health. Safe to run at any time, including while someone else is applying.
#
#   ./scripts/status.sh
#   AWS_REGION=eu-west-1 ./scripts/status.sh
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
else
  bad "user pool $PREFIX-user-pool not found"
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

printf '  %s%s resource group(s) missing.%s See the ✗ lines above.\n\n' "$R" "$MISSING" "$N"
exit 1
