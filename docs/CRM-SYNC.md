# Evo CRM sync

Every Breadmaker form lands in Evo CRM (https://crm.restart.ng, API https://api-crm.restart.ng) as a contact with custom attributes and a deal card.

## How it works

1. Database triggers (migration 43) copy each submission into `breadmaker.crm_outbox`. Secrets are stripped first. A queue failure never blocks the form.
2. `pg_cron` calls the `crm-sync` edge function every minute. It finds or creates the contact by email, merges attributes and labels (the CRM replaces them on update, so it reads first), and creates or moves one deal card per contact per pipeline.
3. A failed row retries with a growing delay (8 tries). `last_error` is kept on the row. Replaying a row is safe.

| Entry point | Table | Contact | Deal card |
|---|---|---|---|
| Guides / Tools newsletter | `leads` | subscriber, consent flags | Marketing / Lead (only if they ticked the box) |
| Contact form | `contact_messages` | lead | Sales / New Lead |
| Foundry, Launchpad, done-with-you | `applications` | applicant, answers on the card | Sales / New Lead. Status moves it: reviewed → Qualification, accepted/invoiced → Proposal, paid/enrolled → Closing |
| Cohort and Hub waitlists | `cohort_waitlist` | lead | Marketing / Nurturing |
| Business Leak Test | `leak_test_submissions` | score, band, archetype, biggest leak, business profile | Marketing / Nurturing. Report bought → Marketing / Qualified. Report + call → Sales / Qualification |
| Prestige Partner | `partner_applications` | lead, then partner when approved | Sales / New Lead, approved → Proposal |
| "Tell me when it's ready" | `system_interest` | lead, running list of systems | Marketing / Lead |
| Successful payment | `payments` | customer, first paid date | Sales / Closing (programme payments only) |

Rules the sync keeps: lifecycle stage only moves forward (a customer is never set back to subscriber); first-touch channel and source are never overwritten; cards only move forward; declined applications keep their card where it is; Nigerian numbers (0801…) become +234801… and an invalid number is kept in the `whatsapp` attribute only.

## Added in migration 44

- **Lifecycle events:** sign-ups (`profiles`), course enrolments, Hub memberships and support tickets sync too, so one contact card
  shows learner, member and open-ticket state. Ticket bodies are never sent, only subject, category and status.
- **Where leads come from:** `src/lib/attribution.ts` records utm tags, referrer and landing page on the visitor's first page load.
  After a form is sent, `record_touch()` stores them against the email and crm-sync writes `first_touch_*` (once) and `last_touch_*`.
  Direct visits are recorded as `direct`. This starts working when the site is deployed.
- **Lead score and priority:** 0 to 100 from the entry point and, for Leak Tests, the score, owner dependence and any paid report.
  70+ is `hot`, 40+ `warm`, else `cold`. The score only rises. A newly hot lead gets the `hot-lead` label and an email to
  `CRM_ALERT_EMAIL` (default adeusuf@restart.ng). Rows older than 24 hours never email. Tune `leadScore()` in `crm-sync/index.ts`.
  The CRM would not let the service token create tasks, so a label plus the email is the follow-up signal.
- **Health alert:** if a submission waits more than 15 minutes, or gives up after 8 tries, you get one email an hour.
- **Kumoda:** `scripts/crm-import-kumoda.mjs` imports Kumoda customer accounts as contacts (and cards in a "Kumoda Customers"
  pipeline once that pipeline exists). Only account facts are copied. Messages, contacts and conversations inside a customer's own
  Kumoda workspace belong to that customer and are not imported.

## Attributes

`scripts/crm-attributes.mjs` creates all 40 definitions (31 contact, 9 deal-card fields) and is safe to re-run. The keys in it are the ones `supabase/functions/crm-sync` writes, so change them together.

```
CRM_API_URL=https://api-crm.restart.ng CRM_SERVICE_TOKEN=<EVOAI_CRM_API_TOKEN> node scripts/crm-attributes.mjs
```

## Switching it on

1. Apply `supabase/migrations/20240101000043_crm_outbox.sql`. It also queues everything that already exists, once.
2. Set the function URL and the job's secret once (run as `supabase_admin`; the `postgres` role cannot write the `breadmaker` schema):
   `alter database postgres set app.settings.crm_sync_url = 'https://db.restart.ng/functions/v1/crm-sync';`
   `alter database postgres set app.settings.crm_sync_secret = '<CRON_SECRET from Coolify>';`
3. Add to the edge-functions environment (and its compose `environment:` list): `CRM_API_URL=https://api-crm.restart.ng` and `CRM_SERVICE_TOKEN` = the value of `EVOAI_CRM_API_TOKEN` on the evo-crm service in Coolify. `CRON_SECRET` is already there.
4. Paste `scripts/install-edge-functions.sh` into the edge-functions container and restart it.

Check it: `select count(*) filter (where sent_at is null) as waiting, max(last_error) from breadmaker.crm_outbox;` should reach 0 waiting within a few minutes.

## Notes

- Pipelines are matched by type (marketing, sales) and stage by name. Renaming a stage makes the sync skip the card (the contact is still saved) and log a warning.
- The CRM's pipeline tables needed repairs after the first deploy (skipped migrations, a stale foreign key on `stage_movements`). They are fixed in the database.
