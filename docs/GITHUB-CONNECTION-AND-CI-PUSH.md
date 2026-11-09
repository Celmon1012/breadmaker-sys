# GitHub connection and pushing the CI workflow

**Date:** 7 October 2026
**Goal:** get `.github/workflows/ci.yml` onto `main` so every push and PR is checked, and fix the
connector so this Manus session can open PRs on `Restart-inc/breadmaker-sys` in future.

---

## 1. What is actually wrong today

| Finding | Evidence | Effect |
| --- | --- | --- |
| The GitHub connector for this task is authorised for **`adeusuf/restart-inc`**, not the repo that matters | the task's connector selection | I cannot push to `Restart-inc/breadmaker-sys` from here |
| The local remote is an **org repository over HTTPS** | `.git/config`: `url = https://github.com/Restart-inc/breadmaker-sys.git` | A personal-account app installation may not reach it; the GitHub App must be installed on the **Restart-inc** organisation |
| `gh` is **not installed** on this device | `Get-Command gh` returns nothing | Even with the connector fixed, the connector's own `gh.cmd` is the only GitHub CLI available here |
| Git credentials work locally through **Git Credential Manager** | `C:\Program Files\Git\etc\gitconfig` → `[credential] helper = manager` | Pushing from your own terminal should just work, or pop a browser sign-in once |
| The device terminal is **currently unavailable** | `terminal:config home unavailable` on every command this session | Path B below is blocked until that is fixed; Path A is not |

There are two paths. **Path A is five minutes and needs nobody's permission. Path B is what makes
future sessions self-sufficient.**

---

## 2. Path A — push it yourself (recommended, do this first)

### 2a. Pre-flight

```powershell
cd C:\Projects\BreadmakerSys

# Only if git refuses with "detected dubious ownership":
git config --global --add safe.directory C:/Projects/BreadmakerSys

git status --short
git log --oneline -1
git fetch origin
git status -sb
```

**Expect:** `.github/workflows/ci.yml` (and the new `docs/*.md` files) listed as untracked, and
`## main...origin/main` with no divergence. If `origin/main` has moved, run `git pull --rebase origin main`
first.

### 2b. Commit and push the workflow

```powershell
git add .github/workflows/ci.yml
git commit -m "ci: type check, database tests and build on every push and PR" -m "Co-Authored-By: Manus <manus@restart.ng>"
git push origin main
```

If Git Credential Manager opens a browser window, sign in and it will remember. If it asks for a
**password**, a password will not work — use a personal access token instead (see 2e).

### 2c. Commit and push the documents

```powershell
git add docs/STATUS-REVIEW-2026-10-07.md docs/DECISIONS-2026-10-07.md docs/SCORECARD-PLAN.md docs/REPO-HYGIENE-AND-CI.md docs/GITHUB-CONNECTION-AND-CI-PUSH.md
git commit -m "docs: status review, the four decisions, the scorecard plan and the hygiene runbook" -m "Co-Authored-By: Manus <manus@restart.ng>"
git push origin main
```

### 2d. Put the migration on a branch, not on main

Migration 23 must not land on `main` before it is applied, and a pull request is the safest way to
review it: **CI applies every file in `supabase/migrations` to an in-memory Postgres**, so the PR is a
real test of the SQL without touching production.

```powershell
git switch -c feat/scorecard-schema
git add supabase/migrations/20240101000023_scorecard.sql docs/SCORECARD-PLAN.md
git commit -m "feat(scorecard): migration 23 for the Day-30 Scorecard (schema only, not applied)" -m "Co-Authored-By: Manus <manus@restart.ng>"
git push -u origin feat/scorecard-schema
```

Then open the PR:

```powershell
Start-Process "https://github.com/Restart-inc/breadmaker-sys/compare/main...feat/scorecard-schema?expand=1"
```

**Expect:** CI runs and reports *Lint, database tests and build*. If the harness rejects anything in
migration 23, the job log names the file and the error — fix it on the branch, push again, and the
run repeats. Merge only when it is green, then apply the migration to the shared database and deploy
in that order.

### 2e. If the push is rejected

| Message | Cause | Fix |
| --- | --- | --- |
| `Support for password authentication was removed` | You typed a password | Create a token: GitHub → Settings → Developer settings → **Personal access tokens** → *Fine-grained* → repository access `Restart-inc/breadmaker-sys` → Permissions: **Contents: Read and write** and **Workflows: Read and write** |
| `refusing to allow a Personal Access Token to create or update workflow` | The token lacks the workflow scope — this only bites on `.github/workflows/` | Classic token: tick **`workflow`**. Fine-grained: set **Workflows: Read and write** |
| `403` on push, but you can read the repo | Your account lacks write access to the org repo | An org owner must grant you write, or you push through a fork and open a PR |
| `! [rejected] main -> main (fetch first)` | The remote moved | `git pull --rebase origin main` then push again |
| `Protected branch update failed` | Branch protection was switched on | Push the branch and open a PR instead of pushing `main` |

---

## 3. Path B — make this session able to open PRs

Three things must be true: the **GitHub App** must be able to see the org repo, **this task's
connector** must list it, and the **device terminal** must be back.

### 3a. Give the GitHub App access to the organisation repository

The connector is a GitHub App installed on an account. Repos owned by an organisation are only
reachable if the app is installed on that organisation.

1. On github.com, go to **Settings → Applications → Installed GitHub Apps** (personal) and look for
   the Manus connector app.
2. Open its **Configure** page → *Repository access* → either **All repositories** or **Only select
   repositories** → add **`Restart-inc/breadmaker-sys`** → **Save**.
3. If the app is not installed on the organisation at all, install it there: open
   `https://github.com/apps/<app-name>/installations/new`, choose the **Restart-inc** organisation,
   select the repository, and approve. An **organisation owner** must approve it — this is the step
   that usually stalls.

### 3b. Add the repository to this task's connector

**Through the interface (simplest):** Manus → **Settings → Connectors → GitHub** → *Manage* /
*Repository access* → add **`Restart-inc/breadmaker-sys`** → save. The connector card will ask for
confirmation.

**Through the CLI, if you prefer the config file:**

```powershell
manus-config config load --search github
# edit the "repositories" list to include "Restart-inc/breadmaker-sys"
manus-config config save
```

`config save` raises a confirmation card for anything that needs approval, and applies account-only
switches directly.

### 3c. Check the CLI the connector ships with

Once the terminal is back:

```powershell
& "$env:MANUS_CONFIG_HOME\connectors\github\gh.cmd" auth status
& "$env:MANUS_CONFIG_HOME\connectors\github\gh.cmd" repo view Restart-inc/breadmaker-sys --json name,visibility,defaultBranchRef
```

**Expect:** a logged-in account and the repository JSON. If `gh` is missing entirely, install it —
`winget install --id GitHub.cli -e` (then reopen the terminal), or the MSI from
https://cli.github.com. **Do not run `gh auth login`** — the connector handles authentication.

### 3d. Fix the terminal

The device terminal has returned `terminal:config home unavailable` on every command since 13:12.
That is a device-side session issue, not a repository problem. Reconnect the device in Manus Desktop
(or restart the app), then tell me and I will re-probe before doing anything else.

### 3e. What I would run once 3a–3d are done

Never on `main`:

```powershell
git fetch origin
git switch -c feat/scorecard-schema origin/main
git add supabase/migrations/20240101000023_scorecard.sql docs/SCORECARD-PLAN.md
git commit -m "feat(scorecard): migration 23 for the Day-30 Scorecard (schema only, not applied)"
& "$env:MANUS_CONFIG_HOME\connectors\github\gh.cmd" pr create --repo Restart-inc/breadmaker-sys --base main --head feat/scorecard-schema --title "Scorecard: migration 23 (schema only)" --body "Adds breadmaker.scorecard_fixes, scorecard_submissions and the RPCs. Not applied to the shared database; apply after review."
```

Then report the PR link and the CI result back to you.

---

## 4. After the first green run

1. **Watch it once:** `Start-Process "https://github.com/Restart-inc/breadmaker-sys/actions"` — the run
   is called *Lint, database tests and build* and should finish in under three minutes.
2. **Require it on pull requests:** GitHub → Settings → Branches → add a rule for `main` → *Require
   status checks to pass* → select **Lint, database tests and build**. Direct pushes still work; PRs
   cannot merge red. This is the setting that stops either agent breaking `main` silently.
3. **Turn on auto-delete of merged branches:** Settings → General → *Automatically delete head
   branches*, so the branch list does not refill.

---

## 5. Order of operations, in one list

1. `git status --short` — confirm what is uncommitted.
2. Commit and push `.github/workflows/ci.yml` to `main` (§2b).
3. Commit and push the `docs/` files to `main` (§2c).
4. Branch `feat/scorecard-schema`, commit migration 23, push, open the PR (§2d).
5. Watch CI on the PR; fix anything the harness flags.
6. Apply migration 23 to the shared database **only after** the PR is green, then deploy.
7. Add the branch-protection rule (§4).
8. Fix the connector and the terminal (§3) if you want future sessions to work here directly.

---

## 6. What I could not verify

I could not run any of the commands in this document: the device terminal has been unavailable since
13:12 (`terminal:config home unavailable`), so `git`, `gh`, `manus-config` and `npm` were all
unreachable from this session. Everything above is derived from files I could read — `.git/config`,
the system `gitconfig`, `package.json`, the migration folder — and from the Coolify and Manus task
data. The first command in §2a is therefore also the first real test.
