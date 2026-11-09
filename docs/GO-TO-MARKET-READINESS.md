# Go-to-market readiness

**Date:** 27 October 2026
**Covers:** everything built since the 7 October status review (`docs/STATUS-REVIEW-2026-10-07.md`), what must be true before you sell, and what to do in what order.
**How to read it:** items marked **Confirm** are things I could not check from here (the production database, Coolify settings, edge-function secrets). Everything else was checked in the repo, in the test suite or on the live site today.

---

## 1. The verdict

**You can soft-launch now, by application, to people you can personally follow up. You are not ready to pay for traffic.**

The product is built and coherent. What stands between you and the first paying customer is mostly switches and proof, not code:

1. Four database updates and two function deploys may not be applied yet (section 3).
2. The six kits are on sale, but their proof records are blank (section 5).
3. Nothing measures who visits or buys (section 6).
4. Several public promises need a named person behind them (section 4).

Fix the **Must do** list in section 3 and you can start selling Launchpad, Foundry and Prestige to a first group. Scale comes after you have run one cohort.

---

## 2. What now exists

| Area | What it is | State |
| --- | --- | --- |
| **Front door** | Home, About, Guides, Tools, Systems, free Business Leak Test (30 questions, score, paid report), lead capture and newsletter consent | Live. Lead tables exist (migrations 36, 37) |
| **Programs** | Launchpad (₦35,000, 6 sessions) and Foundry (₦150,000, 20 sessions), cohorts, applications, Studio queue | Live. **Confirm** the next cohort dates (the 7 Oct review showed a 26 Oct start) |
| **Kits** | Six kits, one per leak, 5 sessions each, bundled free into the programs | Live on sale. Lessons now have real content (migration 41, **apply it**). Records still blank (section 5) |
| **Membership** | `/membership`: Community ($97 one-time, waitlist) and Prestige ($300 a month, 5 seats, by application) | Live. Community says "opens soon" |
| **Payments** | Flutterwave and Lago, naira and dollars, reconcile job, payment status in Studio | Live. **Confirm** one real end-to-end payment has been run |
| **Learning** | Course pages, lesson player, progress, dashboard, profile photos, support tickets | Live |
| **Lesson coach** | "Stuck?" panel, answers from the open session, hands off to a coach as a ticket | Deployed 27 Oct. Needs migration 40 and the function. Not yet tried with a real question |
| **Evidence and mastery** | Learners send a note, links or screenshots for an action. A coach passes it or sends it back. Dashboard shows "passed by your coach" | **Built today, not deployed.** Needs migration 42 and a push |
| **Studio** | Courses, learners, cohorts, applications, payments, Prestige, support, **Reviews** (new), team | Live except Reviews |
| **Chat agent** | WhatsApp agent design (Kumoda + n8n + Claude), tools and prices function | Built in code. Waits on n8n and the connector, so it is not part of launch |
| **Tests** | 219 database assertions, all passing; TypeScript clean; production build passes | Green |

---

## 3. Before you sell: the list

### Must do (blocks the first sale)

| # | Action | Who | Time |
| --- | --- | --- | --- |
| 1 | **Apply the pending migrations.** Run `supabase/snippets/check-applied-migrations.sql` in the SQL editor. It shows which of 26 to 42 are missing. Apply every missing one, in order. Then regenerate nothing: the files are ready | You | 30 min |
| 2 | **Push and deploy the evidence work.** Commit and push this branch, let Coolify build | Me, then you confirm | 15 min |
| 3 | **Install the edge functions and restart the container.** Paste `scripts/install-edge-functions.sh`. It carries `tutor-chat` | You | 15 min |
| 4 | **Confirm the function secrets** in the edge-functions container: `ANTHROPIC_API_KEY`, `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_WEBHOOK_HASH`, `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Missing keys break the AI report, checkout and the coach | You | 15 min |
| 5 | **Run one real payment** at the smallest price, then check the learner is enrolled, the receipt arrives and Studio → Payments shows it. Do the same for a dollar price if you sell in dollars | You | 30 min |
| 6 | **Walk the whole learner path yourself on a test account:** sign up, apply, get enrolled, open a lesson, ask the coach a real question, send evidence, then pass it in Studio → Reviews | You, with me fixing what breaks | 1 hour |
| 7 | **Decide the kit question** (section 5) and make the page match the decision | You | 1 hour |
| 8 | **Name who answers support and reviews evidence, and by when** (section 4) | You | 15 min |

### Should do (week one)

| # | Action | Why |
| --- | --- | --- |
| 9 | Add analytics: page views and the steps visit, Leak Test start, Leak Test finish, payment. Nothing is installed today | You cannot improve what you cannot see |
| 10 | Add `robots.txt`, a sitemap and a share image. On the live site `/robots.txt` and `/sitemap.xml` return the app page, and there is no `og:image` | Search engines and link previews need them |
| 11 | Set `VITE_VSL_URL` and `VITE_CALL_BOOKING_URL`, or remove those blocks. The 7 Oct review found both unset. **Confirm** | Avoids "Video coming soon" on the home page |
| 12 | Add CI that runs `npm run lint` and `npm run test:db` on every push. There is no `.github` folder | One mistyped push has no guardrail today |
| 13 | Check the database is backed up and that you have restored a backup once | Learner data and payments live there |
| 14 | Publish the launch posts in `docs/LAUNCH-POSTS.md` | Written, unpublished distribution |

### Later

Record the sessions in video (the Academy is text-only), enrol a first cohort of five or six, build automatic checks for evidence (testing a live link), and the sponsor digest for Prestige seats.

---

## 4. Promises and what backs each one

The site makes these promises. Each needs a person and a routine, or it becomes a refund.

| Public promise | What must back it | Gap today |
| --- | --- | --- |
| "Support that answers within 1 business day" | Someone checks Studio → Support daily | Unassigned. Tickets from the coach hand-off land here too |
| "Midweek nudge" and "Friday review" | A routine, ideally a reminder or message per cohort | Described, not automated |
| "We stay with you until it is live" | Capacity per cohort, a cap on seats | Launchpad shows places left. Foundry has no cap shown |
| Prestige: "99.5% uptime, credit if missed" | Monitoring, a way to measure uptime, a credit process | Monitoring not confirmed |
| Prestige: "$20 of usage a month, warned at 80%" | The gateway reports spend | Built (migration 34). **Confirm** the gateway is live |
| Prestige: "5 seats", "we approve each by hand" | Application review | Built. Someone must read applications |
| Evidence: "your coach checks it" | Someone clears Studio → Reviews, with a target time | New. Pick one, for example two working days |

If you cannot staff one of these yet, soften the sentence before launch rather than after the first complaint.

---

## 5. The honesty line: kits and records

Your whole position is "we run each system ourselves first and keep the record." The six kits are on sale, and `docs/kit-records/` holds six pages that are still blank templates ("Draft, not publishable"). The home page already says kits are "available as kits while we write up the record" and "marked as such". So the copy is honest about the gap, and that is the right way to run it.

Keep it that way:

- Do not remove that wording until a record is filled with things you can show.
- Fill a kit's record only from a real run, yours or a client's. Do not let anyone, me included, draft it from the template.
- The lessons I wrote on 27 October are teaching text. They contain no results and no earnings claims. Read them before you tell anyone they are your tested method.
- If you cannot fill a record within a month, unpublish that kit's price and keep it free inside the programs.

---

## 6. Marketing and measurement

| Item | State |
| --- | --- |
| Lead capture, Leak Test, newsletter consent and unsubscribe | Built |
| Analytics | **None installed** |
| `robots.txt`, sitemap, share image | **Missing** |
| Home video and call booking | **Confirm** |
| Launch posts | Written, unpublished |
| Legal | Terms and Privacy exist and mention the NDPA. Have a lawyer read the refund wording in the enrolment terms before you sell |

Five numbers to watch from day one: Leak Test starts, Leak Test finishes, report purchases, applications, and paid enrolments. Everything else is detail.

---

## 7. Operations once people are inside

- **Reviews:** Studio → Reviews lists evidence waiting. A coach passes it or sends it back with one clear fix. Agree a response time and put it on the learner's screen if you want.
- **Coach questions:** the lesson coach answers from the lesson and hands off to a person when it should. It does not pass work.
- **Limits:** the coach allows 12 questions an hour and 40 a day per learner. Change them with `TUTOR_HOURLY_LIMIT` and `TUTOR_DAILY_LIMIT`.
- **Privacy:** learners can delete their coach history from the panel. Evidence files sit in a private store and open only for the learner and the team. Tell people this on the Privacy page before the first cohort.

---

## 8. Suggested order

1. **Today:** apply migrations 40 to 42, install the functions, confirm the secrets, run the test-account walk-through.
2. **This week:** one real payment, the kit decision, name the support and review owners, add analytics and the SEO files.
3. **Soft launch:** invite 5 to 10 people you know to the Leak Test and Launchpad. Watch the five numbers.
4. **After the first cohort:** record the sessions, fix what the learners got stuck on, then decide whether to pay for traffic.
