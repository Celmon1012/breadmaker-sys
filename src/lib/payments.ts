import { supabase } from './supabase';
import { formatPrice } from './lms';
import { getCurrency } from './currency';
import { functionErrorMessage } from './function-error';

/**
 * Flutterwave checkout for the program tiers.
 *
 * The browser never sends an amount: the edge function reads the price from
 * breadmaker.program_tiers and creates the payment. Switch the flow on by
 * setting VITE_PAYMENTS_ENABLED=true in the build once the Flutterwave keys are
 * in place on the Supabase side (see docs/FLUTTERWAVE.md).
 */

export const paymentsEnabled = ((import.meta.env.VITE_PAYMENTS_ENABLED as string | undefined) ?? '').toLowerCase() === 'true';

export interface CheckoutInput {
  program: string;
  tier: string;
  name: string;
  email: string;
  phone?: string;
  applicationId?: string | null;
  redirectPath?: string;
  /** NGN or USD. Defaults to the switcher's choice; the server charges the amount it holds for that currency. */
  currency?: string;
}

export interface CheckoutResult {
  txRef: string;
  link: string;
  amountMinor: number;
  currency: string;
}

/** Creates a pending payment and returns the Flutterwave checkout link to open. */
export async function startCheckout(input: CheckoutInput): Promise<CheckoutResult> {
  const { data, error } = await supabase.functions.invoke('flutterwave-checkout', { body: { ...input, currency: input.currency ?? getCurrency() } });
  if (error) throw new Error(await functionErrorMessage(error, 'Checkout could not be started.'));
  if (!data?.link) throw new Error(data?.error ?? 'Checkout could not be started.');
  return { txRef: data.txRef, link: data.link, amountMinor: data.amountMinor ?? 0, currency: data.currency ?? 'NGN' };
}

export interface VerifyResult {
  status: string;
  amountMinor: number;
  currency: string;
  enrollment: string | null;
  reason: string | null;
  /** Our own reference, which can differ from the one in the URL when the payment went through Lago. */
  txRef: string | null;
  program: string | null;
  tier: string | null;
}

/** Confirms a payment with Flutterwave and enrolls the payer when it is paid. */
export async function verifyPayment(txRef: string): Promise<VerifyResult> {
  const { data, error } = await supabase.functions.invoke('flutterwave-verify', { body: { txRef } });
  if (error) throw new Error(await functionErrorMessage(error, 'Could not verify the payment.'));
  if (data?.error) throw new Error(data.error);
  return {
    status: data.status ?? 'pending',
    amountMinor: data.amountMinor ?? 0,
    currency: data.currency ?? 'NGN',
    enrollment: data.enrollment ?? null,
    reason: data.reason ?? null,
    txRef: data.txRef ?? null,
    program: data.program ?? null,
    tier: data.tier ?? null,
  };
}

export const money = (minor: number, currency: string) => formatPrice(minor, currency) ?? `${currency} ${minor / 100}`;

// ---------------------------------------------------------------------------
// Reading payments back: the team's ledger in Studio and a learner's own history.

export interface PaymentRow {
  id: string;
  txRef: string;
  program: string;
  tier: string;
  label: string;
  email: string;
  name: string;
  amountMinor: number;
  currency: string;
  status: 'pending' | 'successful' | 'failed' | 'cancelled' | string;
  provider: string;
  invoiceNumber: string | null;
  failureReason: string | null;
  paidAt: string | null;
  createdAt: string;
}

/** Where Lago lives, for the "open in Lago" link. Override with VITE_LAGO_URL. */
export const lagoInvoicesUrl = `${((import.meta.env.VITE_LAGO_URL as string | undefined) ?? 'https://billing.restart.ng/restart-inc').replace(/\/$/, '')}/invoices`;

/** Every payment, newest first. Team members only (row-level security). */
export async function loadPayments(): Promise<PaymentRow[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('id, tx_ref, program, tier, email, name, amount_minor, currency, status, provider, lago_invoice_number, failure_reason, paid_at, created_at, lms_courses(title)')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    txRef: row.tx_ref,
    program: row.program ?? '',
    tier: row.tier ?? '',
    label: row.lms_courses?.title ?? '',
    email: row.email,
    name: row.name ?? '',
    amountMinor: row.amount_minor,
    currency: String(row.currency ?? 'NGN').toUpperCase(),
    status: row.status,
    provider: row.provider ?? '',
    invoiceNumber: row.lago_invoice_number ?? null,
    failureReason: row.failure_reason ?? null,
    paidAt: row.paid_at ?? null,
    createdAt: row.created_at,
  }));
}

/** The signed-in learner's own payments. */
export async function loadMyPayments(): Promise<PaymentRow[]> {
  const { data, error } = await supabase.rpc('my_payments');
  if (error) throw error;
  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    txRef: row.tx_ref,
    program: row.program ?? '',
    tier: row.tier ?? '',
    label: row.label ?? '',
    email: '',
    name: '',
    amountMinor: row.amount_minor,
    currency: String(row.currency ?? 'NGN').toUpperCase(),
    status: row.status,
    provider: '',
    invoiceNumber: row.lago_invoice_number ?? null,
    failureReason: null,
    paidAt: row.paid_at ?? null,
    createdAt: row.created_at,
  }));
}

/** What a payment bought, in words. */
export function paymentSubject(row: Pick<PaymentRow, 'program' | 'tier' | 'label'>) {
  if (row.label) return row.label;
  if (row.program === 'leaktest') return 'Business Leak Test report';
  if (row.program === 'membership') return 'Breadmaker Prestige, one month';
  const program = row.program === 'foundry' ? 'Foundry' : row.program === 'launchpad' ? 'Launchpad' : row.program || 'Breadmaker';
  return row.tier ? `${program} · ${row.tier.replace(/-/g, ' ')}` : program;
}
