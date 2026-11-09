# Deploying edge functions with git

Pushing to `main` deploys this repo's Supabase edge functions. No more pasting an installer into the container terminal.

```
git push main
   |
   v
Coolify builds deploy/functions-sync/Dockerfile       the "functions-sync-breadmaker" app, internal only
   |   bakes the files listed in supabase/functions/deploy-manifest.json, with SHA-256 checksums
   v
edge-functions container runs sync.sh every minute    a Coolify scheduled task
   |   fetches the manifest, downloads what changed, verifies every checksum
   v
/home/deno/functions/...                              read from disk on each request: no restart needed
```

## Day to day

- **Change a function:** edit it under `supabase/functions/`, commit, push. It is live in about two minutes (build, then the next minute's pull).
- **Add a new function or shared file:** add its path to `supabase/functions/deploy-manifest.json`. Files not listed are never touched or deleted (the same Supabase also runs Restart's functions and others).
- **See what is deployed:** `cat /home/deno/functions/_deploy/state` in the container, and `tail /home/deno/functions/_deploy/sync.log`.
- **Roll back:** the last five versions of every replaced file are in `/home/deno/functions/_deploy/backup/`. Revert the commit and push (preferred), or copy a file back by hand and `touch /home/deno/functions/_deploy/pause` so the next pull does not overwrite it. Remove `pause` to resume.
- **Nothing happens after a push:** check the `functions-sync-breadmaker` deployment in Coolify, then `sync.log`.
- **The old installer** (`npm run build:installer`, `scripts/install-edge-functions.sh`) still works as a fallback and reads the same manifest.

## Safety

- Every file is downloaded and checked against its SHA-256 before anything is replaced. If any file fails, nothing is replaced and the next pull retries.
- Replaced files are backed up first. A hand edit made inside the container is overwritten on the next pull (git is the source of truth); pause first if you are testing one.
- The sync service has no public address. It listens on the Docker network as `functions-sync-breadmaker:8080`, and serves read-only files that are in git anyway. Anyone who can push to `main` can deploy: keep branch protection on.
- The pull script needs only bash, sha256sum and awk, because the container has no curl, git or node.

## One-time setup (done 2026-11-04)

1. Coolify app `functions-sync-breadmaker`: source `Restart-inc/breadmaker-sys`, branch `main`, Dockerfile `/deploy/functions-sync/Dockerfile`, port 8080, no domain, network alias `functions-sync-breadmaker`, auto deploy on push.
2. `_deploy/sync.sh` installed once by hand in the edge-functions container, at `/home/deno/functions/_deploy/sync.sh`. It is in the manifest, so after that it updates itself.
3. Coolify scheduled task (service `restart-backend`, container `supabase-edge-functions`): `bash /home/deno/functions/_deploy/sync.sh`, every minute (`* * * * *`).

The first install of `sync.sh` can be fetched from the service itself, no typing needed (then check its sha256 against `manifest.txt`):

```bash
exec 3<>/dev/tcp/functions-sync-breadmaker/8080; printf 'GET /f/_deploy/sync.sh HTTP/1.0\r\n\r\n' >&3
cat <&3 | sed '1,/^\r*$/d' > /home/deno/functions/_deploy/sync.sh; exec 3>&-
```

## Restart's functions

Restart's repo can use the same pattern: its own `deploy-manifest.json` and its own sync app (alias `functions-sync-restart`), pointed at the same container. Each repo owns its listed files only.
