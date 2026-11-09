// The referral program: the link a member shares, remembering the code a visitor arrived with, and reading
// the member's earnings back. The rules (rate, window, who counts) live in migration 54, not here.
import { supabase } from './supabase';

const KEY = 'bm_ref_v1';
const CODE = /^[a-z0-9]{6,16}$/i;

/** Call once at start-up: keeps the code from a ?ref= link until the visitor signs in. */
export function captureReferral(): void {
  if (typeof window === 'undefined') return;
  try {
    const code = new URLSearchParams(window.location.search).get('ref')?.trim();
    if (code && CODE.test(code)) window.localStorage.setItem(KEY, code.toLowerCase());
  } catch {
    // Private windows and blocked storage: the referral is simply not remembered.
  }
}

const readPending = (): string | null => {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

const clearPending = () => {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // nothing to clean up
  }
};

let tried: string | null = null;

/**
 * After sign-in, tells the server which member's link this person arrived through. The server decides
 * whether it counts (new accounts only, never yourself). A network failure keeps the code for next time;
 * any answer from the server, yes or no, clears it. Never throws and never blocks sign-in.
 */
export async function claimPendingReferral(userId: string): Promise<void> {
  const code = readPending();
  if (!code || tried === `${userId}:${code}`) return;
  tried = `${userId}:${code}`;
  try {
    const { error } = await supabase.rpc('claim_referral', { p_code: code });
    if (!error) clearPending();
  } catch {
    // try again on the next sign-in
  }
}

export interface Amount {
  currency: string;
  amountMinor: number;
}

export interface ReferralPerson {
  joinedAt: string;
  earned: Amount[];
}

export interface ReferralSummary {
  code: string;
  ratePct: number;
  windowMonths: number;
  earned: Amount[];
  paid: Amount[];
  referrals: ReferralPerson[];
}

const amounts = (rows: any): Amount[] =>
  Array.isArray(rows) ? rows.map((row) => ({ currency: String(row.currency ?? 'NGN').toUpperCase(), amountMinor: Number(row.amount_minor ?? 0) })) : [];

/** The signed-in member's code, earnings and referred people. Creates the code the first time. */
export async function loadReferralSummary(): Promise<ReferralSummary> {
  const { data, error } = await supabase.rpc('my_referral_summary');
  if (error) throw error;
  const row = (data ?? {}) as any;
  return {
    code: String(row.code ?? ''),
    ratePct: Number(row.rate_pct ?? 0),
    windowMonths: Number(row.window_months ?? 0),
    earned: amounts(row.earned),
    paid: amounts(row.paid),
    referrals: Array.isArray(row.referrals) ? row.referrals.map((person: any) => ({ joinedAt: String(person.joined_at), earned: amounts(person.earned) })) : [],
  };
}

/** The address a member shares. */
export const referralLink = (code: string) => `${window.location.origin}/?ref=${code}`;

/** What is still owed to the member in one currency: earned minus already paid out. */
export function owedIn(summary: ReferralSummary, currency: string): number {
  const sum = (list: Amount[]) => list.filter((item) => item.currency === currency).reduce((total, item) => total + item.amountMinor, 0);
  return Math.max(0, sum(summary.earned) - sum(summary.paid));
}

/** Every currency the member has earned in, so totals can be shown per currency. */
export const earnedCurrencies = (summary: ReferralSummary): string[] => Array.from(new Set(summary.earned.map((item) => item.currency))).sort();
