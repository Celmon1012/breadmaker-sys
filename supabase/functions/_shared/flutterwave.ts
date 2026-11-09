// Shared helpers for the Breadmaker program checkout.
//
// Amounts always come from breadmaker.program_tiers in the database, never from
// the browser, so a tampered request cannot change what is charged.
//
// Env (edge-functions container): FLUTTERWAVE_SECRET_KEY, FLUTTERWAVE_WEBHOOK_HASH,
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY; optional FLUTTERWAVE_API_URL,
// PUBLIC_SITE_URL (defaults to https://breadmakersystems.com).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const env = (key: string, fallback = '') => Deno.env.get(key) || fallback;

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/** Service-role client: bypasses RLS, so it is only used inside these functions. */
export function admin() {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
    db: { schema: 'breadmaker' },
  });
}

export const siteUrl = () => env('PUBLIC_SITE_URL', 'https://breadmakersystems.com').replace(/\/$/, '');

export const fwApi = () => env('FLUTTERWAVE_API_URL', 'https://api.flutterwave.com/v3').replace(/\/$/, '');

/** Calls the Flutterwave API with the secret key. */
export async function flutterwave<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${fwApi()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env('FLUTTERWAVE_SECRET_KEY')}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || (body && body.status === 'error')) {
    throw new Error(body?.message ?? `Flutterwave ${response.status}`);
  }
  return body as T;
}

export interface VerifiedTransaction {
  id: number;
  tx_ref: string;
  status: string;
  amount: number;
  currency: string;
  customer?: { email?: string; name?: string; phonenumber?: string };
}

/** Asks Flutterwave directly whether a reference was paid. */
export async function verifyByReference(txRef: string): Promise<VerifiedTransaction | null> {
  const body = await flutterwave<{ status: string; data?: VerifiedTransaction }>(
    `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`,
  );
  return body.data ?? null;
}

/** Our own reference, so a payment can always be traced back to a program and tier. */
export function newTxRef(program: string, tier: string) {
  const stamp = Date.now().toString(36);
  const noise = crypto.getRandomValues(new Uint8Array(4)).reduce((acc, byte) => acc + byte.toString(16).padStart(2, '0'), '');
  return `bm-${program}-${tier || 'tier'}-${stamp}-${noise}`;
}

export interface TierPrice {
  program: string;
  tier: string;
  label: string;
  price_minor: number;
  currency: string;
  alt_price_minor?: number | null;
}

export type WantedCurrency = 'NGN' | 'USD';

/** The currency the visitor picked in the switcher, or null when none was sent. */
export function wantedCurrency(value: unknown): WantedCurrency | null {
  const text = String(value ?? '').toUpperCase();
  return text === 'NGN' || text === 'USD' ? text : null;
}

/**
 * The amount to charge in the currency the visitor picked. Every price has a main amount and currency
 * plus an optional amount in the other currency; with no amount in the wanted currency the main one is charged.
 */
export function pickAmount(row: { price_minor: number; currency: string; alt_price_minor?: number | null }, wanted: WantedCurrency | null) {
  const main = String(row.currency ?? 'NGN').toUpperCase();
  if (wanted && wanted !== main && row.alt_price_minor && row.alt_price_minor > 0) return { price_minor: row.alt_price_minor, currency: wanted as string };
  return { price_minor: row.price_minor, currency: main };
}

/** The price the database says this program and tier costs. */
export async function tierPrice(program: string, tier: string): Promise<TierPrice | null> {
  const { data, error } = await admin()
    .from('program_tiers')
    .select('program, tier, label, price_minor, currency, alt_price_minor')
    .eq('program', program)
    .eq('tier', tier)
    .eq('active', true)
    .maybeSingle();
  if (error) throw error;
  return (data as TierPrice) ?? null;
}

/**
 * Marks a payment successful and enrolls the payer, once Flutterwave confirms it.
 * Safe to call twice: the enrollment insert is idempotent.
 */
export async function settlePayment(txRef: string, transaction: VerifiedTransaction, raw: unknown) {
  const db = admin();
  const { data: payment, error } = await db
    .from('payments')
    .select('id, amount_minor, currency, status, program')
    .eq('tx_ref', txRef)
    .maybeSingle();
  if (error) throw error;
  if (!payment) return { settled: false, reason: 'unknown-reference' as const };

  const paid = transaction.status === 'successful';
  const matchesAmount = Math.round(Number(transaction.amount) * 100) >= payment.amount_minor;
  const matchesCurrency = String(transaction.currency ?? '').toUpperCase() === String(payment.currency ?? '').toUpperCase();

  if (paid && (!matchesAmount || !matchesCurrency)) {
    // Never enroll on an amount or currency that does not match what we asked for.
    await db
      .from('payments')
      .update({
        status: 'failed',
        failure_reason: `Amount mismatch: paid ${transaction.amount} ${transaction.currency}`,
        provider_tx_id: String(transaction.id),
        raw,
        updated_at: new Date().toISOString(),
      })
      .eq('tx_ref', txRef);
    return { settled: false, reason: 'amount-mismatch' as const };
  }

  await db
    .from('payments')
    .update({
      status: paid ? 'successful' : transaction.status === 'cancelled' ? 'cancelled' : 'failed',
      provider_tx_id: String(transaction.id),
      provider_ref: txRef,
      raw,
      paid_at: paid ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('tx_ref', txRef);

  if (!paid) return { settled: false, reason: 'not-successful' as const };
  return grantAccess(txRef, payment.program);
}

/**
 * Settles a payment that Lago reports as paid. The invoice must be fully paid, in the amount and
 * currency we asked for, before anyone is enrolled. Safe to call twice.
 */
export async function settleFromLagoInvoice(
  invoice: { lago_id: string; payment_status?: string; currency?: string; total_amount_cents?: number },
  raw: unknown,
) {
  const db = admin();
  const { data: payment, error } = await db
    .from('payments')
    .select('id, tx_ref, amount_minor, currency, status, program')
    .eq('lago_invoice_id', invoice.lago_id)
    .maybeSingle();
  if (error) throw error;
  if (!payment) return { settled: false, reason: 'unknown-invoice' as const };
  if (payment.status === 'successful') return { settled: true, enrollment: 'already', txRef: payment.tx_ref as string };
  if (invoice.payment_status !== 'succeeded') return { settled: false, reason: 'not-successful' as const, txRef: payment.tx_ref as string };

  const matchesAmount = Number(invoice.total_amount_cents ?? 0) >= payment.amount_minor;
  const matchesCurrency = String(invoice.currency ?? '').toUpperCase() === String(payment.currency ?? '').toUpperCase();
  if (!matchesAmount || !matchesCurrency) {
    await db
      .from('payments')
      .update({
        status: 'failed',
        failure_reason: `Amount mismatch: invoice ${invoice.total_amount_cents} ${invoice.currency}`,
        raw,
        updated_at: new Date().toISOString(),
      })
      .eq('id', payment.id);
    return { settled: false, reason: 'amount-mismatch' as const, txRef: payment.tx_ref as string };
  }

  await db
    .from('payments')
    .update({ status: 'successful', provider_ref: invoice.lago_id, raw, paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', payment.id);
  return { ...(await grantAccess(payment.tx_ref as string, payment.program as string)), txRef: payment.tx_ref as string };
}

/** What a paid payment unlocks: a Leak Test report, a Breadmaker Hub month, or an enrolment. */
async function grantAccess(txRef: string, program: string) {
  const db = admin();
  // A paid Business Leak Test report unlocks the report instead of enrolling anyone.
  if (program === 'leaktest') {
    const { data: submissionId, error: grantError } = await db.rpc('grant_leak_test_report', { check_tx_ref: txRef });
    if (grantError) throw grantError;
    if (submissionId) {
      // Imported here, not at the top, because leaktest.ts imports this file.
      const { notifyLead } = await import('./leaktest.ts');
      await notifyLead(String(submissionId), 'paid');
    }
    return { settled: true, enrollment: 'report' };
  }

  // A paid Breadmaker Hub month extends the membership instead of enrolling anyone.
  if (program === 'membership') {
    const { data: membership, error: membershipError } = await db.rpc('grant_membership', { check_tx_ref: txRef });
    if (membershipError) throw membershipError;
    return { settled: true, enrollment: String(membership) };
  }

  const { data: enrollment, error: enrollError } = await db.rpc('enroll_from_payment', { check_tx_ref: txRef });
  if (enrollError) throw enrollError;
  return { settled: true, enrollment: enrollment as string };
}
