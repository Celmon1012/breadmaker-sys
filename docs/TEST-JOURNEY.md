# Test journey: one customer, start to finish

Run this once with test accounts before taking a cohort. Each step says what to do, what should happen, and where to look if it does not. Write every failure in the table at the bottom, with the step number. A short list of real defects is the point.

**Before you start**

- Run `supabase/snippets/check-applied-migrations.sql`. Every row must be `true`.
- Use two email addresses you control: a **customer** (not on the team) and your **team** account.
- Use a private window for the customer, so a team session does not hide a permission problem.
- Payments: use Flutterwave **test** keys and a test card, or a real small payment you refund afterwards. Do not run this against live keys with a real customer's card.
- Note the time at the start. Anything that should be quick and is not (an email, a redeploy) is also a finding.

## A. Leak Test

| # | Do | Should happen | If not, look at |
|---|---|---|---|
| 1 | Open `/leak-test`, press Start, finish all 30 questions as the customer | Result page with a score, band and archetype | Browser console; `leak_test_submissions` |
| 2 | Studio → Overview → Launch metrics | Leak Test **Started** and **Completed** each went up by 1 | Migration 55; `site_events` |
| 3 | Check the customer's inbox | Result email with a link that reopens the result | `leak-test-notify` function logs; Resend key |
| 4 | Buy the full report | Checkout opens, payment completes, the page returns to the report | `leak-test-checkout`, `flutterwave-webhook`, `payments-reconcile`; Studio → Payments |
| 5 | Open the report | Full report visible; before paying it must not be | `get_leak_test_report` (the paywall is in the database) |
| 6 | Launch metrics | **Report bought** went up by 1 | `payments` row with `program = 'leaktest'` |

## B. Applications

| # | Do | Should happen | If not, look at |
|---|---|---|---|
| 7 | Open `/foundry/apply` as the customer and send the four steps | Confirmation screen | `submit_application`; console |
| 8 | Open `/launchpad/apply` and send it | Confirmation screen, then the funnel brief flow | `launchpad-start`, `build-brief` |
| 9 | Studio → Applications (Foundry and Launchpad tabs) | Both applications listed, status New | Row-level policies, migration 52 |
| 10 | Launch metrics | **Form opened** and **Applications** went up for both programs | Migration 55 |
| 11 | CRM (crm.restart.ng) | Both contacts appear within a few minutes | `crm_outbox` (unsent rows), `crm-sync` logs; `docs/CRM-SYNC.md` |

## C. Payment and enrolment

| # | Do | Should happen | If not, look at |
|---|---|---|---|
| 12 | As team, move the Foundry application to accepted, then pay as the customer | Payment succeeds, returns to the site | `flutterwave-checkout`, `flutterwave-verify` |
| 13 | Studio → Payments | One row, status successful, matched to the application | `payments-reconcile` (cron), Flutterwave dashboard |
| 14 | Customer signs up or signs in with the same email | Foundry appears on the dashboard without anyone enrolling them by hand (check whether its four kits come with it) | `enroll_from_payment`; Studio → Learners |
| 15 | Launch metrics | **Paid enrolments** went up by 1 | `payments` rows for that program |

## D. Learning

| # | Do | Should happen | If not, look at |
|---|---|---|---|
| 16 | Open a course and a lesson as the customer | Lesson content loads; a locked lesson stays locked for a second, unenrolled account | `has_course_access`, migrations 28 and 38 |
| 17 | Press Stuck? and ask a real question about the lesson | A sensible answer within a few seconds | `tutor-chat` function logs; `ANTHROPIC_API_KEY`; migration 40 |
| 18 | Submit evidence on a session | Status shows in review | `submit_evidence`; migration 42 |
| 19 | As team, Studio → Reviews: return it with a note, then pass it after resubmission | Customer sees the note, then the pass; mastery counts it | `review_submission` |

## E. Funnel

| # | Do | Should happen | If not, look at |
|---|---|---|---|
| 20 | Customer opens `/funnel` and finishes the brief | A funnel is built and has an address | `build-brief`, `build-deploy`; Coolify |
| 21 | Open the funnel address in a private window and send an enquiry | Thank-you state; row in `funnel_leads` | `funnel-lead` |
| 22 | Check delivery | Enquiry reaches Kumoda, or arrives by email as the fallback, once | `funnel_leads.status`, `funnel-lead` logs |
| 23 | Break delivery on purpose (wrong Kumoda address), send another enquiry, then fix it | Row stays pending, then delivers on retry, never twice | `next_attempt_at`; the `funnel-lead-drain` cron job |
| 24 | Change the funnel address on `/funnel` | Redeploy runs, the new address works, the old one stops | Coolify deployment list; `deploy-restart` |
| 25 | Customer opens `/funnel` and `/agents`: only their own funnel, enquiries and agents show | No other member's data anywhere | Migration 52 and the owner-read policies |

## F. Privacy check

| # | Do | Should happen |
|---|---|---|
| 26 | As the customer, open `/studio` | "The studio is for the Breadmaker team" |
| 27 | As an unenrolled second account, try the customer's lesson and report links | Locked or not found |

## Defects found

| Step | What happened | Expected | Severity (blocks launch / fix soon / minor) | Owner |
|---|---|---|---|---|
|  |  |  |  |  |

## When it is done

- Delete the test account's data, or mark it clearly, so it does not skew the launch metrics.
- Refund any real test payment.
- Re-run the metrics panel: every number you added should be explained by a step above.
