# Breadmaker positioning

## The idea

A **breadwinner** is the person a family or community leans on to provide. A **breadmaker** is a
tested, proven system they use to do it.

Breadmaker is therefore not a web-building or funnel company. It lists **any system that has been
validated to do one specific job** for a provider. Websites and funnels (Launchpad, Foundry) are
the first shelf, not the whole store.

## What we sell

A *system*: a repeatable setup with a stated outcome, a written record, and named risks. A
program (Launchpad, Foundry) is how we teach a system, not the product itself.

## The validation standard

A system is listed **live** only when all four hold (also in `src/lib/systems.ts`):

1. **We run it ourselves first**, for real, before anyone is taught it.
2. **The outcome is stated up front**, with a plain definition of "working".
3. **The record is kept**: what was set up, what happened, what went wrong.
4. **Risk is named, never hidden.** We never promise earnings.

Until then it is listed as **testing**, with no performance claims.

## Honesty line

Existing copy: "We commit to a working system, not a sales number." We never promise earnings, and
where a system carries risk, the risk is named on its page.

## Catalog (first version)

| System | Goal | Status |
| --- | --- | --- |
| Launchpad | Get paid online without becoming technical | Live |
| Foundry | Own the systems your business runs on | Live |
| Offer and pricing sheet | Fixes the Offer leak | Testing |
| Lead capture and follow-up | Fixes the Sales leak | Testing |
| Delivery checklist and tracker | Fixes the Operations leak | Testing |
| Invoicing and cash tracker | Fixes the Cash leak | Testing |
| Delegation pack | Fixes the Team leak | Testing |
| Automation and data safety | Fixes the Tech leak | Testing |

The six testing systems map one-to-one to the Business Leak Test pillars, so whatever a person's
biggest leak is, there is a system to point them to.

## Where this lives in the code

- `src/lib/systems.ts`: catalog and validation standard (edit here to add a system)
- `src/components/SystemsPage.tsx`: the `/systems` page
- Home, About, header, footer and `index.html` meta carry the new framing

## Not done yet

- Academy catalog (`/courses`) still reads as program-based; add a systems layer once a second
  live system exists.
- Launchpad and Foundry landing pages still describe themselves as programs for build-your-site
  audiences. That is accurate for them, but they could link back to `/systems`.
- Contact form has no "suggest a system" field; the Systems page link goes to the general contact page.

## Systems and programs

The catalog has two kinds of entry (`kind` in `src/lib/systems.ts`):

- **System**: fixes one Business Leak Test pillar (offer, sales, operations, cash, team or tech).
- **Program**: the guided way to build several systems together, with a cohort and a fixed length
  (`includes` lists the system ids). Launchpad and Foundry are programs.

`systemForPillar()` and `programForSystem()` drive the recommendation shown on the Leak Test result and
inside the paid report: the system for the person's biggest leak, then the program that builds it.
Systems still in testing show "Tell me when it is ready"; the counts (migration 21, `system_interest`) are
in Studio → Leak Test and say which system to build and record first. After editing the catalog run
`npm run sync:questions`, so the report writer sees the same offers.

## Kits (migration 22)

The system product is a **kit**: the Academy course for one system, with sessions, a checklist and a
definition of done. The program product is the built-with-you version, and **enrolling in a program
also enrolls the learner in its kits** (a trigger on `lms_enrollments`, driven by
`program_kit_bundles`). Templates are not a product of their own: attach them to a kit as downloads
(Studio → Courses → tools).

How a kit goes live:

1. Migration 22 seeds six kit courses as **drafts**, linked to their system by `kit_system_id`, one
   session per step of the pillar's 30-day plan plus a "definition of done". There is no price.
2. In **Studio → Courses**, open a kit, improve the sessions (add video, downloads), set the price
   and publish it.
3. From then on `kit_offers()` returns it: the Systems page, the Leak Test result and the report show
   "Get the kit" with the price instead of "Tell me when it is ready", and the course page has a Buy
   button for signed-in learners (a Flutterwave payment through `flutterwave-checkout` with
   `program: "kit"`, which enrolls the buyer when it settles).

Prices are not set anywhere in code. Build and record the system first (the validation standard), then
publish its kit.

**Kits on sale before their record exists (7 Oct 2026).** All six kits are published and priced. Until a
kit's record in `docs/kit-records/` is filled in with things you can show, the site labels it "Kit · record
in progress" (`SystemsPage.tsx`) and the homepage says so. When a record is done, set that system's
`status` to `'live'` in `src/lib/systems.ts` and update the copy. If a kit cannot be written up honestly,
set it back to Draft in Studio → Courses.
