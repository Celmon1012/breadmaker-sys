/**
 * The promises and settings the program pages quote in copy.
 *
 * Anything that changes per run (start dates, cohort size, places left) lives
 * in the database and comes from breadmaker.program_cohorts through
 * src/lib/programs.ts. What is left here is the fixed service level, so it is
 * changed in one place instead of in six components.
 */

/** How long we promise to take to read an application and come back. */
export const APPLICATION_REVIEW = '2 working days';

/** How long we promise to take to answer a message or a question. */
export const REPLY_TIME = '1 business day';

/** Where the homepage video lives. Set VITE_VSL_URL at build time to switch it on. */
export const VSL_URL = ((import.meta.env.VITE_VSL_URL as string | undefined) ?? '').trim();

/**
 * The booking page for the Report + call review call (for example a Cal.com link). Set
 * VITE_CALL_BOOKING_URL at build time. Without it the report asks people to reply to the email.
 */
export const CALL_BOOKING_URL = ((import.meta.env.VITE_CALL_BOOKING_URL as string | undefined) ?? '').trim();

export const VSL_TITLE = 'How Breadmaker works';

/**
 * The video beside each program's hero. Set VITE_LAUNCHPAD_VIDEO_URL / VITE_FOUNDRY_VIDEO_URL at build time
 * (YouTube, Vimeo, Loom or a direct video file). Until they are set, a placeholder video (Big Buck Bunny, a
 * public sample film) fills the slot. Set both variables to replace it.
 */
const PLACEHOLDER_VIDEO_URL = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';
export const LAUNCHPAD_VIDEO_URL = ((import.meta.env.VITE_LAUNCHPAD_VIDEO_URL as string | undefined) ?? '').trim() || PLACEHOLDER_VIDEO_URL;
export const FOUNDRY_VIDEO_URL = ((import.meta.env.VITE_FOUNDRY_VIDEO_URL as string | undefined) ?? '').trim() || PLACEHOLDER_VIDEO_URL;

/** The two programs, in the order the site talks about them. */
export const PROGRAMS = ['launchpad', 'foundry'] as const;
export type ProgramKey = (typeof PROGRAMS)[number];

export const PROGRAM_NAME: Record<ProgramKey, string> = {
  launchpad: 'Breadmaker Launchpad',
  foundry: 'Breadmaker Foundry',
};

/** The support levels a tier string can hold, in the order they are sold. */
export const TIERS = ['self-paced', 'guided', 'done-with-you'] as const;
export type TierKey = (typeof TIERS)[number];

export const TIER_LABEL: Record<string, string> = {
  'self-paced': 'Self-paced',
  guided: 'Guided',
  'done-with-you': 'Done-with-you',
};

export const APPLICATION_STATUSES = ['new', 'reviewed', 'accepted', 'invoiced', 'paid', 'enrolled', 'declined'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  new: 'New',
  reviewed: 'Reviewed',
  accepted: 'Accepted',
  invoiced: 'Invoiced',
  paid: 'Paid',
  enrolled: 'Enrolled',
  declined: 'Declined',
};

/** Formats a database date (YYYY-MM-DD) without shifting it through a timezone. */
export function formatProgramDate(value: string | null): string | null {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** "Cohort of 6", "6 places left", "2 places left" — or nothing when capacity is open. */
export function placesLabel(remaining: number | null, capacity: number | null): string | null {
  if (remaining === null) return capacity ? `Cohort of ${capacity}` : null;
  if (remaining <= 0) return 'Full';
  return `${remaining} ${remaining === 1 ? 'place' : 'places'} left`;
}

export function cohortSizeLabel(capacity: number | null): string | null {
  return capacity ? `Cohort of ${capacity}` : null;
}
