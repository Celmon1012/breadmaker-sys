import { supabase } from './supabase';
import { LeakProfile } from './leak-test';
import { functionErrorMessage } from './function-error';
import { getCurrency } from './currency';
import { reportTouch } from './attribution';

/**
 * Server calls for the Business Leak Test. Every read of a result is proven by
 * a secret token that only the person who took the test holds (in this browser
 * and in their email), and the paid report's content is only returned by the
 * database once the result is unlocked.
 */

export type PaidTier = 'report' | 'report_call';

export interface SubmitInput {
  name: string;
  email: string;
  whatsapp: string;
  consent: boolean;
  answers: number[];
  profile: LeakProfile;
  archetype: string;
  leakiest: string;
}

export interface Access {
  id: string;
  token: string;
}

export interface StoredResult {
  id: string;
  name: string;
  answers: number[];
  profile: LeakProfile;
  pillar_scores: number[];
  total: number;
  band: string;
  archetype: string;
  leakiest: string;
  owner_dependence: number;
  paid_tier: PaidTier | null;
}

/** The three questions asked after the report is unlocked. They feed the AI-written section. */
export interface Intake {
  about: string;
  frustration: string;
  tried: string;
}

/** One note chosen from the owner's profile, with the extra plan actions it adds. */
export interface ProfileNote {
  dimension: 'main_goal' | 'team_size' | 'revenue_band' | 'business_age' | 'industry';
  option: string;
  note: string;
  /** main_goal only: the pillar the goal points at. */
  focus?: string;
  /** pillar id -> one extra action for that pillar's plan. */
  boost?: Record<string, string>;
}

/** The AI-written section, written once from the business's own scores, profile and intake. */
export interface AiReport {
  headline: string;
  business_snapshot: string;
  why_these_leaks: { pillar: string; why_for_you: string }[];
  first_week: string[];
  thirty_day_plan: { week: number; focus: string; actions: string[] }[];
  watch_outs: string[];
  questions_for_call: string[];
}

/** none: intake not done. pending/generating: being written. review: waiting for the team. */
export type AiStatus = 'none' | 'pending' | 'generating' | 'ready' | 'failed' | 'review';

export interface ReportContent {
  paid_tier: PaidTier;
  content: Record<string, Record<string, unknown>>;
  profile_notes: ProfileNote[];
  intake_done: boolean;
  ai_status: AiStatus;
  ai: AiReport | null;
  contact: { name: string; email: string };
  call: { status: 'to_book' | 'booked' | 'done'; booked_at: string | null } | null;
  benchmark:
    | { ready: false; count: number }
    | { ready: true; scope: 'industry' | 'all'; industry?: string; count: number; pillars: number[]; total: number };
}

export interface ReportPrice {
  tier: PaidTier;
  label: string;
  description: string;
  price_minor: number;
  currency: string;
  alt_price_minor?: number | null;
}

/** A time-limited discount this result qualifies for, counted from the result date. */
export interface ReportOffer {
  tier: PaidTier;
  discount_pct: number;
  ends_at: string;
  server_now: string;
}

const STORAGE_KEY = 'bm-leak-test';

/** The result this browser last unlocked, so a refresh does not lose it. */
export function loadAccess(): Access | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.id && parsed?.token ? { id: String(parsed.id), token: String(parsed.token) } : null;
  } catch {
    return null;
  }
}

export function saveAccess(access: Access) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(access));
  } catch {
    /* private mode: the link in the email still works */
  }
}

/** Reads ?s=<id>&t=<token> from the address bar, falling back to this browser's saved result. */
export function accessFromUrl(): Access | null {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('s');
  const token = params.get('t');
  if (id && token) return { id, token };
  return loadAccess();
}

export async function submitLeakTest(input: SubmitInput): Promise<Access> {
  const { data, error } = await supabase.rpc('submit_leak_test', { payload: input });
  if (error) throw new Error(error.message);
  const access = { id: String(data.id), token: String(data.token) };
  saveAccess(access);
  reportTouch((input as { email?: string }).email ?? '');
  return access;
}

export async function getLeakTest(access: Access): Promise<StoredResult | null> {
  const { data, error } = await supabase.rpc('get_leak_test', { sub_id: access.id, sub_token: access.token });
  if (error) throw new Error(error.message);
  return (data as StoredResult | null) ?? null;
}

export async function getLeakReport(access: Access): Promise<ReportContent> {
  const { data, error } = await supabase.rpc('get_leak_test_report', { sub_id: access.id, sub_token: access.token });
  if (error) throw new Error(error.message);
  return data as ReportContent;
}

export async function listReportPrices(): Promise<ReportPrice[]> {
  const { data, error } = await supabase.rpc('leak_test_price_list');
  if (error) throw new Error(error.message);
  return (data as ReportPrice[]) ?? [];
}

/** Saves the three intake answers and queues the AI section. Returns its status. */
export async function saveIntake(access: Access, intake: Intake): Promise<AiStatus> {
  const { data, error } = await supabase.rpc('save_leak_intake', { sub_id: access.id, sub_token: access.token, payload: intake });
  if (error) throw new Error(error.message);
  return data as AiStatus;
}

/** Asks the server to write the AI section. Safe to call twice: a report is only written once. */
export async function generateAiReport(access: Access): Promise<void> {
  const { data, error } = await supabase.functions.invoke('leak-test-generate', {
    body: { submissionId: access.id, token: access.token },
  });
  if (error) throw new Error(await functionErrorMessage(error, 'The report could not be written.'));
  if (data?.error) throw new Error(String(data.error));
}

/** Offers still open for this result. Empty once the window closes or the report is unlocked. */
export async function getReportOffers(access: Access): Promise<ReportOffer[]> {
  const { data, error } = await supabase.rpc('leak_test_offers', { sub_id: access.id, sub_token: access.token });
  if (error) throw new Error(error.message);
  return (data as ReportOffer[]) ?? [];
}

export async function redeemCode(access: Access, code: string): Promise<PaidTier> {
  const { data, error } = await supabase.rpc('redeem_leak_test_code', {
    sub_id: access.id,
    sub_token: access.token,
    redeem_code: code,
  });
  if (error) throw new Error(error.message);
  return data as PaidTier;
}

/** Creates a pending payment and returns the Flutterwave link to open. */
export async function startReportCheckout(access: Access, tier: PaidTier): Promise<string> {
  const { data, error } = await supabase.functions.invoke('leak-test-checkout', {
    body: { submissionId: access.id, token: access.token, tier, currency: getCurrency() },
  });
  if (error) throw new Error(await functionErrorMessage(error, 'Checkout could not be started.'));
  if (!data?.link) throw new Error(data?.error ?? 'Checkout could not be started.');
  return String(data.link);
}

/**
 * Sends the result email and the lead webhook (event "submitted"), or the
 * report-ready email after a code unlocks it (event "paid"). Best effort: the
 * result shows either way.
 */
export async function notifyLeak(access: Access, event: 'submitted' | 'paid' = 'submitted'): Promise<void> {
  try {
    await supabase.functions.invoke('leak-test-notify', { body: { submissionId: access.id, token: access.token, event } });
  } catch {
    /* the email can be resent; never block the result on it */
  }
}

// ---------------------------------------------------------------------------
// Team tools (Studio): every call is checked by the database against the signed-in team role.

export interface LeakLead {
  id: string;
  created_at: string;
  name: string;
  email: string;
  whatsapp: string;
  profile: LeakProfile;
  total: number;
  band: string;
  archetype: string;
  leakiest: string;
  owner_dependence: number;
  paid_tier: PaidTier | null;
  code: string | null;
  ai_status: Exclude<AiStatus, 'review'>;
  ai_released: boolean;
  call_status: 'to_book' | 'booked' | 'done' | null;
  call_booked_at: string | null;
}

export interface LeakLeadDetail {
  id: string;
  name: string;
  email: string;
  whatsapp: string;
  profile: LeakProfile;
  pillar_scores: number[];
  total: number;
  archetype: string;
  leakiest: string;
  paid_tier: PaidTier | null;
  intake: Intake | null;
  ai_status: Exclude<AiStatus, 'review'>;
  ai_report: AiReport | null;
  ai_released: boolean;
  call_status: 'to_book' | 'booked' | 'done' | null;
  call_booked_at: string | null;
  call_notes: string | null;
}

export async function listLeakLeads(): Promise<LeakLead[]> {
  const { data, error } = await supabase.rpc('list_leak_test_leads');
  if (error) throw new Error(error.message);
  return (data as LeakLead[]) ?? [];
}

export async function getLeakLeadDetail(id: string): Promise<LeakLeadDetail | null> {
  const { data, error } = await supabase.rpc('leak_test_lead_detail', { sub_id: id });
  if (error) throw new Error(error.message);
  return (data as LeakLeadDetail | null) ?? null;
}

/** Saves an edited AI section (or null to keep it) and sets whether the customer can see it. */
export async function setLeakAiReport(id: string, report: AiReport | null, release: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_leak_ai_report', { sub_id: id, report, release });
  if (error) throw new Error(error.message);
}

/** Puts the report back in the queue so it is written again the next time the customer opens it. */
export async function requeueLeakAi(id: string): Promise<void> {
  const { error } = await supabase.rpc('requeue_leak_ai', { sub_id: id });
  if (error) throw new Error(error.message);
}

export async function setLeakCall(id: string, status: string, bookedAt: string | null, notes: string): Promise<void> {
  const { error } = await supabase.rpc('set_leak_call', { sub_id: id, new_status: status, new_booked_at: bookedAt, new_notes: notes });
  if (error) throw new Error(error.message);
}

/** Permanently deletes a result and its report. Owners and coaches only. */
export async function deleteLeakTest(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_leak_test', { sub_id: id });
  if (error) throw new Error(error.message);
}

export interface LeakPriceAdmin {
  tier: PaidTier;
  label: string;
  description: string;
  price_minor: number;
  currency: 'NGN' | 'USD';
  alt_price_minor: number | null;
  active: boolean;
  discount_pct: number;
  discount_hours: number;
}

export async function listLeakPricesAdmin(): Promise<LeakPriceAdmin[]> {
  const { data, error } = await supabase.rpc('list_leak_test_prices_admin');
  if (error) throw new Error(error.message);
  return (data as LeakPriceAdmin[]) ?? [];
}

export async function setLeakPrice(price: LeakPriceAdmin): Promise<void> {
  const { error } = await supabase.rpc('set_leak_test_price', {
    for_tier: price.tier,
    new_price_minor: price.price_minor,
    new_currency: price.currency,
    new_alt_price_minor: price.alt_price_minor,
    new_discount_pct: price.discount_pct,
    new_discount_hours: price.discount_hours,
    new_active: price.active,
  });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// "Tell me when it's ready" for systems that are still in testing.

export async function registerSystemInterest(systemId: string, email: string, name = '', source = 'systems'): Promise<void> {
  const { error } = await supabase.rpc('register_system_interest', { p_system_id: systemId, p_email: email, p_name: name, p_source: source });
  if (error) throw new Error(error.message);
  reportTouch(email);
}

export interface SystemInterestCount {
  system_id: string;
  people: number;
  last_asked: string;
}

export async function listSystemInterest(): Promise<SystemInterestCount[]> {
  const { data, error } = await supabase.rpc('system_interest_counts');
  if (error) throw new Error(error.message);
  return (data as SystemInterestCount[]) ?? [];
}
