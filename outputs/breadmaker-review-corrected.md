# Breadmaker Systems: corrected platform review

Corrected 2026-10-21. It replaces the review in `breadmaker-chat-session-verbatim.md` and is checked against the repo and the live Coolify app (`djcmld7jynzk77d8t4girlxp`).

## What was wrong in the first review

| Original claim | Corrected finding |
|---|---|
| "Kits are priced before they are validated; protect trust first" | Systems are proven through Restart Inc. client deployments that are live and paid. What is unproven is the teaching: the curriculum has not been tested with a learner cohort. The problem is that the proof is not visible, not that it is missing. |
| "Add reliable CI" | `.github/workflows/ci.yml` already runs `npm run lint`, `npm run test:db` and `npm run build` on Ubuntu, Node 20, for every push and PR to main. The CI gap is closed. |
| "Add the Restart Inc. relationship to the site" | It is already stated in `HomePage.tsx:119` and `AboutPage.tsx:77`. It is a single sentence, with no operating history, no per-system record and no mention of Ademola's role. |
| Test crash (out of memory on Windows) implied a test problem | Unverified. Docs record 135 assertions passing, and CI runs the same suite on Linux. Treat it as a local Windows/PGlite problem. Check the latest Actions run for the authoritative result. |
| Bundle about 982 KB, no lazy-loading | Lazy-loading is confirmed absent (no `lazy(` anywhere in `src`). The size figure came from a local build and was not re-measured here. |
| Left out the Hub, Partner, photos and Lago work | See "What exists" below. |

## Verified current state

- **Live app:** `breadmakersystems.com` is running and healthy (Coolify, `Restart-inc/breadmaker-sys`, main).
- **Homepage video:** `VITE_VSL_URL` is **not set** in Coolify, so the homepage still shows "Video coming soon".
- **Booking:** `VITE_CALL_BOOKING_URL` is also **not set**, so Report + Call buyers get an email instead of a booking button.
- **Env vars present:** Supabase, `N8N_LEAK_WEBHOOK_URL`, `VITE_PAYMENTS_ENABLED`, Flutterwave secret and webhook hash, `PUBLIC_SITE_URL`.
- **Schema:** the app lives in the `breadmaker` schema. The only `public.` objects in the migrations are `course_chunks` and `tutor_sessions` (AI tutor legacy).
- **Migrations:** 35 files. You apply them yourself.
  - Still to apply: **27** (Leak Test admin), **28** (Hub), **35** (profile photos).
  - Per memory, 19 to 22 are applied. I did not check 23 to 26, 29 to 34.
- **Routing:** `App.tsx` (201 lines) maps the first URL segment by hand. It works, but it blocks route-level code splitting.

## What exists

- **Public site:** home, About, Guides and Tools, Launchpad and Foundry program pages.
- **Business Leak Test:** 30 questions across 6 pillars, with a score, an archetype, and a paid AI report and 30-day plan.
- **Learning platform:** courses, modules, sessions with "one action" and "done when", progress, previews, downloads, and a free-course flag.
- **Studio (back office):** applications, payments, cohorts, products, courses, learners, Leak Test admin, support, team.
- **Payments:** Lago with Flutterwave. Lago leaves invoices pending, so payments are reconciled from Flutterwave. The reconcile cron is migration 25. Dual currency is migration 29.
- **Memberships:**
  - **Breadmaker Hub** (monthly pass, migration 28).
  - **Prestige Partner**: two tiers, Partner at $400 a month with 5 seats and a written SLA (migration 33).
- **Also built:** agent usage tracking (34), profile photos (35, upload UI built), system kits (22), a support module (31).
- **Tests:** database access tests (135 assertions per docs) and Linux CI.

## Gaps, in priority order

### 1. Make existing proof visible (highest value, low cost)
- Expand the one-line Restart Inc. mention into a short provenance block: what Restart operates, how long, and Ademola's role as Technical Founder.
- Give each kit a short record: where it was deployed, since when, still active or not, what "working" means, and known limits.
- Show two separate statuses on each kit. "System: proven in Restart deployments" and "Teaching: being refined with learners".
- Use anonymised or permissioned client examples. Do not expose Restart client data (shared Supabase).

### 2. Two environment variables that cost 15 minutes
- Record the homepage video and set `VITE_VSL_URL`. If it won't be recorded soon, remove the placeholder instead. An unfinished hero hurts conversion.
- Set `VITE_CALL_BOOKING_URL`.

### 3. Acquisition and follow-up
- Leak Test takers who don't buy are not nurtured. Add a consent-aware `leads` table in `breadmaker` and a short email sequence per weakest pillar.
- Add funnel analytics: Leak Test start and completion, email capture, report purchase, application, checkout, enrolment, lesson completion.

### 4. UX
- Sharpen the homepage hero: say what the visitor will build and own.
- Add a "which path is for me" table: Leak Test, kit, Launchpad, Foundry, Hub, Partner.
- Free Leak Test result: show the biggest leak, one action this week, and the matching kit or program.
- First-run onboarding for new learners (goal, technical level, hours per week).
- Course and kit cards that answer: what problem, what exists at the end, how long, who it is not for.
- Paid report: a "start here this week" block, tickable actions, and a "done when" for each recommendation.

### 5. Learning quality
- Add evidence of competence to sessions: an expected artifact, a link or upload, and coach review (pass or not yet), instead of only a completion checkbox.
- Run a pilot cohort of 5 to 6 learners before recording all 26 sessions. Record the first 3 only.

### 6. Engineering
- Lazy-load Studio, the learning platform, the Leak Test report, Partner and Hub, and split the main chunk. Consider a real router later.
- Add cross-product isolation tests for the shared Supabase: Breadmaker users cannot read Restart data, storage paths stay product-scoped, and the service role is used only where intended.
- Document which objects are intentionally shared (auth) and which are Breadmaker-only (`breadmaker` schema).
- If the Windows test crash recurs, run `node --max-old-space-size=4096` or rely on CI.

## Your open actions
1. Apply migrations 27, 28 and 35 (and confirm 23 to 26, 29 to 34).
2. Set `VITE_VSL_URL` and `VITE_CALL_BOOKING_URL` in Coolify, or remove the placeholder.
3. Decide how much Restart client proof can be shown publicly.
