# The Day-30 Scorecard — implementation plan and schema

**Route:** `/scorecard`
**Status:** PARKED proposal (revision 3). Not applied and not wired into the site. Decision, 7 Oct 2026: do not build the public scorecard until the Leak Test has real traffic data; reconsider as an in-program day-0/day-30 tool for enrolled Foundry learners. To revive it, move the SQL into `supabase/migrations/` and add the tests in `scorecard.tests.mjs.txt` (11 assertions, all passing against the in-memory database).
**Migration:** `20240101000023_scorecard.sql` in this folder (fixed, tested, not applied)
**Effort:** ~3.5 days across five phases.
**Why it exists:** the site has no free entry point for the technical owner-operator Foundry sells to,
no email capture outside the 30-question Leak Test, and no diagnostic gate before enrolment. The same
twenty items solve all three, because they are already the curriculum's grading rubric
(`docs/ACADEMY-CURRICULUM.md`, scorecard items 1–20).

---

## Revision 3 (7 Oct 2026, after running it)

- `scorecard_overview()` still referenced `p.position`, which fails at runtime with a column error. Now `check_position`.
- The overview sorted bands alphabetically (almost, building, not-started, operating). Now in score order.
- **The weakest week was biased toward week 4.** Week 4 holds eight checks and the others four, so "most failures" almost always named week 4. It now compares each week's share of failed checks, and ties go to the lower week.
- The premise that Leak Test takers who do not pay are lost is wrong: the Leak Test gate already stores name, email and WhatsApp and pushes to n8n.

## Revision 2 — what changed after review

| # | Finding | Fix |
| --- | --- | --- |
| 1 | The plan embedded a copy of the SQL, which would drift from the real file | The SQL now lives only in `supabase/migrations/20240101000023_scorecard.sql`; this document describes it and links to it |
| 2 | The draft relied on Postgres's default `EXECUTE`-to-`PUBLIC` grant | Every public RPC now does `revoke all ... from public` **before** granting to `anon, authenticated` — the same class of gap `docs/LEAK-TEST.md` records against the older `enroll_from_payment` |
| 3 | `scorecard_progress()` ordered by a positional index in a `returns table` function, which is ambiguous | Rewritten with an inner select, ordering by the named delta column |
| 4 | `scorecard_check_pass_rates()` returned `0.0%` when nobody had attempted a check, which reads as "everyone fails this" | Returns `NULL` when there are no attempts; the Studio shows "—" |
| 5 | `submit_scorecard()` is anon-callable and writes rows with no limit | Added a guard: ten checks per email per 24 hours, plus an attempt ceiling |
| 6 | The Studio screen would have made three round trips | Added `scorecard_overview()` returning one `jsonb` payload; it raises `42501` for a non-team caller instead of returning zeros |
| 7 | `alter table ... applications` would fail on a database without migration 15 | Guarded with `to_regclass`; also added a `band` index and an idempotency block for later columns |
| 8 | **The frontend file list omitted `src/types.ts`** | Added — the `Route` union must gain `'scorecard'` or the code will not compile |
| 9 | The tests were a list with no shape | Now sixteen named assertions with a sample in the existing harness style |

---

## 1. The product in one screen

A visitor answers twenty yes/no checks in about three minutes, in four groups (the Foundry weeks).
They see their score **immediately, without giving an email** — gating the number kills the share
rate. The email is traded for the **gap report**: their failed checks in order, with the fix and where
the fix lives, plus the one CTA their score earns.

| | |
| --- | --- |
| **Landing** | "Twenty checks. Score the system your business runs on." One call to action |
| **Check** | Four screens, five checks each, Yes / Not yet. Keyboard: `Y` / `N`, arrows to move |
| **Score** | `17/20` + band + the weakest of the four weeks, shown instantly |
| **Gate** | Email (required), name, company and WhatsApp (optional), consent checkbox |
| **Gap report** | `/scorecard/report?s=<id>&t=<token>` — the failed checks ranked, each with its fix; the band's CTA; "come back and re-score" |
| **Re-score** | Same email, new attempt. The report says "+3 since your last check" |

**Bands and routing** (the score earns the CTA; the weakest week decides what is named first):

| Score | Band | Headline | Primary CTA | Secondary |
| --- | --- | --- | --- | --- |
| 0–7 | `not-started` | "Nothing is standing yet" | Launchpad — `/launchpad` (₦35,000) | Free Leak Test — `/leak-test` |
| 8–14 | `building` | "Half-built" | Foundry, self-paced — `/foundry` (₦150,000) | The kit for your weakest week — `/systems` |
| 15–18 | `almost` | "Close, and the last checks are the hard ones" | Apply for Foundry with a coach — `/foundry/apply` | `/systems` |
| 19–20 | `operating` | "Operating" | Talk to us about what is next — `/contact` | Academy — `/courses` |

Weakest week, named on the score screen: **1** your offer and your page · **2** your data, security
and payments · **3** automation and follow-up · **4** operating, backing up and owning it.

---

## 2. The twenty checks

Verbatim from the curriculum so the marketing asset and the pedagogy stay one artifact. Items 19 and
20 are rephrased for a public audience that is not in a Foundry cohort; the program wording stays in
the curriculum.

| # | Week | Check (public wording) |
| --- | --- | --- |
| 1 | 1 Frontend | The site loads over HTTPS on your own domain |
| 2 | 1 | Three strangers can say what you sell and to whom within 5 seconds |
| 3 | 1 | The main page and the form work on a phone |
| 4 | 1 | A page visit and a lead event both show in analytics |
| 5 | 2 Backend | The tables for leads, customers and payments exist with sensible fields |
| 6 | 2 | A logged-out request cannot read another user's data |
| 7 | 2 | A real or test payment completes and is recorded as paid by a server check, not only by the browser returning |
| 8 | 2 | You can log in and see leads, customers and payments in one place |
| 9 | 3 Automation | A new lead triggers a confirmation and a follow-up with no manual step |
| 10 | 3 | You are told about a new lead or booking within minutes |
| 11 | 3 | One AI agent completes a useful task on real input, with a log of what it received and produced |
| 12 | 3 | A failed job or a form error sends you an alert |
| 13 | 4 Launch and operate | At least three changes went from staging to production using the edit, stage, push loop |
| 14 | 4 | You rolled back a bad change once |
| 15 | 4 | A backup was restored to a test copy |
| 16 | 4 | Uptime checks and an alert channel are set up |
| 17 | 4 | 2FA is on GitHub, Cloudflare and your console, no secrets are in the repository, and the guardrails are still on |
| 18 | 4 | A one-page runbook explains how to deploy, roll back, restore and get help |
| 19 | 4 | You could move your site, data and tools to another provider without starting over *(curriculum: "You have chosen continue, move, or export for the server")* |
| 20 | 4 | You know what this system has actually earned or saved you since you built it *(curriculum: "The day-0 target and the actual result are both written down")* |

---

## 3. Architecture: what lives where

Following the Leak Test's existing split, which the codebase already proves works:

| Thing | Lives in | Why |
| --- | --- | --- |
| The 20 questions and their week grouping | `src/lib/scorecard.ts` (**code**), synced to `supabase/functions/_shared/scorecard-checks.ts` by the existing `npm run sync:questions` | One source of truth for the questions, exactly as `src/lib/leak-test.ts` does today; the email function can render titles without importing React code |
| The fix, the fix label and the fix route per check | `breadmaker.scorecard_fixes` (**database**) | The team rewrites the advice without a deploy, exactly as `leak_test_report_content` works |
| Submissions, scores, attempts | `breadmaker.scorecard_submissions` | The score is recomputed server-side; a lying browser is ignored |
| The score, band and weakest week | `breadmaker.scorecard_score(boolean[])` | One implementation, used by the submit RPC, the tests and the Studio |
| The email and the n8n push | `supabase/functions/scorecard-notify` | Mirrors `leak-test-notify`, including the once-only guard |

---

## 4. The schema

Full SQL: [`20240101000023_scorecard.sql`](./20240101000023_scorecard.sql).
Apply by name, after review:

```bash
DATABASE_URL=postgres://... node run-migrations.js 20240101000023_scorecard.sql
```

### Objects it creates

| Object | Kind | Access |
| --- | --- | --- |
| `breadmaker.scorecard_fixes` | table, 20 seeded rows | team read/write; RLS `is_team_member()` / `can_edit_content()` |
| `breadmaker.scorecard_submissions` | table, one row per attempt | team read only; writes only through the RPC |
| `breadmaker.applications.scorecard_id` | column (guarded) | team, via the applications screen |
| `scorecard_score(boolean[])` | function, `immutable` | internal only, revoked from `public, anon, authenticated` |
| `submit_scorecard(...)` | function, `security definer` | `anon`, `authenticated` |
| `get_scorecard_result(uuid, uuid)` | function | `anon`, `authenticated` (token required) |
| `get_scorecard_gaps(uuid, uuid)` | function | `anon`, `authenticated` (token required) |
| `list_scorecard_leads()` | function | `authenticated`, team-gated inside |
| `scorecard_bands()` | function | `authenticated`, team-gated |
| `scorecard_check_pass_rates()` | function | `authenticated`, team-gated |
| `scorecard_progress()` | function | `authenticated`, team-gated |
| `scorecard_overview()` | function, returns `jsonb` | `authenticated`, raises `42501` for a non-team caller |

### RPC contracts

| Call | Returns | Notes |
| --- | --- | --- |
| `submit_scorecard(p_email, p_name, p_company, p_profile, p_checks, p_consent, p_whatsapp, p_source)` | `id, access_token, attempt, yes_count, band, weakest_week, failed` | Validates email and consent, recomputes the score, numbers the attempt, refuses after ten checks in 24 hours |
| `get_scorecard_result(p_id, p_token)` | header + `previous_yes_count`, `previous_at` | The previous attempt is the immediately preceding one for that email |
| `get_scorecard_gaps(p_id, p_token)` | `check_position, fix, fix_label, fix_route` | Only the failed checks, only when `active` |
| `scorecard_overview()` | `{ totals, bands, pass_rates, progress }` | One call for the Studio screen |

### Design decisions worth a reviewer's eye

- **Questions in code, fixes in the database.** The Leak Test keeps its questions in
  `src/lib/leak-test.ts` and its report text in the database; this follows that split exactly, so there
  is no second copy of the twenty items to drift. The cost: changing a question needs a deploy, which
  is the same cost the quiz already carries.
- **The score is computed twice.** Once in the browser for the instant number, once in the database
  for the record. If they disagree the database wins, and the report shows the database number.
- **The week grouping is a constant** (`1-4, 5-8, 9-12, 13-20`) inside `scorecard_score()`, not a
  table lookup, so the function is `immutable` and cannot be broken by editing content.
- **Ten checks per email per 24 hours.** A lead magnet that anyone can POST to needs a limit; this is
  the cheapest one that will never touch a real user.
- **No payment anywhere.** The scorecard is free; kits and programs are untouched by this migration.

### Before you apply — review checklist

1. Re-read the `grant`/`revoke` pairs: the three public RPCs must be `revoke ... from public` then
   granted to `anon, authenticated`; the five team RPCs must be revoked from `public, anon`.
2. Confirm the band boundaries in `scorecard_score()`: 7/8, 14/15, 18/19.
3. Confirm the week grouping constant matches the curriculum (1–4, 5–8, 9–12, 13–20).
4. Check the twenty `fix_route` values point at real routes: `/systems`, `/foundry`, `/launchpad`,
   `/guides/own-the-systems-your-business-runs-on`.
5. Run `npm run test:db` after adding the tests in section 7 — the migration is picked up
   automatically because the harness applies every file in `supabase/migrations` in order.

---

## 5. Frontend plan

| File | What it holds | Mirrors |
| --- | --- | --- |
| `src/types.ts` | **add `'scorecard'` to the `Route` union** — without this nothing compiles | the existing union |
| `src/lib/scorecard.ts` (new) | The 20 checks, the four weeks, band labels and copy, `bandFor()`, the CTA table, `SCORECARD_SIZE = 20` | `src/lib/leak-test.ts` |
| `src/lib/scorecard-api.ts` (new) | `submitScorecard()`, `fetchScorecardResult()`, `fetchScorecardGaps()`, `notifyScorecard()`, `listScorecardLeads()`, `scorecardOverview()`; token in the URL | `src/lib/leak-test-api.ts` |
| `src/components/ScorecardPage.tsx` (new) | Landing → four check screens → instant score → gate → report, switched on `section` | `src/components/LeakTestPage.tsx` |
| `src/components/lms/ScorecardSection.tsx` (new) | Studio: leads list, band mix, per-check pass rates, re-score progress, from one `scorecard_overview()` call | `src/components/lms/LeakTestSection.tsx` |
| `src/App.tsx` | add `'scorecard'` to `ROUTES` and to `OWN_CHROME_ROUTES`; render with `section={routeParams[0]}` | the `leak-test` line |
| `src/components/SiteHeader.tsx` | the header passes `links` to `ProgramNav`; add the scorecard as a nav item or in the announcement bar beside the Leak Test | the existing Leak Test link |
| `src/components/FoundryLandingPage.tsx` | replace the static checklist card's CTA with "Score your system in 3 minutes" | the `SCORECARD_CHECKS` card, line ~203 |
| `src/components/lms/StudioPage.tsx` | add `'scorecard'` to the `StudioSection` union and the nav | the `leak-test` section |
| `src/components/LeakTestReport.tsx` | cross-link for the technical reader: "already own the technical side? score your system" | — |

**Keyboard and mobile:** `Y`/`N` to answer, `Enter` to advance, one week per screen, and the score
screen renders the number before any network call.

---

## 6. Edge function: `scorecard-notify`

Mirrors `leak-test-notify` (`supabase/functions/leak-test-notify/index.ts`, 2 KB):

1. Service-role read of the submission by id + token.
2. Compose the gap report email: score, band, weakest week, the failed checks with their fixes, and
   the band's CTA. Plain, no earnings claims.
3. Send through the same path `send-email` already uses (Resend, with the SMTP fallback).
4. POST the lead to n8n with `event: 'scorecard_submitted'`, including `score`, `band`,
   `weakest_week`, `failed`, `report_url` and `source`.
5. Set `emailed_at` and `notified_at` so a retry never sends twice.

Add it to `FOLDERS=(...)` in `scripts/deploy-functions.sh`, extend
`scripts/sync-leak-questions.mjs` to also emit `supabase/functions/_shared/scorecard-checks.ts`, and
regenerate the installer with `npm run build:installer`.

New environment (optional; falls back to the leak-test webhook):
`N8N_SCORECARD_WEBHOOK_URL`, `N8N_SCORECARD_WEBHOOK_SECRET`.

---

## 7. Tests to add to `supabase/tests/access.test.mjs`

The harness applies every migration in `supabase/migrations` in filename order, then runs named
assertions through `expect(label, fn, check)` with `as('anon' | 'owner' | 'learner', ...)`. Add these
sixteen after the existing leak-test block:

| # | Assertion |
| --- | --- |
| 1 | anon can submit a score and gets a token back |
| 2 | a bad email is refused |
| 3 | `consent = false` is refused |
| 4 | a nineteen-answer array is refused |
| 5 | the database recomputes the score and ignores a lying client |
| 6 | bands fall on the right boundaries (7/8, 14/15, 18/19) |
| 7 | the weakest week is the week with the highest share of failed checks, ties to the lower week |
| 8 | the result needs the right token; a wrong token returns nothing |
| 9 | the gap report needs the right token and lists only failed checks |
| 10 | a fourth submission from one email on the same day is accepted, the eleventh is refused |
| 11 | anon cannot read `scorecard_submissions`, `scorecard_fixes`, the lead list or the overview |
| 12 | a learner cannot read the lead list or the overview |
| 13 | the team can read the lead list, the band mix and the pass rates |
| 14 | a second attempt is numbered 2 and the result reports the previous score |
| 15 | a non-team caller gets `42501` from `scorecard_overview()` |
| 16 | re-running migration 23 changes nothing and does not overwrite an edited fix |

Shape of the additions, in the existing style:

```js
await expect('anon submits a score', () => as('anon', () => q(
  `select * from breadmaker.submit_scorecard($1, $2, $3, '{}'::jsonb, $4::boolean[], true)`,
  ['owner@example.com', 'Ada', 'Acme', Array(20).fill(true)]
)), (r) => rows(r)[0]?.yes_count === 20);

await expect('a lying client is ignored', () => as('anon', () => q(
  `select yes_count, band from breadmaker.submit_scorecard($1, '', '', '{}'::jsonb, $2::boolean[], true)`,
  ['liar@example.com', Array(20).fill(false)]
)), (r) => rows(r)[0]?.yes_count === 0 && rows(r)[0]?.band === 'not-started');

await expect('anon cannot read the leads', () => as('anon', () => q(
  `select * from breadmaker.list_scorecard_leads()`
)), (r, e) => !!e);

await expect('the team reads the overview', () => as('owner', () => q(
  `select breadmaker.scorecard_overview() as o`
)), (r) => typeof rows(r)[0]?.o === 'object');
```

---

## 8. Rollout

| Phase | Work | Effort | Acceptance |
| --- | --- | --- | --- |
| 0 | Confirm the band → CTA mapping and that Launchpad ₦35,000 / Foundry ₦150,000 are the right prices to route to | 1 hour | Agreed here |
| 1 | Apply migration 23, add the sixteen tests | 0.5 day | `npm run test:db` passes; migration applied to the shared database |
| 2 | `src/lib/scorecard.ts`, `src/types.ts`, the page: landing, four screens, instant score | 1 day | A visitor can score and see a number with no network dependency |
| 3 | Gate, `submit_scorecard`, the report page, `scorecard-notify`, n8n event | 1 day | A real submission emails a real gap report and appears in n8n |
| 4 | Studio section, header/footer/Foundry/Leak Test wiring, `docs/` update | 0.5 day | The team reads the leads and the pass rates in Studio |
| 5 | Two weeks live, then read `scorecard_check_pass_rates()` | — | The content rewrite is driven by the checks nobody passes |

**Deploy order matters:** migration 23 before the frontend deploy, or the page will call RPCs that do
not exist yet. The reverse is safe (an unused RPC costs nothing).

---

## 9. Deliberately out of v1

- **An AI-written plan from the 20 checks.** The Leak Test proves the pattern works, but the scorecard
  has to earn the right to it: ship the fixed advice first, measure, then consider generation.
- **A paid tier, a PDF, or a per-result OG image.** The gap report is a free lead magnet; the paid
  products are the kits and the programs.
- **A new unified `leads` table.** The data is already spread across `contact_messages`,
  `applications`, `cohort_waitlist`, `leak_test_submissions`, `system_interest` and now
  `scorecard_submissions`. If the team wants one list, add a read-only view over those six later —
  migrating them now would break four working flows for no user-visible gain.

## 10. Risks

| Risk | Mitigation |
| --- | --- |
| Two front doors confuse the visitor | They speak to different buyers: Leak Test for the non-technical owner, Scorecard for the technical operator. Cross-link them, never merge them |
| A public scorecard tells people they are failing | Frame every line as a gap with a fix, never as a verdict. No earnings claims anywhere |
| The 20 items drift from the curriculum | The tests assert 20 positions and the band boundaries; the curriculum doc and the code carry the same list, and `npm run sync:questions` keeps the edge copy honest |
| Lead data protection | Same posture as the Leak Test: explicit consent stored with a timestamp, token-only access to your own result, team-only reads, and a ten-a-day limit per address |
| Another abandoned half-built surface | Phases 1–3 are three days end to end; if it stalls after phase 2, nothing is broken, because the page works without the database |
| 10 | **`returns table (position integer, ...)` is a syntax error in Postgres.** The SQL editor stopped at line 252 with `42601 syntax error at or near "position"` | `position` is a `col_name_keyword`: legal as a table column, illegal as a function parameter or OUT name. The check number is now `check_position` in the table, in both RPCs and in this document, and a naming note at the top of the migration says why |
