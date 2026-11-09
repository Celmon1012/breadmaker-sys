# Repository hygiene and CI — exact commands

**Date:** 7 October 2026
**Run from:** `C:\Projects\BreadmakerSys`
**Shell:** PowerShell (the commands below are PowerShell; the Git commands are identical in Git Bash)
**Expected total time:** about 20 minutes, most of it the archive step

**What this fixes:** `npm run lint` fails today (41 TypeScript errors, all inside an abandoned copy of
the project), the repository has five merged branches cluttering the branch list, and nothing checks a
push before Coolify deploys it to production.

> **Read step 0 first.** It changes your global Git configuration. Everything else is local and
> reversible, and step 2 makes an archive before anything is deleted.

---

## Step 0 — Two things that will otherwise waste your time

### 0a. Git "dubious ownership"

If Git refuses to work in this folder, it is because the directory is owned by one Windows account and
the terminal runs as another (this is exactly what happened to me today):

```
fatal: detected dubious ownership in repository at 'C:/Projects/BreadmakerSys'
```

Either run Git with a one-off override:

```powershell
git -c safe.directory=C:/Projects/BreadmakerSys status
```

or add the exception once (this writes to `%USERPROFILE%\.gitconfig`):

```powershell
git config --global --add safe.directory C:/Projects/BreadmakerSys
```

### 0b. npm will not run scripts in PowerShell

`npm run lint` fails with *"npm.ps1 cannot be loaded because running scripts is disabled on this
system"*. Two ways round it — pick one:

```powershell
# Option 1: use the .cmd shim for every npm command (no settings changed)
npm.cmd run lint
npm.cmd run test:db

# Option 2: allow signed local scripts for your user only, once
Set-ExecutionPolicy -Scope CurrentUser -RemoteSigned
```

---

## Step 1 — Know what you are deleting

`New folder\` holds two abandoned copies of the project, plus a `.env`:

| Path | What it is |
| --- | --- |
| `New folder\breadmaker\` | An older Vite copy of this app, with its own `.git`, `node_modules` and a `.env` (233 bytes, dated 5 July) |
| `New folder\breadmaker-web\` | A separate Next.js app (`.next`, `app/`, `components/`) that was never adopted |

Neither is tracked by Git and neither is referenced by any file in `src/`, `scripts/` or
`supabase/`. The only reason they matter is that `tsc` still compiles them, which is the sole cause of
the 41 lint errors.

**Before deleting, look at the `.env` and decide whether those keys are live:**

```powershell
Get-Content "New folder\breadmaker\.env"
```

If it contains a Supabase service key, a Flutterwave secret or an SMTP password that is still in use,
rotate it in the provider dashboard first, then delete. If it is an old anon key, just delete.

**Confirm nothing in the live project references the folder:**

```powershell
Select-String -Path (Get-ChildItem src,scripts,supabase -Recurse -File) -Pattern "New folder" -SimpleMatch
```

Expect no output. If you get matches, stop and read them before continuing.

---

## Step 2 — Archive it outside the repository

`tar` ships with Windows 10 1803 and later and supports exclusions, which `Compress-Archive` does not:

```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\archives" | Out-Null

tar -czf "$env:USERPROFILE\archives\breadmaker-legacy-2026-10-07.tgz" `
  --exclude=node_modules --exclude=.next --exclude=.git --exclude=dist `
  -C "New folder" .

Get-Item "$env:USERPROFILE\archives\breadmaker-legacy-2026-10-07.tgz" | Select-Object Name, Length
```

**If `tar` is not available**, stage a copy and zip that instead:

```powershell
$stage = "$env:TEMP\breadmaker-legacy"
Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
robocopy "New folder" $stage /E /XD node_modules .next .git dist | Out-Null
Compress-Archive -Path "$stage\*" -DestinationPath "$env:USERPROFILE\archives\breadmaker-legacy-2026-10-07.zip"
Remove-Item $stage -Recurse -Force
```

Keep the archive for a month. Nothing in it is needed by the live site.

---

## Step 3 — Delete it, then prove the fix

```powershell
Remove-Item "New folder" -Recurse -Force
Test-Path "New folder"        # expect: False
```

Now the check that matters:

```powershell
npm.cmd run lint
```

**Before:** 41 errors. **After:** exit code 0 and no output — the errors were all in the deleted copy,
and `src/` itself had none. Then confirm the tests are still green:

```powershell
npm.cmd run test:db
```

**Expect:** `ALL PASSED` (the assertion count grows with each migration; pg_cron and pg_net are stubbed in the test).

---

## Step 4 — Stop the working files from showing up as untracked

`.claude/` (the local dev-server profiles) and `.manus/` (MCP result cache) are working files, not
source. `.gitignore` already covers `.env*`; add the rest:

```powershell
Add-Content .gitignore @"

# Local tooling and working files
.claude/
.manus/
.work/
New folder/
"@

Get-Content .gitignore
```

`New folder/` is included deliberately: if a copy ever reappears, it will not pollute `tsc` or the
commit list again.

---

## Step 5 — Delete the five merged branches

All five were squash-merged into `main` (PRs #2–#5). Each is one commit ahead and 17–60 behind, which
means the work is already in `main` in a different commit; deleting the branches loses nothing.

Confirm that before you delete:

```powershell
git fetch --prune origin
git for-each-ref --sort=-committerdate --format="%(refname:short)|%(committerdate:short)|%(subject)" refs/remotes/origin
```

Each of these should report `1` (the squash-merged original) — if any reports more, stop and look:

```powershell
foreach ($b in @(
  "origin/chore/migration-and-deploy-script",
  "origin/docs/academy-curriculum-and-design-review",
  "origin/docs/lms-content-plan",
  "origin/feat/cohorts-applications-payments",
  "origin/feat/foundry-launchpad-landing-pages"
)) { "$b ahead-by=$(git rev-list --count main..$b) behind-by=$(git rev-list --count $b..main)" }
```

Delete them on the remote, then prune the local references:

```powershell
git push origin --delete `
  chore/migration-and-deploy-script `
  docs/academy-curriculum-and-design-review `
  docs/lms-content-plan `
  feat/cohorts-applications-payments `
  feat/foundry-launchpad-landing-pages

git remote prune origin
git branch -r
```

**Expect:** `origin/HEAD -> origin/main` and `origin/main`, nothing else.

**Then turn it off at the source:** GitHub → the repository → Settings → General → *Automatically
delete head branches*. Without it, the next five PRs will leave the same clutter.

---

## Step 6 — CI: check every push and PR

The workflow is committed at `.github/workflows/ci.yml` (created with this document). It runs the type
check, the 135 database assertions and a production build on every push to `main` and every pull
request. It needs no secrets: `vite.config.ts` requires no environment variables, and the app degrades
gracefully without the Supabase ones.

Commit it:

```powershell
git add .github/workflows/ci.yml .gitignore
git commit -m "ci: type check, database tests and build on every push and PR

Adds .github/workflows/ci.yml (npm run lint, npm run test:db, npm run build) and
ignores local tooling folders (.claude, .manus, .work) plus any stray legacy copy.

Co-Authored-By: Manus <manus@restart.ng>"

git push origin main
```

Then watch it once, so you know it works:

```powershell
Start-Process "https://github.com/Restart-inc/breadmaker-sys/actions"
```

**Expect:** a green run called *Lint, database tests and build* finishing in under three minutes.

### Then make it a gate, not a notification

Coolify deploys `main` on push, so CI on `main` reports a breakage *after* it is live. To catch it
first, either:

- **Light (recommended today):** keep pushing to `main`, and require the check on pull requests —
  GitHub → Settings → Branches → add a rule for `main` → *Require status checks to pass* → select
  **Lint, database tests and build**. Direct pushes still work; PRs cannot merge red.
- **Strict:** also tick *Require a pull request before merging* and *Do not allow bypassing*. This
  changes the current workflow — today the local Claude Code loop commits straight to `main` — so only
  do this once you have agreed that all code goes through PRs (see Decision 4 in
  `docs/DECISIONS-2026-10-07.md`).

---

## Step 7 — Verify the whole thing in one pass

```powershell
git status --short                 # expect: only .github/workflows/ci.yml and .gitignore before the commit
npm.cmd run lint                   # expect: no output
npm.cmd run test:db                # expect: ALL PASSED
npm.cmd run build                  # expect: built in dist/
git branch -r                      # expect: origin/HEAD and origin/main only
git log --oneline -3               # expect: the ci commit on top
```

---

## Rollback

| If you want to undo | Do this |
| --- | --- |
| Restore the deleted folder | `tar -xzf "$env:USERPROFILE\archives\breadmaker-legacy-2026-10-07.tgz" -C "New folder"` (recreate the folder first) |
| Undo the `.gitignore` additions | Delete the five lines from the bottom of `.gitignore` |
| Undo the CI | `git revert <ci-commit>` and delete `.github/workflows/ci.yml` |
| Undo a branch deletion | The branches were squash-merged, so the commits are already in `main`. If you want the branch label back: `git branch <name> <sha>` and push it |

---

## What is still not covered

- **Migrations are not checked by CI.** `npm run test:db` builds the schema in an in-memory Postgres
  and asserts access rules, but nothing verifies that a new migration has been applied to the shared
  database before the frontend deploys. The order rule stands: **apply the migration, then deploy.**
- **No deploy smoke test.** Coolify reports a healthy container; nothing checks that `/systems` and
  `/leak-test` still render. A five-line scheduled check on the live URLs would close that, and it is
  a good candidate for a Manus scheduled task rather than a GitHub Action.
