# Breadmaker Systems — status review

**Date:** 7 October 2026
**Scope:** what has been built and shipped across this repository, the Manus sessions, the
collaborating coding agent, the production host and the live site — and what to do next.
**Evidence:** local repo at `C:\Projects\BreadmakerSys` (HEAD `2713407`, clean), Coolify API,
live pages at breadmakersystems.com, the sibling Manus task history, and the project's own
test suite.

---

## 1. Who has been working on this

| Contributor | Role | What it produced | Where it landed |
| --- | --- | --- | --- |
| **Ademola** (owner) | Direction, product decisions, copy, sequencing | Every product decision in the log: the systems repositioning, kits-vs-programs, the Leak Test, pricing | All commits |
| **Claude Code (Opus 5.5 → Sonnet 5.5)** | The main builder | ~55 commits from 29 Sep to 7 Oct: the whole Breadmaker rebuild, the LMS, Leak Test, kits, Studio, payments wiring | `main`, auto-deployed to production |
| **Manus session `QbnuOF0vfWHXMoOUibC6oU`** ("Implement the brief in a new branch, referencing Prof. Sherley [ITA]'s project") | Research, documentation, and a marketing diagnosis | PR #4 (LMS content plan), PR #5 (26-session curriculum + instructional-design review), the design extraction from the Prof. Sherley reference, and the lead-magnet analysis | `docs/` on `main` (co-authored `Manus <manus@restart.ng>`); the lead-magnet proposal was never built |
| **This session** | Review only | This document | not committed |

Other Manus sessions in the **Restart Inc** project worked on the Restart properties
(restart.ng, console.restart.ng, n8n, billing) — separate products, same Coolify host. The
Prof. Sherley ITA site lives on its own server in the same Coolify team and was used as a
simplicity/structure reference.

**Net:** one human, two agent workstreams, no unresolved fork of the work. The Manus side
contributed documents and diagnosis; the Claude side contributed the code.

---

## 2. Where the product stands

### 2.1 It is live and self-deploying

| Fact | Value |
| --- | --- |
| Live site | https://breadmakersystems.com |
| Host | Coolify app `breadmaker-systems`, server `localhost`, status `running:healthy` |
| Source | `Restart-inc/breadmaker-sys`, branch `main`, webhook deploy on push |
| Last deploy | commit `2713407` ("Guides: shorten the headline…"), finished 7 Oct, matching local HEAD |
| Repo sync | local `main` == `origin/main`; working tree clean except two untracked folders |
| Backend | Supabase service `supabase` (YATA project, `svr.yata.network`) `running:healthy`; `supabase-edge-functions` container healthy |

So: **the repo, production and the live site are in agreement as of today.** That is worth
stating plainly, because it is not always true.

### 2.2 The repositioning is complete in code and copy

Breadmaker is no longer selling "websites". The live site presents:

- a **catalog of systems and programs** (`/systems`, `src/lib/systems.ts`) with a published
  four-point validation standard;
- the **Business Leak Test** as the front door (`/leak-test`, 30 questions, six pillars,
  paywall enforced in the database);
- **six kits** (one per leak pillar) with sessions, a checklist and a definition of done;
- two **programs** — Launchpad ₦35,000 (6 sessions) and Foundry ₦150,000 (20 sessions);
- **real cohort data**: Launchpad's next start is live as "October 26, 2026, 8 places left".

Home, About, header, footer, meta, Guides and Tools all carry the new framing. This is a
coherent, finished-feeling funnel — the strongest thing in the project.

### 2.3 The Academy is structurally complete and content-thin in exactly one place

- 26 sessions (Foundry 20, Launchpad 6) are seeded with **body, one action and a done-when**
  each — verified against the live database when `docs/LMS-CONTENT-PLAN.md` was written.
- **Every `video_url` is empty.** The Academy is text-only, and for terminal-and-console
  teaching that is the biggest single quality gap. The player and the Studio editor already
  support video, so it is a data fill, not a build.
- `docs/INSTRUCTIONAL-DESIGN-REVIEW.md` grades it "outcome-designed, not yet instructionally
  designed" and lists seven fixes. None has been implemented.
- **No learner is enrolled yet.** Nothing is being held up by that, and nothing has been
  proven by it either.

### 2.4 It is tested, and the tests pass

`npm run test:db` runs the schema against an in-memory Postgres: **135 assertions, 0 failures**,
including the Leak Test paywall, token access, partner codes, AI review gating, kit drafts vs.
published kits, and program→kit enrollment bundling. This is a genuinely good safety net.

### 2.5 Three loose ends in the production configuration

1. **`VITE_VSL_URL` is not set** on the app, so the homepage shows "Video coming soon". The
   script for that video exists (`docs/VSL-SCRIPT.md`) and is ready to shoot.
2. **`VITE_CALL_BOOKING_URL` is not set**, so a "Report + call" buyer is told to reply to the
   email instead of getting a booking button — even though a Cal.com service is deployed and
   healthy in the same Coolify project.
3. **Edge-function secrets need confirming.** The site app carries `FLUTTERWAVE_SECRET_KEY`,
   `FLUTTERWAVE_WEBHOOK_HASH` and `VITE_PAYMENTS_ENABLED`, but the shared Supabase service's
   environment key list shows `OPENAI_API_KEY` and no `FLUTTERWAVE_*`, `RESEND_API_KEY` or
   `ANTHROPIC_API_KEY`. Key names only were readable, so this may simply be scoped per
   container — but the AI report cannot run without an Anthropic key, and checkout cannot run
   without the Flutterwave secret. Confirm before the first paid report.

### 2.6 One positioning inconsistency worth fixing on purpose

`docs/POSITIONING.md` says a system is listed live only after we run it ourselves and keep the
record, and migration 22 seeds the six kits as **unpublished drafts**. In production, all six
kits are **published, priced and on sale** on `/systems` and `/courses` (₦15,000–₦30,000).
Meanwhile the homepage FAQ still says offer, sales, cash and delivery "are in testing and will
be listed once they have a record."

Both cannot be true. Either the kits have a record now and the testing copy is stale, or the
kits were published ahead of the standard and the sales pages overstate. The honesty line is
the brand's whole differentiator, so this is a decision to make deliberately, not to leave.

### 2.7 Housekeeping debt

| Item | State |
| --- | --- |
| `npm run lint` | **Fails** — 41 TypeScript errors, *all* of them inside the untracked legacy copy `New folder/`. `src/` itself has **0** errors |
| `New folder/` | Two abandoned project copies: an older Vite `breadmaker` (with a `.env` dated 5 Jul) and a Next.js `breadmaker-web`. Not in Git, not referenced, currently polluting `tsc` |
| Remote branches | 5 stale branches on `origin`, each 1 commit ahead / 17–60 behind `main` — squash-merged long ago, safe to delete |
| CI | **None.** No `.github/`. Lint and the 135 assertions only run when someone remembers |
| Secrets on disk | A stray `.env` inside `New folder/breadmaker` — check and rotate if it ever held live keys |

---

## 3. What the sibling Manus session left on the table

Its final exchange was a diagnosis worth acting on, and nothing was built from it.

> "Straight answer: there isn't one. … landing page → apply/book a call → pay, with nothing in between. … There's no email list, no newsletter table, no downloadable asset anywhere."

The proposed fix: **an interactive 20-check Day-30 scorecard at `/scorecard`** — instant score
(no email gate on the number), email traded for the gap report, and automatic routing down the
₦15,000 → ₦2,500,000 ladder. It doubles as the diagnostic gate the instructional-design review
flagged as missing, and it is the same 20 items the Foundry curriculum is built backwards from.

Current state of that gap: **still open.** There is no `leads` table, no newsletter, no
scorecard page, and the Systems page's "Suggest a system" link goes to the general contact
page.

---

## 4. The honest read

**What is strong.** The product is real, live, coherent and tested; the funnel logic (positioning
→ free diagnostic → system or kit → program → LMS) is better thought through than most paid
programs; the paywall is enforced in the database rather than the browser; and the shipping
cadence (multiple deploys a day, all green) is excellent.

**What is at risk, in order:**

1. **Everything is built and nothing is being driven to it.** No lead magnet, no email list, no
   list-building step anywhere, launch posts still in draft (`docs/LAUNCH-POSTS.md`), no video.
   The site is a very good shop with nobody walking past it.
2. **The honesty claim vs. the shop window.** Six kits on sale with no published record while
   the copy says they are in testing. This is the one inconsistency that could cost the
   positioning its credibility.
3. **Concentration risk.** One person, two agents, no CI, lint broken by a stray folder, secrets
   in legacy copies. A single mistyped deploy has no automated guardrail.
4. **The curriculum is unproven and text-only.** No learner has ever gone through it; the
   biggest lever (recording the sessions) has not been started.

---

## 5. How I would move it forward

Sequenced so that each step either earns money, earns data, or removes a risk. Everything in
Phase 1 is under a day's work and needs no new decisions.

### Phase 1 — Turn it on (this week, no new code decisions)

| # | Action | Why | Effort |
| --- | --- | --- | --- |
| 1 | Confirm the edge-functions env (`FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_WEBHOOK_HASH`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`) and redeploy the functions if anything is missing | Checkout and the AI report are unverifiable until this is settled | 30 min |
| 2 | Run **one live Flutterwave transaction** end to end at the smallest tier (₦15,000 kit) plus one partner code redemption | The only untested path between a buyer and an enrolment | 30 min |
| 3 | Set `VITE_VSL_URL` and `VITE_CALL_BOOKING_URL` | Kills "Video coming soon" and gives Report + call buyers a booking button instead of an email | 15 min |
| 4 | Decide the kits question and align copy with it: either state the record each kit has, or move the kits back to "in testing" until it exists | Protects the differentiator | 1 hour |

### Phase 2 — Give it a front door (next 2 weeks)

| # | Action | Why | Effort |
| --- | --- | --- | --- |
| 5 | Record the homepage video from `docs/VSL-SCRIPT.md` (one take per section is enough) | Cheapest credibility win; the script and slot are already built | Half a day |
| 6 | Build the **`/scorecard` lead magnet** (20 checks, instant score, email for the gap report, CTA routing to Launchpad / Foundry / done-with-you) — page + one migration with a `leads` table | The missing acquisition step and the missing diagnostic gate, in one artifact | 1–2 days |
| 7 | Wire the leak-test result page to offer the scorecard or the email list to non-buyers | Every Leak Test taker who does not pay is currently lost | Half a day |
| 8 | Publish the launch posts (`docs/LAUNCH-POSTS.md`) — just fill the brackets | Written, unpaid-for distribution | 1 hour |

### Phase 3 — Prove the Academy (next 4–6 weeks)

| # | Action | Why |
| --- | --- | --- |
| 9 | Enrol a first cohort of 5–6 real learners against the live sessions | The only way to find which of the 26 sessions need rewriting |
| 10 | Record the three sessions a learner meets first (Foundry Kickoff → Your offer → Build the page first), then Launchpad Day 1–2 | Demonstration is the primary channel for terminal work |
| 11 | Add the three content fixes from the instructional-design review that need no schema: a `capability` line per session, a published rubric per week, a Friday reflection prompt | Highest-leverage, Studio-only work |
| 12 | Then the small migration for weekly checks-for-understanding and the two-minute enrollment diagnostic | First feedback before the build, and routing for wrong-fit learners |

### Phase 4 — Hygiene (an afternoon, whenever)

13. Delete or archive `New folder/` — this alone makes `npm run lint` pass (it is the *only*
    reason it fails today); check and rotate the `.env` inside it first.
14. Delete the five merged remote branches.
15. Add a GitHub Actions job running `npm run lint` and `npm run test:db` on every push.
16. Add a "suggest a system" field to the contact form (the Systems page link currently dumps
    into the general contact page), and finish the two small known gaps in `docs/LEAK-TEST.md`:
    the `enroll_from_payment` EXECUTE revoke, and a Studio screen for leads and codes.

### What I would *not* do yet

- Build a server-side PDF renderer or per-result OG images (`docs/LEAK-TEST.md` "Not built"):
  real gaps, but well behind acquisition in value.
- Add more systems or kits. Six unproven kits is already one more shelf than the current
  traffic justifies.

---

## 6. Decisions I need from you

1. **Kits:** do they have a record (then fix the copy), or do they go back to "in testing" until
   they do?
2. **Lead magnet:** build the `/scorecard` as proposed, or something lighter (email capture on
   the leak-test result) as a first step?
3. **Video:** are you recording it yourself, or should the site ship without it for now?
4. **Where should the next block of work run** — here in this session, or in the local Claude
   Code workflow that has been doing the building?

---

## Appendix — how each claim was checked

| Claim | Evidence |
| --- | --- |
| Live, healthy, auto-deploying from `main` | Coolify `get_application`, `list_deployments` for `djcmld7jynzk77d8t4girlxp` |
| Repo in sync, clean | `git rev-parse main origin/main` (identical), `git status --short` (only two untracked folders) |
| 135 assertions pass | `npm run test:db` → `ALL PASSED` |
| Lint fails only because of `New folder/` | `npm run lint` → 41 `error TS`, all under `New folder/`; 0 in `src/` |
| Six kits on sale | Live `/systems` shows "Get the kit · NGN …" for all six; `src/components/SystemsPage.tsx:105` only prices kits that are published and priced in Studio |
| Positioning inconsistency | `docs/POSITIONING.md` (validation standard, kits seeded as drafts) vs. live `/systems` and `/courses` |
| Missing video and booking vars | Coolify `list_env_keys` for `djcmld7jynzk77d8t4girlxp` — no `VITE_VSL_URL`, no `VITE_CALL_BOOKING_URL`; live homepage shows "Video coming soon" |
| Academy text-only | `docs/LMS-CONTENT-PLAN.md`, checked against the live database |
| Sibling session's output | `manus-tasks` `list_task_messages` for `QbnuOF0vfWHXMoOUibC6oU` (PRs #4/#5, lead-magnet analysis, final state `stopped`) |
| Stale branches merged by squash | `git rev-list --count main..<branch>` = 1 for each; PR numbers in commit subjects #2–#5 |