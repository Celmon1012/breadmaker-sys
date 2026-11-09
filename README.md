# Breadmaker Systems

The website and learning platform for Breadmaker Systems, a Restart Integrated Systems Ltd. company. It runs two guided build programs and the Breadmaker Academy LMS.

## What is here

- **Homepage** (`/`): routes visitors to the program that fits them.
- **Breadmaker Launchpad** (`/launchpad`): a guided website launch for non-technical owners.
- **Breadmaker Foundry** (`/foundry`): a 30-day build program for technical owner-operators.
- **Apply / book** (`/foundry/apply`, `/launchpad/apply`): the Foundry application and Launchpad start-call booking forms.
- **Breadmaker Academy** (`/courses`, `/dashboard`, `/studio`): the LMS described below.
- **Payment return** (`/payment/callback`): where Flutterwave sends the payer back to.
- **About, Contact, Terms, Privacy**, and a 404 page for anything else.

## Programs, cohorts and payments

Dates, cohort size and places left are data, not copy. The team sets them in
**Studio → Cohorts**, and the program pages, the apply form and the waitlist all read the
same rows (`breadmaker.program_cohorts`). Applications and bookings land in
**Studio → Applications**, where they move from new to enrolled; a successful Flutterwave
payment enrolls the learner automatically.

See [docs/FLUTTERWAVE.md](docs/FLUTTERWAVE.md) for the checkout setup.

## Tech Stack

- React 19 with Vite, Tailwind CSS 4, `motion/react`, `lucide-react`
- Self-hosted Supabase (auth, database, storage) at db.restart.ng, `breadmaker` schema
- Deployed on Coolify with Nixpacks as a static SPA

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm or yarn

### Installation

1. Clone the repository
   ```bash
   git clone https://github.com/Restart-inc/breadmaker-sys.git
   cd breadmaker-sys
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Run the development server
   ```bash
   npm run dev
   ```

## Development

The main entry point is `src/App.tsx`, which maps the first path segment to a page (`/course/<slug>`, `/learn/<slug>/<lesson>`, `/studio/<section>`).

## LMS (Breadmaker Academy)

| Path | Who | What |
| --- | --- | --- |
| `/courses` | Everyone | Catalog of published programs |
| `/course/<slug>` | Everyone | Syllabus by week, free previews, enrollment prompts |
| `/learn/<slug>/<lesson>` | Enrolled learners (previews for all) | Video, notes, the one action and its done-when, progress |
| `/dashboard` | Signed-in learners | Up next, course progress, profile details |
| `/studio` | Team (Owner, Coach, Support) | Overview, applications queue, cohorts and waitlist, course editor, learners and enrollment, team roles |

Code lives in `src/components/lms/` and `src/lib/lms.ts`. Access rules are enforced in the database with row-level security (`supabase/migrations/*_lms.sql`), not in the browser.

### Database

Migrations only touch the `breadmaker` schema of the shared self-hosted Supabase. Apply named files; never re-run the wipe migration:

```bash
DATABASE_URL=postgres://... node run-migrations.js 20240101000011_lock_down_breadmaker.sql 20240101000012_lms.sql 20240101000013_seed_programs.sql 20240101000015_programs_cohorts_applications.sql 20240101000016_catalog_copy.sql
```

Check the access rules against an in-memory Postgres before applying changes:

```bash
npm run test:db
```

Profiles with `role = admin` become studio Owners; add others from Studio → Team.

### Build variables

| Variable | Effect |
| --- | --- |
| `VITE_VSL_URL` | Homepage video. Empty shows the branded placeholder. |
| `VITE_PAYMENTS_ENABLED` | `true` shows the Flutterwave pay step on the apply form. |
| `VITE_CALL_BOOKING_URL` | Booking link (e.g. Cal.com) for the Report + call review call. Empty asks people to reply to the email. |
