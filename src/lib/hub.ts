import { supabase } from './supabase';
import { startCheckout } from './payments';

/**
 * Breadmaker Hub: the monthly membership. One payment buys one period (30 days by default) of
 * access to every kit and every course that is not a program. Paying again before it ends adds
 * to the end date. The price and discount are set in Studio and read by the checkout function.
 */

/** What Community costs, once. Shown in copy only: checkout reads the real price from the database. */
export const COMMUNITY_PRICE_USD = 97;

/** While true Community shows a waitlist instead of the join and pay card. Flip to false to open Community. */
export const WAITLIST_MODE = true;

export interface HubOffer {
  label: string;
  description: string;
  priceMinor: number;
  currency: string;
  periodDays: number;
  discountPct: number;
  discountEndsAt: string | null;
  altPriceMinor: number | null;
}

/** What the Hub costs now, or null while it is not on sale. */
export async function getHubOffer(): Promise<HubOffer | null> {
  const { data, error } = await supabase.rpc('membership_offer');
  if (error) throw new Error(error.message);
  const row = ((data ?? []) as any[])[0];
  if (!row) return null;
  return {
    label: row.label,
    description: row.description ?? '',
    priceMinor: row.price_minor,
    currency: String(row.currency ?? 'NGN').toUpperCase(),
    periodDays: row.period_days,
    discountPct: row.discount_pct ?? 0,
    discountEndsAt: row.discount_ends_at ?? null,
    altPriceMinor: row.alt_price_minor ?? null,
  };
}

/** The price after the discount, in minor units, for an amount already resolved to the visitor's currency. */
export const hubPayable = (priceMinor: number, discountPct: number) => Math.round((priceMinor * (100 - discountPct)) / 100);

export interface MyMembership {
  active: boolean;
  periodEnd: string;
  startedAt: string;
}

export async function getMyMembership(): Promise<MyMembership | null> {
  const { data, error } = await supabase.rpc('my_membership');
  if (error) throw new Error(error.message);
  const row = ((data ?? []) as any[])[0];
  return row ? { active: row.active === true, periodEnd: row.current_period_end, startedAt: row.started_at } : null;
}

/** Starts the Flutterwave payment for one month and returns the link to open. */
export async function startHubCheckout(email: string, name: string): Promise<string> {
  const result = await startCheckout({ program: 'membership', tier: 'hub', email, name });
  return result.link;
}

// ---------------------------------------------------------------------------
// Team tools (Studio): every call is checked by the database against the signed-in team role.

export interface HubPlanAdmin {
  description: string;
  priceMinor: number;
  currency: 'NGN' | 'USD';
  altPriceMinor: number | null;
  periodDays: number;
  discountPct: number;
  discountEndsAt: string | null;
  active: boolean;
}

export async function getHubPlanAdmin(): Promise<HubPlanAdmin | null> {
  const { data, error } = await supabase.rpc('list_membership_plans_admin');
  if (error) throw new Error(error.message);
  const row = ((data ?? []) as any[]).find((r) => r.code === 'hub');
  if (!row) return null;
  return {
    description: row.description ?? '',
    priceMinor: row.price_minor,
    currency: row.currency,
    altPriceMinor: row.alt_price_minor ?? null,
    periodDays: row.period_days,
    discountPct: row.discount_pct,
    discountEndsAt: row.discount_ends_at ?? null,
    active: row.active,
  };
}

export async function setHubPlan(plan: HubPlanAdmin): Promise<void> {
  const { error } = await supabase.rpc('set_membership_plan', {
    new_description: plan.description,
    new_price_minor: plan.priceMinor,
    new_currency: plan.currency,
    new_alt_price_minor: plan.altPriceMinor,
    new_period_days: plan.periodDays,
    new_discount_pct: plan.discountPct,
    new_discount_ends_at: plan.discountEndsAt,
    new_active: plan.active,
  });
  if (error) throw new Error(error.message);
}

export interface HubMemberRow {
  email: string;
  name: string;
  periodEnd: string;
  startedAt: string;
  source: 'purchase' | 'manual';
  note: string;
  active: boolean;
}

export async function listHubMembers(): Promise<HubMemberRow[]> {
  const { data, error } = await supabase.rpc('list_memberships');
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((row) => ({
    email: row.email,
    name: row.name ?? '',
    periodEnd: row.current_period_end,
    startedAt: row.started_at,
    source: row.source,
    note: row.note ?? '',
    active: row.active === true,
  }));
}

/** Adds days to a member (creating them if needed), or ends the membership now when days is 0. */
export async function setHubMember(email: string, days: number, note = ''): Promise<void> {
  const { error } = await supabase.rpc('set_membership', { for_email: email, add_days: days, new_note: note });
  if (error) throw new Error(error.message);
}

export interface HubWaitlistRow {
  name: string;
  email: string;
  createdAt: string;
}

/** People who joined the Hub waitlist, newest first. Studio team only (the table is team-readable). */
export async function listHubWaitlist(): Promise<HubWaitlistRow[]> {
  const { data, error } = await supabase
    .from('system_interest')
    .select('name, email, created_at')
    .eq('system_id', 'hub')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as { name: string | null; email: string; created_at: string }[]).map((row) => ({
    name: row.name ?? '',
    email: row.email,
    createdAt: row.created_at,
  }));
}
