# Business Leak Test

A free 30-question self-assessment ("Where is your business leaking?") that doubles as a
lead engine and a paid report. It lives at `/leak-test`.

## The flow

1. **Landing** (`/leak-test`): one call to action, "Take the free test".
2. **Profile**: 5 unscored questions (industry, business age, team size, monthly revenue
   band, main goal), used to segment and benchmark.
3. **Quiz**: 30 scored questions, 5 per pillar, one per screen, Never (0) to Always (4).
   Keys 1 to 5 answer. Questions and fixes are in `src/lib/leak-test.ts`.
4. **Gate**: name, email, WhatsApp number and a consent checkbox unlock the result. The
   result is saved and an email with a link goes out.
5. **Free result**: overall score, band, archetype name, the name of the biggest leak and a
   shareable card. Nothing else is shown until the report is unlocked.
6. **Paywall**: pay with Flutterwave, or enter a partner code.
7. **Full report** (`/leak-test/report`): radar chart, every leak ranked with an
   explanation, a 30-day plan (4 actions each) for the top two leaks, the archetype's blind
   spot and how to cover it, the owner-dependence breakdown, and a benchmark. "Download PDF"
   opens the browser's print dialog with a print layout.

Scoring: a pillar is its five answers' sum / 20 x 100; the overall score is the average of
the six pillars. Bands: 0-39 Firefighting, 40-59 Surviving, 60-79 Stabilising, 80-100
Scaling. The biggest leak is the lowest pillar; ties go to Finance, Sales, Operations,
Offer, Team, Tech. The owner-dependence index is Q15 + Q22 + Q23 + Q25 (warning under
8 of 16). The database recomputes the pillar scores, total and band from the answers; the
archetype and biggest-leak names are stored as sent.

## Why the paywall holds

The report text lives in `breadmaker.leak_test_report_content`, which nothing can read
directly. `get_leak_test_report()` returns it only when the submission is unlocked (paid or
code), and every read of a result needs the secret token that only the person who took the
test has (in their browser and in their email). The result page and the report page work
from the link in the email, on any device.

## Setting it up

### 1. Database

```bash
DATABASE_URL=postgres://... node run-migrations.js 20240101000017_leak_test.sql
```

It creates `leak_test_submissions`, `leak_test_prices`, `leak_test_codes`,
`leak_test_report_content`, the public RPCs and a `submission_id` column on `payments`.
`npm run test:db` covers it: consent and input checks, scoring, token access, the paywall, codes and benchmarks.

### 2. Edge functions

```bash
./scripts/deploy-functions.sh
```

Two new functions and an updated `_shared/flutterwave.ts`:

| Function | Purpose |
| --- | --- |
| `leak-test-checkout` | Creates the pending payment (program `leaktest`) and the Flutterwave link; the price comes from the database |
| `leak-test-notify` | Sends the result email and pushes the lead to n8n, once per result |

`flutterwave-verify` and `flutterwave-webhook` are unchanged: when they settle a
`leaktest` payment they unlock the report and send the "report ready" email instead of
enrolling anyone.

Environment for the edge-functions container, in addition to the Flutterwave variables in
[FLUTTERWAVE.md](FLUTTERWAVE.md):

```
RESEND_API_KEY=...                       # already set for send-email
LEAK_TEST_FROM="Breadmaker Systems <academy@breadmakersystems.com>"   # optional
N8N_LEAK_WEBHOOK_URL=https://.../webhook/leak-test                    # optional
N8N_LEAK_WEBHOOK_SECRET=...                                           # optional, sent as x-webhook-secret
KUMODA_LEAD_WEBHOOK_URL=https://kumoda.io/webhooks/leads/<token>      # optional, adds leads to the Kumoda pipeline
```

Set `VITE_PAYMENTS_ENABLED=true` in the site build to show the Unlock buttons. Without it,
people can still redeem codes.

### 3. Lead follow-up (n8n)

Every submission, and every unlock, is POSTed to `N8N_LEAK_WEBHOOK_URL` as JSON:

```json
{ "event": "submitted", "name": "...", "email": "...", "whatsapp": "...",
  "profile": { "industry": "...", "business_age": "...", "team_size": "...", "revenue_band": "...", "main_goal": "..." },
  "score": 62, "band": "stabilising", "archetype": "The Steward", "biggest_leak": "Sales & Lead Flow",
  "owner_dependence": 9, "paid_tier": null, "code": null, "result_url": "https://.../leak-test/result?s=...&t=..." }
```

`event` is `submitted` or `paid`. Build the email and WhatsApp nurture sequence from there.

### 4. Lead pipeline (Kumoda)

Set `KUMODA_LEAD_WEBHOOK_URL` and every result also lands on the **Breadmaker** workspace's lead
pipeline in Kumoda. It does not replace n8n; both run.

One-time setup in Kumoda, signed in to the Breadmaker workspace:

1. **Leads → Lead forms → New form.** Name it "Business Leak Test", source label `leak-test`, tag `leak-test`.
2. Set **Also add to the lead pipeline at stage** to the stage new leads should start in (usually *New*).
3. Leave consent on "per submission". The site sends `consent_email` always and `consent_whatsapp` when a
   number was given, with the exact tick-box wording, so each person's consent is logged in Kumoda.
4. Copy the form's URL into `KUMODA_LEAD_WEBHOOK_URL` in the edge-functions container and restart it.

What happens per result:

- A contact is created (or matched by phone, then email), with the answers saved as custom fields
  (score, band, archetype, biggest leak, profile, result link).
- One pipeline card is created in the chosen stage, with the answers as a timeline note.
- When the person unlocks the report, a second note ("paid") is added to the same card and the contact gets the
  `leak-test-paid` tag. The card is never duplicated and never moved back by a repeat event.
- Each result is sent once (`Idempotency-Key: leak-<submission>-<event>`), with up to three attempts. If Kumoda
  is unreachable, the error is logged as `leaktest notify failed` and the result email still goes out.

## Running it

Prices (kobo). They start at 4,000 and 20,000 naira. Validate them, then change with no deploy:

```sql
update breadmaker.leak_test_prices set price_minor = 500000 where tier = 'report';
update breadmaker.leak_test_prices set price_minor = 2500000 where tier = 'report_call';
```

Launch offer (migration 19): 30% off for 48 hours, counted from the result date. The paywall shows
a countdown, the result email states the deadline, and `leak-test-checkout` applies the discount
itself, so the browser cannot extend it. Change or switch off with no deploy:

```sql
update breadmaker.leak_test_prices set discount_pct = 0;      -- off
update breadmaker.leak_test_prices set discount_hours = 72;   -- longer window
```

Partner codes for accountants, incubators, banks and cooperatives (50 single-use codes):

```sql
select * from breadmaker.create_leak_test_codes('Acme Accountants', 'report', 50);
-- tier is 'report' or 'report_call'; optional 4th argument is uses per code, 5th an expiry
```

Leads (team members only):

```sql
select created_at, name, email, whatsapp, total, band, archetype, leakiest, paid_tier
from breadmaker.list_leak_test_leads();
```

Benchmarks appear in the report when 30 businesses in the same industry (or 30 in total)
have taken the test. Until then the report says how many have.

## Not built

- **Server-side PDF.** "Download PDF" uses the browser's print dialog and a print layout, and
  the email carries a link. A generated attachment needs a PDF renderer in the edge runtime.
- **Per-result social preview image (OG).** The share card is drawn in the browser and shared
  or downloaded as an image, but links shared to `/leak-test` show the site's generic preview,
  because the site is a static app and cannot set a different preview per link.
- **A Studio screen for leads and codes.** Use the SQL above for now.
- **The `grant_leak_test_report` check also exposes a gap in the older `enroll_from_payment`**
  from migration 15: Postgres grants EXECUTE to everyone by default, so anonymous callers can
  run it. It only acts on payments already marked successful, so it is low risk, but it should
  get the same `revoke` the new function has.

## The personalised report (migration 20)

The paid report has three layers, each more specific to the business than the last.

1. **Template layer.** Pillar text and 30-day plans, chosen by score band and archetype (as before).
2. **Profile-aware layer.** The five profile answers (goal, team size, revenue, age, industry) pick a
   note per answer and extra "Tailored for you" actions per pillar. The goal also adds its pillar to
   the plan when it is not already one of the two weakest. The text lives in
   `leak_test_report_content` rows keyed `profile:main_goal`, `profile:team_size`, `profile:revenue_band`,
   `profile:business_age` and `profile:industry`, so it can be edited with no deploy.
3. **AI layer.** After unlocking, the owner answers three questions (what the business does, biggest
   frustration, what they have tried). `save_leak_intake` stores them and queues the job; opening the
   report calls `leak-test-generate`, which sends the scores, profile, weakest answers, intake and the
   base plan to Claude and stores a structured plan on the submission. The report polls until it lands.

### Review gate

- **Report** buyers see the AI plan as soon as it is written.
- **Report + call** buyers see "being checked by our team" until someone releases it in
  **Studio → Leak Test**, where the plan is shown as editable JSON with Save, Release, Hide and
  "Write it again". The team is told by an n8n webhook event, `ai_review_needed`, with a `review_url`.
- The paywall still holds: the AI text only leaves the database through `get_leak_test_report`.

### Review call

After a Report + call payment the report shows a booking button (`VITE_CALL_BOOKING_URL`, for example a
Cal.com link; name, email and the result id are prefilled). Studio → Leak Test tracks each call as
To book, Booked or Done, with a time and notes. The AI plan includes "questions to bring to your call".

### Setup

Edge-functions container (add them to the service's `environment:` in the compose file, then redeploy):

```
ANTHROPIC_API_KEY=sk-ant-...          # required for the AI section
LEAK_AI_MODEL=claude-sonnet-5-5       # optional, this is the default
```

`N8N_LEAK_WEBHOOK_URL` and `N8N_LEAK_WEBHOOK_SECRET` are the same ones the lead webhook already uses.

Build variable: `VITE_CALL_BOOKING_URL`.

Deploy the new function and shared question list with `scripts/install-edge-functions.sh` (regenerate it
with `npm run build:installer`). If you change a question, run `npm run sync:questions` first so the
generator reads the same wording as the site.

Useful n8n flows: on `ai_review_needed`, message the team on WhatsApp with the `review_url`; on
`submitted` and `paid`, the existing nurture sequence.
