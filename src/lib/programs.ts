import { supabase } from './supabase';
import { ProgramKey } from './program-config';
import { reportTouch } from './attribution';

/**
 * Data access for the program side of Breadmaker: cohorts, applications,
 * waitlists and payments (breadmaker.program_cohorts and friends).
 *
 * The public pages read aggregates through RPCs and never touch the tables;
 * the Studio uses the team RPCs. Access rules live in the database, in
 * supabase/migrations/20240101000015_programs_cohorts_applications.sql.
 */

export interface ProgramStatus {
  program: ProgramKey;
  openCohorts: number;
  waitlistCount: number;
  cohortId: string | null;
  label: string;
  startsOn: string | null;
  endsOn: string | null;
  capacity: number | null;
  taken: number;
  remaining: number | null;
  accepting: boolean;
}

export interface OpenCohort {
  id: string;
  label: string;
  startsOn: string | null;
  capacity: number | null;
  remaining: number | null;
}

export interface ApplicationInput {
  program: ProgramKey | 'general';
  tier?: string;
  cohortId?: string | null;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  answers?: Record<string, string>;
}

export interface ApplicationRow {
  id: string;
  program: string;
  tier: string;
  cohortId: string | null;
  cohortLabel: string;
  startsOn: string | null;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  answers: Record<string, string>;
  status: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface CohortRow {
  id: string;
  program: string;
  label: string;
  startsOn: string | null;
  endsOn: string | null;
  capacity: number | null;
  taken: number;
  remaining: number | null;
  waitlist: number;
  status: string;
  timezone: string;
  notes: string;
}

export interface CohortDraft {
  id?: string;
  program: string;
  label: string;
  startsOn: string;
  endsOn: string;
  capacity: string;
  status: string;
  timezone: string;
  notes: string;
}

export interface WaitlistRow {
  id: string;
  cohortId: string | null;
  cohortLabel: string;
  program: string;
  name: string;
  email: string;
  phone: string | null;
  note: string;
  createdAt: string;
}

export interface TierPrice {
  program: string;
  tier: string;
  label: string;
  priceMinor: number;
  currency: string;
  altPriceMinor: number | null;
}

/** What each support level costs, exactly as the checkout function will charge it. */
export async function loadTierPrices(): Promise<TierPrice[]> {
  const { data, error } = await supabase.rpc('program_tier_list');
  if (error) throw error;
  return ((data ?? []) as any[]).map((row) => ({
    program: row.program,
    tier: row.tier,
    label: row.label ?? '',
    priceMinor: row.price_minor,
    currency: row.currency,
    altPriceMinor: row.alt_price_minor ?? null,
  }));
}

const emptyStatus = (program: ProgramKey): ProgramStatus => ({
  program,
  openCohorts: 0,
  waitlistCount: 0,
  cohortId: null,
  label: '',
  startsOn: null,
  endsOn: null,
  capacity: null,
  taken: 0,
  remaining: null,
  accepting: false,
});

/** What the program pages should say about dates, capacity and places left. */
export async function loadProgramStatus(program: ProgramKey): Promise<ProgramStatus> {
  const { data, error } = await supabase.rpc('program_status', { check_program: program });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as any;
  if (!row) return emptyStatus(program);
  return {
    program,
    openCohorts: row.open_cohorts ?? 0,
    waitlistCount: row.waitlist_count ?? 0,
    cohortId: row.cohort_id ?? null,
    label: row.label ?? '',
    startsOn: row.starts_on ?? null,
    endsOn: row.ends_on ?? null,
    capacity: row.capacity ?? null,
    taken: row.taken ?? 0,
    remaining: row.remaining ?? null,
    accepting: row.accepting === true,
  };
}

/** The runs an applicant can choose between. */
export async function loadOpenCohorts(program: ProgramKey): Promise<OpenCohort[]> {
  const { data, error } = await supabase.rpc('open_cohorts', { check_program: program });
  if (error) throw error;
  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    label: row.label ?? '',
    startsOn: row.starts_on ?? null,
    capacity: row.capacity ?? null,
    remaining: row.remaining ?? null,
  }));
}

/** Submits a Foundry application, Launchpad booking or Done-with-you brief. */
export async function submitApplication(input: ApplicationInput): Promise<string> {
  const { data, error } = await supabase.rpc('submit_application', {
    payload: {
      program: input.program,
      tier: input.tier ?? '',
      cohort_id: input.cohortId ?? null,
      name: input.name,
      email: input.email,
      phone: input.phone ?? '',
      company: input.company ?? '',
      answers: input.answers ?? {},
    },
  });
  if (error) throw error;
  reportTouch(input.email);
  return data as string;
}

export async function joinWaitlist(input: ApplicationInput & { note?: string }): Promise<string> {
  const { data, error } = await supabase.rpc('join_waitlist', {
    payload: {
      program: input.program,
      cohort_id: input.cohortId ?? null,
      name: input.name,
      email: input.email,
      phone: input.phone ?? '',
      note: input.note ?? '',
    },
  });
  if (error) throw error;
  reportTouch(input.email);
  return data as string;
}

// ---------------------------------------------------------------------------
// Studio

export async function loadApplications(status = 'all', program = 'all'): Promise<ApplicationRow[]> {
  const { data, error } = await supabase.rpc('list_applications', { check_status: status, check_program: program });
  if (error) throw error;
  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    program: row.program,
    tier: row.tier ?? '',
    cohortId: row.cohort_id ?? null,
    cohortLabel: row.cohort_label ?? '',
    startsOn: row.starts_on ?? null,
    name: row.name,
    email: row.email,
    phone: row.phone ?? null,
    company: row.company ?? null,
    answers: row.answers ?? {},
    status: row.status,
    note: row.note ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function setApplicationStatus(id: string, status: string, note?: string) {
  const { error } = await supabase.rpc('set_application_status', { app_id: id, new_status: status, new_note: note ?? null });
  if (error) throw error;
}

export async function loadCohorts(): Promise<CohortRow[]> {
  const { data, error } = await supabase.rpc('list_cohorts');
  if (error) throw error;
  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    program: row.program,
    label: row.label ?? '',
    startsOn: row.starts_on ?? null,
    endsOn: row.ends_on ?? null,
    capacity: row.capacity ?? null,
    taken: row.taken ?? 0,
    remaining: row.remaining ?? null,
    waitlist: row.waitlist ?? 0,
    status: row.status,
    timezone: row.timezone ?? 'Africa/Lagos',
    notes: row.notes ?? '',
  }));
}

export async function saveCohort(draft: CohortDraft): Promise<string> {
  const { data, error } = await supabase.rpc('save_cohort', {
    payload: {
      id: draft.id ?? '',
      program: draft.program,
      label: draft.label,
      starts_on: draft.startsOn,
      ends_on: draft.endsOn,
      capacity: draft.capacity,
      status: draft.status,
      timezone: draft.timezone,
      notes: draft.notes,
    },
  });
  if (error) throw error;
  return data as string;
}

export async function deleteCohort(id: string) {
  const { error } = await supabase.rpc('delete_cohort', { check_cohort_id: id });
  if (error) throw error;
}

export async function loadWaitlist(cohortId: string | null = null, program: string | null = null): Promise<WaitlistRow[]> {
  const { data, error } = await supabase.rpc('list_waitlist', { check_cohort_id: cohortId, check_program: program });
  if (error) throw error;
  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    cohortId: row.cohort_id ?? null,
    cohortLabel: row.cohort_label ?? '',
    program: row.program,
    name: row.name,
    email: row.email,
    phone: row.phone ?? null,
    note: row.note ?? '',
    createdAt: row.created_at,
  }));
}

/** Payment status for the return page; null when the reference is unknown. */
export async function loadPaymentStatus(txRef: string) {
  const { data, error } = await supabase.rpc('payment_status', { check_tx_ref: txRef });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as any;
  if (!row) return null;
  return {
    txRef: row.tx_ref as string,
    status: row.status as string,
    program: (row.program ?? '') as string,
    tier: (row.tier ?? '') as string,
    amountMinor: row.amount_minor as number,
    currency: row.currency as string,
    email: row.email as string,
  };
}
