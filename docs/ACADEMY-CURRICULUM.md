# Breadmaker Academy — curriculum summary

The 26 sessions that are live in the Academy today, taken from `supabase/migrations/20240101000013_seed_programs.sql` and cross-checked against the live database.

| Course | Modules | Sessions | Free preview | Live session types |
| --- | --- | --- | --- | --- |
| Breadmaker Foundry | 4 | 20 | Kickoff | live, working |
| Breadmaker Launchpad | 3 | 6 | Day 1: Start call | live, working |

**Session types**: `live` = a coached call, `working` = a build session you do yourself, `lesson` = a short read. Every session ends with one action and a done-when line, and each week carries a checklist that maps to the Day-30 scorecard.

---

## Breadmaker Foundry

30 days, four weeks, 20 sessions, one free preview (Kickoff). NGN 150,000 as a self-paced course.

### Week 1: Frontend

By Friday you have a live page on your own domain that explains one offer clearly and captures a real lead into your own database. This week teaches the ship loop the rest of the program depends on: describe a change to Claude Code, review it, push to staging, then promote to production.

| # | Session | Type | Min | Preview | The one action | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Kickoff | live | 90 | yes | Point your domain at your server through Cloudflare, write down your day-0 goal and number, and start your payment-provider application. | Your domain points at your server, your goal is written down, and your payment-provider application is started, since approval can take days. |
| 2 | Your offer | live | 45 |  | Write your offer on one page and save it in your repository. | Your offer is saved in the repository as one page, and three strangers have read it. |
| 3 | Build the page | working | 60 |  | Ship the first version of your landing page to staging. | A staging page that reads clearly on a phone. |
| 4 | Capture and track | working | 60 |  | Submit a test lead through your form. | The test lead lands in your database and reaches your inbox, and both events show in analytics. |
| 5 | Launch and review | live | 60 |  | Promote your page to production and write your week 2 plan. | Your page is live on your own domain and you have a week 2 plan of three actions. |

**Week checklist**

- The site loads over HTTPS on your own domain (scorecard 1)
- Three strangers can say what is sold and to whom within 5 seconds (scorecard 2)
- The main page and the form work on a phone (scorecard 3)
- A form submission creates a row in the leads table and notifies you
- A page visit and a lead event both appear in analytics (scorecard 4)
- At least one change went from staging to production, and you did it yourself
- Your week 2 plan is written with your coach

### Week 2: Backend

By Friday your data is structured and secured, a payment completes and lands in your own database, and you can see your leads, customers and payments in one protected view.

| # | Session | Type | Min | Preview | The one action | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Data model | live | 75 |  | Create the tables for leads, customers and payments on staging. | The three tables exist on staging with sensible fields. |
| 2 | Security | live | 45 |  | Turn on row-level security for every table and run the logged-out test. | A passing logged-out test and a working admin login. |
| 3 | Payments | working | 75 |  | Complete one test payment end to end. | A test payment is recorded as paid in your database by the webhook. |
| 4 | Admin view | working | 60 |  | Build your login-protected admin view. | A view you can open and read at a glance. |
| 5 | Review and promote | live | 60 |  | Promote the backend to production and write your week 3 plan. | The backend is live and you have a week 3 plan of three actions. |

**Week checklist**

- The tables for leads, customers and payments exist with sensible fields (scorecard 5)
- A logged-out request cannot read another user's data (scorecard 6)
- A real or test payment completes and is recorded as paid by a server check, not only by the browser returning (scorecard 7)
- You can log in and see leads, customers and payments in one place (scorecard 8)
- Secrets sit outside the repository and no live keys are committed
- Your week 3 plan is written with your coach

### Week 3: Automation

By Friday a new lead moves through your pipeline with no manual step, you hear about it within minutes, failures raise an alert, and one AI agent is doing a real task with you approving its output.

| # | Session | Type | Min | Preview | The one action | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Journey and trigger | live | 75 |  | Map your lead journey on one page and wire the trigger. | A trigger that fires and a confirmation that sends. |
| 2 | Follow-up | working | 60 |  | Automate the follow-up for a new lead. | A follow-up that sends once, on time, and stops when it should. |
| 3 | Notify and alert | working | 60 |  | Set up owner notifications and failure alerts. | An alert arrives when something fails. |
| 4 | AI agent | live | 75 |  | Build one AI agent on one real task, with your approval before anything is sent. | An agent that completes one task with human approval. |
| 5 | Review and promote | live | 60 |  | Promote the automation to production and write your week 4 plan. | Automation is live and you have a week 4 plan of three actions. |

**Week checklist**

- A new lead triggers a confirmation and a follow-up with no manual step (scorecard 9)
- You are notified of a new lead or booking within minutes (scorecard 10)
- One AI agent completes a useful task on real input, with a log of what it received and produced (scorecard 11)
- A failed job or form error sends you an alert (scorecard 12)
- Follow-up messages send from a verified domain and reach the inbox, not spam
- Your week 4 plan is written with your coach

### Week 4: Launch and operate

By Friday the whole system has been tested end to end, you have shown you can roll back a bad change and restore a backup, security is checked, the runbook is written, and your Day-30 scorecard passes.

| # | Session | Type | Min | Preview | The one action | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Full test | live | 90 |  | Test the whole journey end to end and fix the biggest problems. | A ranked fix list with the top three fixed. |
| 2 | Rollback and restore | live | 75 |  | Roll back a bad change and restore a backup to a test copy. | A rollback log and a restore log. |
| 3 | Monitor and secure | working | 60 |  | Turn on monitoring and finish the security checklist. | Monitoring is on and the security checklist is signed. |
| 4 | Go live and write it down | working | 75 |  | Go live, write your runbook and record your 30-day number. | A live system, a runbook and a result sheet. |
| 5 | Day-30 review | live | 60 |  | Walk the scorecard and choose what happens to your server. | A signed scorecard and a server decision. |

**Week checklist**

- At least 3 changes went from staging to production using the edit, stage, push loop (scorecard 13)
- You rolled back a bad change once (scorecard 14)
- A backup was restored to a test copy (scorecard 15)
- Uptime checks and an alert channel are set up (scorecard 16)
- 2FA is on GitHub, Cloudflare and the console, no secrets are in the repository, and the guardrails are still on (scorecard 17)
- A one-page runbook explains how to deploy, roll back, restore and get help (scorecard 18)
- You have chosen continue, move, or export for the server (scorecard 19)
- The day-0 target and the actual result are both written down (scorecard 20)

## Breadmaker Launchpad

7 days, three modules, 6 sessions, one free preview (Day 1). NGN 35,000 as a self-paced course.

### Days 1-2: Plan

Choose your one goal and write an offer a visitor understands at a glance.

| # | Session | Type | Min | Preview | The one action | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Day 1: Start call | live | 30 | yes | Choose your one goal for the week. | You leave the call with the plan for the week. |
| 2 | Day 2: Your offer | working | 60 |  | Approve your written offer. | Your offer is written on one page and you are happy with it. |

**Checklist**

- You know your one goal for the week
- Your offer is written: who it is for, the problem, what you deliver, the price and the one action

### Days 3-4: Build

We build your page with you on a proven template, and you tell us what to change.

| # | Session | Type | Min | Preview | The one action | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Days 3-4: Build | working | 90 |  | Review your page and send your changes. | Your page reads clearly on a phone and your changes are in. |

**Checklist**

- Your page is built and works on a phone
- You have reviewed it and your changes are in

### Days 5-7: Launch

Connect the ways to take action, test everything, and go live on your own domain.

| # | Session | Type | Min | Preview | The one action | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Day 5: Connect | working | 60 |  | Send yourself a test enquiry. | The enquiry arrives and the automatic reply reaches you. |
| 2 | Day 6: Test | working | 60 |  | Run a test enquiry and a test payment. | Both tests pass on a phone and a computer. |
| 3 | Day 7: Launch | live | 45 |  | Make one simple change to your live page yourself. | Your page is live on your domain and you have made a change on your own. |

**Checklist**

- A way to take enquiries, bookings or payments works
- An automatic reply goes out the moment someone signs up
- Tracking shows your visits and enquiries
- Your page is live on your own domain

---

## Coverage

| | Foundry | Launchpad |
| --- | --- | --- |
| Sessions with a written body | 20 of 20 | 6 of 6 |
| Sessions with a video | 0 of 20 | 0 of 6 |
| Free previews | 1 | 1 |
| Coached live sessions | 12 | 2 |
| Build sessions | 8 | 4 |
| Scheduled contact time | 22 h 00 m | 5 h 45 m |
