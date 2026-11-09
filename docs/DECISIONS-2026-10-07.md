# The four decisions — walkthrough and recommended calls

**Date:** 7 October 2026
**Purpose:** turn the four open questions from `docs/STATUS-REVIEW-2026-10-07.md` into decisions you can
make today, with the facts each one turns on, the cost of each option, and a recommended call.

**How to read this:** every decision has a *decision rule* — the one fact that settles it. If the fact
is true, take option A; if not, take option B. You know the facts better than the repo does; the repo
only knows what was written down.

---

## Decision 1 — The six kits: record or testing?

### What is actually true today

I read the seed that created them (`supabase/migrations/20240101000022_system_kits.sql`, lines 99–170):

- Each kit is a course with **5 sessions**. Four are "Step N · <day>" generated directly from the
  pillar's 30-day plan text in `leak_test_report_content`, and the fifth is "Your definition of done"
  listing the four done-items for that system.
- They were seeded as **Draft with no price**, on the instruction "fill in the content, set the price
  and publish them in the Studio; nothing shows until then".
- In production today, **all six are published and priced** (₦15,000–₦30,000) and appear on `/systems`
  and `/courses`. The homepage FAQ still says offer, sales, cash and delivery "are in testing and will
  be listed once they have a record".

So the kits exist as *teaching material derived from the Leak Test's own plans*. What does **not**
exist anywhere in the repo or the database is the thing the validation standard actually asks for:
**the record — what we set up, what happened, what went wrong.**

### Why it matters more than the money

The six kits are worth ₦15,000–₦30,000 each, and they are **already included free** in the programs
that build them (`program_kit_bundles`: Launchpad includes three, Foundry includes four). So standalone
kit sales are the *marginal* revenue here, and with no traffic driving to them that marginal revenue is
approximately zero today. What is not marginal is the claim. "We run it ourselves first, and we keep
the record" is the only reason a stranger should trust a ₦150,000 program over a YouTube playlist. If
a buyer asks for the record and there isn't one, you lose the argument you built the whole site around.

### The options

| Option | What it costs | What it buys |
| --- | --- | --- |
| **A. Keep them on sale, write the record this week** — one page per kit ("how we run this ourselves: what we set up, what happened, what went wrong"), linked from the kit page; demote any kit you cannot write honestly to testing | ~3–4 hours of writing, plus your honesty | Removes the contradiction, keeps the revenue, and converts the standard from a claim into a page a buyer can read. The strongest version of the position you already took |
| **B. Move all six to testing** — unpublish the price, keep them free inside the programs, collect "tell me when it is ready" | ₦0 revenue (which is what they earn today), plus a site that looks pre-launch on `/systems` | Perfect consistency with the written standard with no writing work |
| **C. Split** — keep the one or two you genuinely run daily, demote the rest | Half the writing, a mixed page | Consistency, but a two-tier catalog needs explaining on the page |

### Decision rule

> **Do you already run each of these six systems in your own business, today, in a way you could
> describe in a page?**
>
> - **Yes for most of them** → Option A. Write the records; the material is already written, only the
>   evidence is missing. This is the version of Breadmaker that wins.
> - **No, or only for one or two** → Option B for the rest, Option C overall. Publishing a price is a
>   claim; publishing it without the record is the one thing the site says it never does.

### Recommended call

**Option A, with the decision rule applied honestly per kit.** You already run a real stack in this
business — Supabase, Coolify, n8n, Flutterwave, Chatwoot, Cal.com — so at least the tech, invoicing
and lead-capture systems are live in your own operation. Write those records. If the delegation pack
or the delivery tracker is not something you run yet, say so on its page and mark it "in testing"
until it is.

### Actions if you accept

1. Add a `record` field (or a "How we run this" section) to the kit course in Studio, and a `Live` /
   `In testing` badge on the kit card on `/systems`, driven by the same published state that already
   controls the price. One migration-free change plus one small component edit.
2. Fix the homepage FAQ line so it matches whichever state each system is in.
3. Add one line to the validation standard page: "Read the record for each live system" with the link.
4. Update `docs/POSITIONING.md`, which currently says the kits are seeded as unpublished drafts.

**What would change my mind:** if the six kits were published to test pricing or demand rather than to
sell, say so and we demote them (Option B) — a price experiment is a legitimate reason, but it should
not be presented as a validated system.

---

## Decision 2 — The lead magnet: build `/scorecard`, or something lighter?

### What is actually true today

The sibling Manus session's diagnosis — "there is no lead magnet" — is right about the *asset* and
wrong about the *list*. Two things are already true:

- **You are already collecting consented contacts.** Every Leak Test submission stores name, email,
  WhatsApp, a consent flag and a timestamp (`leak_test_submissions`, migration 17), and every
  submission and unlock is POSTed to n8n. So the list exists; **the follow-up does not.**
- **There is no offer for the person who will not answer 30 questions**, and nothing at all aimed at
  the technical owner-operator who is Foundry's actual buyer. The Leak Test speaks to a busy,
  non-technical owner. Foundry's buyer is the person who runs a terminal.

That second gap is why the scorecard is the right magnet rather than a generic checklist: the 20 items
already exist, they are already the curriculum's grading rubric, and they speak the technical buyer's
language.

### The options

| Option | Effort | What it does |
| --- | --- | --- |
| **A. The `/scorecard`** — 20 checks, instant score, email for the gap report, routing to Launchpad / Foundry / a call | ~3.5 days (plan in `docs/SCORECARD-PLAN.md`) | A second front door for the technical buyer, a diagnostic gate for Foundry, and per-check failure data that tells you what content to lead with |
| **B. Lighter first** — a printable Day-30 scorecard PDF behind an email, no interactivity | ~half a day | Captures an email, segments nobody, gives no data |
| **C. Just use the list you have** — build the n8n nurture sequence on `submitted` / `paid` and export the leak-test leads | ~half a day | Earns money from traffic you already paid for, before you build anything new |

### Decision rule

> **Are you driving meaningful traffic to the site yet?**
>
> - **No (likely, today)** → do **C now, then A**. C is half a day and makes the existing Leak Test
>   traffic worth more; A is the asset that makes future traffic convert. B is not worth building at
>   all — an email-gated PDF is what everyone else does, and it segments nothing.
> - **Yes, and the technical audience is arriving** → skip to A.

### Recommended call

**Do C this week, then build A.** Not either/or: the nurture sequence is a day's work in n8n against a
webhook you already fire, and it will tell you within a week whether anyone wants the paid report. Then
build the scorecard, positioned for the Foundry buyer, and cross-link it from the Leak Test result page
("already own the technical side? check your 20").

### Actions if you accept

1. Build the two n8n flows on `submitted` and `paid` (the payload and the `result_url` are documented
   in `docs/LEAK-TEST.md`), and the `ai_review_needed` WhatsApp alert.
2. Build `/scorecard` to the plan in `docs/SCORECARD-PLAN.md`.
3. Reuse the 20 items **verbatim** from `docs/ACADEMY-CURRICULUM.md` — they are already graded against
   the curriculum, so the marketing asset and the pedagogy stay one artifact.

**What would change my mind:** if you tell me the technical buyer is not a real segment yet and Foundry
is selling to the same owners as Launchpad, then the scorecard is the wrong second magnet and we should
instead put the Leak Test on the Foundry page.

---

## Decision 3 — The homepage video: record it, or ship without?

### What is actually true today

- `docs/VSL-SCRIPT.md` is finished: ~2:20, ~330 spoken words, with on-screen directions, a hook, a Leak
  Test walkthrough, a systems walkthrough, and a no-claims rule written into it.
- The homepage slot is built and says **"Video coming soon"**.
- `VITE_VSL_URL` is not set in Coolify, so nothing plays.
- Separately: **0 of 26 Academy sessions have a video** (`docs/ACADEMY-CURRICULUM.md`, Coverage table).
  The instructional-design review calls recording them "the single biggest lever for the self-paced
  tier, because it replaces the demonstration a live learner gets for free".

Two different jobs are being conflated: the homepage video is *marketing*, the session videos are
*teaching*. They need different decisions.

### Decision rule

> **Can you be on camera for four minutes this week?**
>
> - **Yes** → record the homepage VSL first (half a day including the screen recordings), because the
>   script is written and the slot is already built. Then, separately, record the first three Foundry
>   sessions.
> - **No** → **delete the "Video coming soon" placeholder** and ship the hero without it. A placeholder
>   that has said "coming soon" for weeks reads as an unfinished site; nothing reads as a deliberate
>   choice.

### Recommended call

**Record the homepage VSL this week; do not attempt all 26 sessions.** Sequence:

1. **Homepage VSL** (half a day): phone camera for the open and close, screen recordings of the Leak
   Test and `/systems` in between, one take per section, no editing beyond trimming. Upload unlisted to
   YouTube, set `VITE_VSL_URL`. The script's own rule applies: no earnings claims, no "guaranteed".
2. **Then the three sessions a learner meets first** — Foundry Kickoff, Your offer, Build the page —
   at 5–8 minutes each, screen recording with voice, no editing. These carry the free preview, so they
   are the highest-leverage recordings in the Academy.
3. **Leave the other 23 sessions text-only for now.** Recording them before a single learner has gone
   through the program risks re-recording all of them after the first cohort.
4. If recording slips past two weeks, take the fallback: remove the placeholder.

**What would change my mind:** if you would rather not be the face of it, the script can be reworked as
pure screen recording with a voiceover — still half a day, still removes the placeholder.

---

## Decision 4 — Where the next block of work runs

### What is actually true today

| Fact | Consequence |
| --- | --- |
| The build loop is local Claude Code: repo at `C:\Projects\BreadmakerSys`, `.claude/launch.json` with two dev-server profiles, and every commit pushes to `main` which auto-deploys to production | Code changes are fastest and safest there; the toolchain, the dev server and the deploy path are all already working |
| This Manus session has Coolify and Supabase-level visibility (that is how the review was done) but **no GitHub connector for `Restart-inc/breadmaker-sys`** — the enabled connector points at `adeusuf/restart-inc` — and `gh` is not installed | I cannot push to this repo from here today, and I should not pretend otherwise |
| The device terminal is currently unavailable (`terminal:config home unavailable`) | Even local shell work here is blocked at the moment |
| There is no CI | Whichever agent writes `main`, nothing checks it before it deploys |

### Decision rule

> **Does the work change application code that must deploy?**
>
> - **Yes** → do it in the local Claude Code loop. That is where the feedback loop is.
> - **No** (planning, schema drafts, copy, config, verification, Coolify/Supabase changes) → this
>   session is well suited to it, and it is the only one that can see the production stack directly.

### Recommended call

**Split by artifact, not by phase, and make `main` single-writer.**

- **Local Claude Code** owns code on `main`: components, migrations, edge functions, tests.
- **This session** owns planning, schema drafts, copy, Coolify/Supabase configuration, and
  verification passes — plus the CI below, so neither side can break `main` silently.
- **One rule to remove the ambiguity:** only one workstream writes `main` at a time. Everything else
  goes through a branch and a PR, and CI now runs lint + the 135 database assertions on every PR
  (see `docs/REPO-HYGIENE-AND-CI.md`).

### If you want me to take code work here

Two things need to be true first: enable the GitHub connector for **`Restart-inc/breadmaker-sys`**
(the current one is `adeusuf/restart-inc`), and confirm the device terminal is back. With those, I can
branch, commit, open a PR and let CI check it — without ever touching `main` directly.

---

## The four calls at a glance

| # | Decision | Recommended call | First action | Cost of being wrong |
| --- | --- | --- | --- | --- |
| 1 | Kits: record or testing | **Write the record per kit this week; demote any you cannot write honestly** | Add a "How we run this" section + Live/In testing badge to kit cards | The brand's only differentiator |
| 2 | Lead magnet | **n8n nurture on existing leak-test leads this week, then build `/scorecard`** | Two n8n flows on `submitted` / `paid` | Wasted traffic, no list growth |
| 3 | Video | **Record the homepage VSL this week; then the 3 sessions learners meet first; never all 26 before cohort 1** | Half a day, phone + screen recording, set `VITE_VSL_URL` | An unfinished-looking hero |
| 4 | Where work runs | **Code in local Claude Code; planning/verification here; `main` single-writer; CI on every PR** | Merge `.github/workflows/ci.yml` | Unchecked changes deploying straight to production |

**The first three things I would do, in order:** merge the CI workflow (5 minutes, protects everything
else), build the two n8n flows (half a day, earns from existing traffic), and write the kit records
(three hours, removes the one contradiction that could cost you the position).
