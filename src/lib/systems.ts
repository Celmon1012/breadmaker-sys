import { Route } from '../types';

/**
 * The Breadmaker catalog. A breadwinner provides for a family or community;
 * a breadmaker is a tested, proven system they use to do that. Launchpad and
 * Foundry are the first two listed; anything else enters as "testing" and only
 * becomes "live" once it passes VALIDATION_STANDARD.
 */

export type SystemStatus = 'live' | 'testing';

/**
 * A "system" fixes one leak. A "program" is the guided way to build several systems together,
 * with a cohort, a fixed length and a person keeping you moving.
 */
export type CatalogKind = 'system' | 'program';

export type LeakPillar = 'offer' | 'sales' | 'operations' | 'cash' | 'team' | 'tech';

export interface BreadmakerSystem {
  id: string;
  kind: CatalogKind;
  name: string;
  /** What the breadwinner is trying to achieve. */
  goal: string;
  summary: string;
  status: SystemStatus;
  /** Internal route for live systems; testing systems have none. */
  route?: Route;
  ctaLabel?: string;
  /** Shown on the card when the system carries real risk. */
  caution?: string;
  /** The Business Leak Test pillar this system fixes (offer, sales, operations, cash, team or tech). */
  pillar?: LeakPillar;
  /** Programs only: the ids of the systems this program builds with you. */
  includes?: string[];
}

export const SYSTEMS: BreadmakerSystem[] = [
  {
    id: 'launchpad',
    kind: 'program',
    includes: ['offer-and-pricing-sheet', 'lead-capture-and-follow-up', 'invoicing-and-cash-tracker'],
    name: 'Breadmaker Launchpad',
    goal: 'Get paid online without becoming technical',
    summary: 'A guided 7-day launch of a working page that takes enquiries, bookings or payments.',
    status: 'live',
    route: 'launchpad',
    ctaLabel: 'See Launchpad',
  },
  {
    id: 'foundry',
    kind: 'program',
    includes: ['delivery-checklist-and-tracker', 'invoicing-and-cash-tracker', 'delegation-pack', 'automation-and-data-safety'],
    name: 'Breadmaker Foundry',
    goal: 'Own the systems your business runs on',
    summary: 'A 30-day build of a live system with payments, automation and one AI agent, on your own server and code.',
    status: 'live',
    route: 'foundry',
    ctaLabel: 'See Foundry',
  },
  {
    id: 'offer-and-pricing-sheet',
    kind: 'system',
    pillar: 'offer',
    name: 'Offer and pricing sheet',
    goal: 'Say what you sell, to whom and for how much, in one sentence',
    summary:
      'A one-page offer, a priced menu built from your real costs, and rules for which customers to take on.',
    status: 'testing',
  },
  {
    id: 'lead-capture-and-follow-up',
    kind: 'system',
    pillar: 'sales',
    name: 'Lead capture and follow-up',
    goal: 'Never lose an enquiry to a slow reply',
    summary:
      'One place where every enquiry lands, a first reply sent for you and follow-ups scheduled until the lead answers.',
    status: 'testing',
  },
  {
    id: 'delivery-checklist-and-tracker',
    kind: 'system',
    pillar: 'operations',
    name: 'Delivery checklist and tracker',
    goal: 'Run delivery from a written process, not from memory',
    summary:
      'Your core job written as a checklist, with one tracker for orders and tasks so quality does not depend on who does it.',
    status: 'testing',
  },
  {
    id: 'invoicing-and-cash-tracker',
    kind: 'system',
    pillar: 'cash',
    name: 'Invoicing and cash tracker',
    goal: 'Know your profit and get paid on time',
    summary:
      'Invoices sent the day the work is done, automatic payment reminders and a weekly view of money in, money out and money owed.',
    status: 'testing',
  },
  {
    id: 'delegation-pack',
    kind: 'system',
    pillar: 'team',
    name: 'Delegation pack',
    goal: 'Hand work off without it coming back to you',
    summary:
      'Role sheets, decision rules and an onboarding pack, so a new person can take over a whole function.',
    status: 'testing',
  },
  {
    id: 'automation-and-data-safety',
    kind: 'system',
    pillar: 'tech',
    name: 'Automation and data safety',
    goal: 'Automate the repeat work and protect customer data',
    summary:
      'The tasks you repeat most set to run themselves, with customer records in one backed-up place and consent recorded.',
    status: 'testing',
  },
];

export const PROGRAMS = SYSTEMS.filter((item) => item.kind === 'program');
export const SINGLE_SYSTEMS = SYSTEMS.filter((item) => item.kind === 'system');

/** A course is a kit when its slug is a system id (kit courses use the system id as their slug). */
export const isKitSlug = (slug: string) => SINGLE_SYSTEMS.some((item) => item.id === slug);

/** Launchpad and Foundry are builds, not courses: their pages live under /build. */
export const BUILD_SLUGS = ['foundry', 'launchpad'];
export const isBuildSlug = (slug: string) => BUILD_SLUGS.includes(slug);

/** The page for a course, kit or build: /build/foundry, /build/launchpad, or /course/<slug>. */
export const coursePath = (slug: string) => (isBuildSlug(slug) ? `/build/${slug}` : `/course/${slug}`);

export const findSystem = (id: string) => SYSTEMS.find((item) => item.id === id);

/** The system that fixes a Business Leak Test pillar. */
export const systemForPillar = (pillar: string) => SINGLE_SYSTEMS.find((item) => item.pillar === pillar);

/** The first program (in catalog order) that builds this system with you. */
export const programForSystem = (systemId: string) => PROGRAMS.find((item) => item.includes?.includes(systemId));

/** Programs that include this system. */
export const programsIncluding = (systemId: string) => PROGRAMS.filter((item) => item.includes?.includes(systemId));

export const VALIDATION_STANDARD = [
  {
    title: 'We run it first',
    body: 'Someone on our team builds and operates the system for real, with their own time and money, before anyone is taught it.',
  },
  {
    title: 'The outcome is stated up front',
    body: 'Every system names one specific goal and what "working" means, in plain terms you can check.',
  },
  {
    title: 'A record is kept',
    body: 'What was set up, what happened and what went wrong is written down. A system with no record is not listed as live.',
  },
  {
    title: 'Risk is named, never hidden',
    body: 'Where a system can lose money or break, we say so on the page. We do not promise earnings.',
  },
];

export const ACADEMY_INCLUDES = [
  {
    title: 'Weekly setups',
    body: 'One working setup a week, step by step, each with a clear definition of done. You finish the week with something running, not something bookmarked.',
  },
  {
    title: 'Exclusive systems',
    body: 'Every system that passes our validation standard is taught here first, with the full build, not a summary.',
  },
  {
    title: 'Systems in testing',
    body: 'Follow the record of systems we are still running ourselves, including what failed, before they are listed as live.',
  },
  {
    title: 'Education',
    body: 'The sessions, actions and downloads behind every system, in one place, in the order to do them.',
  },
  {
    title: 'A person keeping you moving',
    body: 'A midweek check-in and a Friday review, so a blocker gets an answer the same day.',
  },
];

export const ACADEMY_FAQ = [
  {
    question: 'Who can open the sessions?',
    answer:
      'Enrolled learners open every session in their program. Anyone can watch the free previews. Pricing is shown on each program.',
  },
  {
    question: 'Will these systems make me money?',
    answer:
      'We promise a working system, not a result. Where a system carries risk, the risks are on its page and nothing we teach is financial advice.',
  },
];
