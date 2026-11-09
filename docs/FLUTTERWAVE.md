# Flutterwave checkout for Breadmaker programs

Cards, bank transfer and USSD for the six support levels (Self-paced, Guided and
Done-with-you on both programs). The flow is:

1. The applicant finishes the form on `/<program>/apply` and presses **Pay**.
2. `flutterwave-checkout` reads the price from `breadmaker.program_tiers`, records a
   **pending** payment, and returns a Flutterwave checkout link.
3. The browser goes to Flutterwave, pays, and comes back to `/payment/callback`.
4. `flutterwave-verify` (and `flutterwave-webhook` in the background) asks Flutterwave
   whether the transaction really succeeded, checks the amount and currency, marks the
   payment **successful**, and enrolls the payer in the Academy.
5. The Studio queue shows the payment next to the application, and the application moves
   to **enrolled**.

Nothing is trusted from the browser: the amount comes from the database, and enrollment
only happens after Flutterwave confirms the transaction.

## 1. Database

Apply the programs migration once (see the README for `DATABASE_URL`):

```bash
DATABASE_URL=postgres://... node run-migrations.js 20240101000015_programs_cohorts_applications.sql
```

It creates `program_tiers`, `payments`, `program_cohorts`, `applications` and
`cohort_waitlist`, seeds the six prices, and adds `enroll_from_payment`.

Change a price without a deploy:

```sql
update breadmaker.program_tiers set price_minor = 20000000 where program = 'launchpad' and tier = 'guided';
```

`price_minor` is in minor units: kobo for NGN, cents for USD.

## 2. Edge functions

Three functions, deployed alongside `send-email` (the folder mounted into the
`supabase-edge-functions` container). Run the deploy script **on the Coolify host**:

```bash
./scripts/deploy-functions.sh
```

It finds the edge-functions container and its `functions` mount, copies the three
function folders and `_shared` in, restarts the container and smoke-tests each
function. Pass `CONTAINER=` or `FUNCTIONS_DIR=` if discovery fails.

| Function | Purpose |
| --- | --- |
| `flutterwave-checkout` | Creates the payment row and the checkout link |
| `flutterwave-verify` | Confirms the transaction when the payer returns |
| `flutterwave-webhook` | Confirms it out of band, even if the payer closes the tab |

Environment for the edge-functions container:

```
FLUTTERWAVE_SECRET_KEY=FLWSECK-...          # secret key from the Flutterwave dashboard
FLUTTERWAVE_WEBHOOK_HASH=<a long secret>    # the "secret hash" you set in the dashboard
PUBLIC_SITE_URL=https://breadmakersystems.com
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are already there for the other functions.

## 3. Flutterwave dashboard

- **Webhook URL**: `https://db.restart.ng/functions/v1/flutterwave-webhook`
- **Secret hash**: the same value as `FLUTTERWAVE_WEBHOOK_HASH`. Requests whose
  `verif-hash` header does not match are rejected with 401.
- Start with **test keys** and the test cards from the Flutterwave docs, then swap in the
  live keys and re-run one real payment.

## 4. Website

Set the build variable to show the pay step:

```
VITE_PAYMENTS_ENABLED=true
```

With it unset, the site works exactly as before: the form collects the application and the
team enrolls people by hand from Studio → Learners.

## 5. Billing through Lago (single source of truth)

Restart's Lago (`billing-api.restart.ng`, patched build, see `restart-inc/infra/lago/README.md`) is the
invoice ledger; Flutterwave only takes the money. The Flutterwave dashboard webhook already points at
Lago, so Breadmaker does not use `flutterwave-webhook` when this is on.

Flow: `flutterwave-checkout` records a pending payment, creates the Lago customer (`bm-<hash of email>`)
on the Breadmaker billing entity, raises a one-off invoice for the database price, and returns the
payment link Lago produces. When the invoice is paid Lago calls `lago-breadmaker-webhook`, which re-reads
the invoice, checks amount and currency, and enrolls. The payer's return to `/payment/callback` settles the
same way (the verifier asks Lago), so whichever arrives first wins and the other is a no-op.

One-time setup:

1. **Migration**: apply `20240101000023_payments_lago.sql`.
2. **Lago, billing entity**: create one for Breadmaker Systems and note its code.
3. **Lago, payment provider**: add a second Flutterwave integration (same keys) with code
   `flutterwave-breadmaker` and *Success redirect URL* `https://breadmakersystems.com/payment/callback`.
   The provider's redirect URL is global to it, which is why Breadmaker needs its own.
4. **Lago, webhook**: Developers → Webhooks → add `https://db.restart.ng/functions/v1/lago-breadmaker-webhook`
   (HMAC). Deploy the function with JWT verification off.
5. **Edge env**: `LAGO_API_KEY`, `LAGO_WEBHOOK_HMAC_KEY` (already there for Restart), plus
   `LAGO_BREADMAKER_ENTITY_CODE` and `LAGO_BREADMAKER_PROVIDER_CODE=flutterwave-breadmaker`. Checkout uses
   Lago only when the key and entity code are both set, and falls back to the direct link if Lago errors.
6. **Restart's `lago-webhook`** now ignores customers whose id starts with `bm-`; redeploy it too.

The Business Leak Test still uses the direct Flutterwave link: its return URL carries the result token, which
Lago's single redirect URL cannot.

## Reconciling by hand

`breadmaker.payments` holds every attempt with its `tx_ref`, amount, currency and
Flutterwave ids. If a payer says they paid and the row is still `pending`, open the
transaction in the Flutterwave dashboard and compare the reference; the team can then set
the application to **paid** in Studio → Applications.

Payments are only readable by the team (`is_team_member()`), and the public
`payment_status(tx_ref)` function returns just the status, amount and currency for one
reference.
