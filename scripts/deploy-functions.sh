#!/usr/bin/env bash
#
# Deploys the Breadmaker edge functions to the self-hosted Supabase stack.
#
# Run this on the Coolify host (the machine running the supabase-backend service).
# It finds the edge-functions container and its functions bind-mount, copies the
# function folders in, restarts the container, and smoke-tests each function.
#
#   ./scripts/deploy-functions.sh
#
# Override if discovery fails:
#   CONTAINER=supabase-edge-functions-1 FUNCTIONS_DIR=/data/coolify/services/.../volumes/functions ./scripts/deploy-functions.sh

set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/supabase/functions"
FOLDERS=(flutterwave-checkout flutterwave-verify flutterwave-webhook lago-breadmaker-webhook payments-reconcile agent-usage leak-test-checkout leak-test-notify leak-test-generate lead-capture tutor-chat _shared)
SITE="${SITE:-https://db.restart.ng}"

if [ ! -d "$SRC/flutterwave-checkout" ]; then
  echo "Cannot find $SRC/flutterwave-checkout — run this from the repository." >&2
  exit 1
fi

CONTAINER="${CONTAINER:-$(docker ps --format '{{.Names}}' | grep -i 'edge-functions' | head -1 || true)}"
if [ -z "$CONTAINER" ]; then
  echo "No edge-functions container found. Set CONTAINER=<name> and retry." >&2
  exit 1
fi
echo "container:      $CONTAINER"

if [ -z "${FUNCTIONS_DIR:-}" ]; then
  FUNCTIONS_DIR="$(docker inspect "$CONTAINER" \
    --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}' 2>/dev/null \
    | awk -F' -> ' '$2 ~ /home\/deno\/functions/ {print $1}' | head -1)"
fi
if [ -z "$FUNCTIONS_DIR" ]; then
  echo "Could not find the /home/deno/functions mount. Set FUNCTIONS_DIR=<path> and retry." >&2
  exit 1
fi
echo "functions dir:  $FUNCTIONS_DIR"

for folder in "${FOLDERS[@]}"; do
  mkdir -p "$FUNCTIONS_DIR/$folder"
  cp -f "$SRC/$folder"/*.ts "$FUNCTIONS_DIR/$folder/"
  echo "copied $folder"
done

echo "restarting $CONTAINER"
docker restart "$CONTAINER" >/dev/null
for _ in $(seq 1 30); do
  sleep 2
  if docker exec "$CONTAINER" true >/dev/null 2>&1; then break; fi
done
sleep 3

echo
echo "smoke tests — a 400 or 401 with an {\"error\":...} body means the function loaded:"
for fn in flutterwave-checkout flutterwave-verify flutterwave-webhook lago-breadmaker-webhook payments-reconcile agent-usage leak-test-checkout leak-test-notify leak-test-generate lead-capture; do
  body="$(curl -s -m 20 -X POST "$SITE/functions/v1/$fn" \
    -H 'Content-Type: application/json' -d '{}' -o /tmp/fn-smoke.out -w '%{http_code}' || echo '000')"
  printf '  %-22s %s  %s\n' "$fn" "$body" "$(head -c 140 /tmp/fn-smoke.out)"
done
echo
echo "If any line shows 500 or a worker boot error, check:"
echo "  docker logs --tail 50 $CONTAINER"
