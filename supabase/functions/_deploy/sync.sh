#!/bin/bash
# Pulls this repo's edge functions into the edge-functions container from the functions-sync service, so a git push
# deploys them. Runs INSIDE the supabase edge-functions container (a Coolify scheduled task runs it every minute),
# and needs only bash, sha256sum and awk: the container has no curl, git or node.
#
#   bash sync.sh               pull whatever changed
#   DRY=1 bash sync.sh         say what would change, change nothing
#   FORCE=1 bash sync.sh       ignore a pause
#   touch $D/_deploy/pause     stop syncing (remove the file to resume), for a hotfix you are testing by hand
#
# How it stays safe:
#   - Only files listed in the repo's deploy-manifest.json are touched, and none is ever deleted.
#   - Every file is downloaded and checked against its SHA-256 before anything is replaced; if any download or check
#     fails, nothing is replaced and the next run tries again.
#   - Replaced files are copied to _deploy/backup/<old version>/ first (the last 5 versions are kept).
#   - Edge functions are read from disk on each request, so no restart is needed.
# Plain HTTP on the Docker network only: the service has no public address.
# This file is itself in the manifest, so a push updates the pull script too.
set -u

HOST="${SYNC_HOST:-functions-sync-breadmaker}"
PORT="${SYNC_PORT:-8080}"
D="${FUNCTIONS_DIR:-/home/deno/functions}"
STATE="$D/_deploy"
mkdir -p "$STATE/backup" "$STATE/stage"
LOG="$STATE/sync.log"

log() {
  echo "$(date -u +%FT%TZ) $*" | tee -a "$LOG"
  if [ "$(wc -l < "$LOG")" -gt 400 ]; then tail -n 200 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"; fi
}

# GET <path> from the service; the body goes to stdout. Fails (returns 1) on anything but a 200.
http_get() {
  local line status
  exec 3<>"/dev/tcp/$HOST/$PORT" || return 1
  printf 'GET %s HTTP/1.0\r\nHost: %s\r\nConnection: close\r\n\r\n' "$1" "$HOST" >&3
  IFS= read -r status <&3
  case "$status" in *" 200"*) ;; *) exec 3>&-; return 1 ;; esac
  while IFS= read -r line <&3; do [ "$line" = $'\r' ] && break; done
  cat <&3
  exec 3>&-
}

if [ -f "$STATE/pause" ] && [ -z "${FORCE:-}" ]; then
  echo "paused ($STATE/pause exists)"
  exit 0
fi

manifest="$(http_get /manifest.txt)" || { log "cannot reach the functions-sync service at $HOST:$PORT"; exit 2; }
version="$(echo "$manifest" | awk '$1=="version"{print $2}')"
commit="$(echo "$manifest" | awk '$1=="commit"{print $2}')"
[ -n "$version" ] || { log "the manifest has no version, ignoring it"; exit 2; }

# 1. work out what differs
changes=()
while read -r sha size file; do
  case "$sha" in version | commit | built) continue ;; esac
  [ -n "$file" ] || continue
  have="$(sha256sum "$D/$file" 2>/dev/null | cut -d' ' -f1)"
  [ "$have" = "$sha" ] || changes+=("$sha $file")
done <<< "$manifest"

if [ "${#changes[@]}" -eq 0 ]; then
  echo "up to date ($version)"
  printf 'version=%s\ncommit=%s\nchecked=%s\nstatus=up to date\n' "$version" "$commit" "$(date -u +%FT%TZ)" > "$STATE/state"
  exit 0
fi

if [ -n "${DRY:-}" ]; then
  echo "would update ${#changes[@]} file(s) to $version:"
  for entry in "${changes[@]}"; do echo "  ${entry#* }"; done
  exit 0
fi

# 2. download and verify everything before replacing anything
stage="$STATE/stage/$version"
rm -rf "$stage"
for entry in "${changes[@]}"; do
  sha="${entry%% *}"
  file="${entry#* }"
  mkdir -p "$stage/$(dirname "$file")"
  if ! http_get "/f/$file" > "$stage/$file"; then log "download failed: $file (nothing replaced)"; rm -rf "$stage"; exit 3; fi
  got="$(sha256sum "$stage/$file" | cut -d' ' -f1)"
  if [ "$got" != "$sha" ]; then log "checksum mismatch: $file (nothing replaced)"; rm -rf "$stage"; exit 3; fi
done

# 3. back up what is there, then replace
previous="$(awk -F= '$1=="version"{print $2}' "$STATE/state" 2>/dev/null)"
backup="$STATE/backup/${previous:-initial}-before-$version"
for entry in "${changes[@]}"; do
  file="${entry#* }"
  if [ -f "$D/$file" ]; then
    mkdir -p "$backup/$(dirname "$file")"
    cp "$D/$file" "$backup/$file"
  fi
  mkdir -p "$(dirname "$D/$file")"
  mv "$stage/$file" "$D/$file.sync.$$" && mv "$D/$file.sync.$$" "$D/$file"
done
rm -rf "$stage"
ls -1t "$STATE/backup" 2>/dev/null | tail -n +6 | while read -r old; do rm -rf "$STATE/backup/$old"; done

printf 'version=%s\ncommit=%s\nchecked=%s\nstatus=deployed %s file(s)\n' "$version" "$commit" "$(date -u +%FT%TZ)" "${#changes[@]}" > "$STATE/state"
log "deployed $version (commit ${commit:-unknown}): ${#changes[@]} file(s): $(for entry in "${changes[@]}"; do printf '%s ' "${entry#* }"; done)"
exit 0
