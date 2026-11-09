// Confirms a payment when the payer returns from Flutterwave.
//
//   POST { txRef } -> { status, amountMinor, currency, enrollment }
//
// Never trusts the redirect: the transaction is verified against Flutterwave's
// API, the amount and currency are compared with what we asked for, and only
// then is the payer enrolled.
//
// Env: FLUTTERWAVE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { serve } from 'https://deno.land/std@0.177.1/http/server.ts';
import { admin, corsHeaders, json, settlePayment, verifyByReference } from '../_shared/flutterwave.ts';
import { invoiceIdFromReference } from '../_shared/lago.ts';
import { confirmLagoPayment } from '../_shared/reconcile.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  try {
    const { txRef } = await req.json().catch(() => ({ txRef: '' }));
    if (!txRef) return json({ error: 'txRef is required.' }, 400);

    const db = admin();
    let { data: payment } = await db.from('payments').select('*').eq('tx_ref', txRef).maybeSingle();
    // Paid through Lago, Flutterwave sends the payer back with Lago's reference ("<invoice id>-<random>").
    if (!payment) {
      const invoiceId = invoiceIdFromReference(String(txRef));
      if (invoiceId) ({ data: payment } = await db.from('payments').select('*').eq('lago_invoice_id', invoiceId).maybeSingle());
    }
    if (!payment) return json({ error: 'Unknown payment reference.' }, 404);

    const summary = { txRef: payment.tx_ref, program: payment.program, tier: payment.tier, amountMinor: payment.amount_minor, currency: payment.currency };

    // Already settled by the webhook: report it without calling Flutterwave again.
    if (payment.status === 'successful') return json({ ...summary, status: 'successful', enrollment: 'already' });

    // A Lago invoice is settled by what Lago says about it.
    // Lago can leave a paid invoice pending, so Flutterwave is asked too (see _shared/reconcile.ts).
    if (payment.lago_invoice_id) {
      const result = await confirmLagoPayment(payment, String(txRef));
      if (!result) return json({ ...summary, status: payment.status });
      return json({
        ...summary,
        status: result.settled ? 'successful' : result.reason === 'amount-mismatch' ? 'failed' : payment.status,
        enrollment: 'enrollment' in result ? result.enrollment : null,
        reason: 'reason' in result ? result.reason : null,
      });
    }

    const transaction = await verifyByReference(payment.tx_ref);
    if (!transaction) return json({ ...summary, status: payment.status });

    const result = await settlePayment(payment.tx_ref, transaction, transaction);
    return json({
      ...summary,
      status: result.settled ? 'successful' : transaction.status,
      enrollment: 'enrollment' in result ? result.enrollment : null,
      reason: 'reason' in result ? result.reason : null,
    });
  } catch (error) {
    console.error('flutterwave-verify failed', error);
    return json({ error: (error as Error).message ?? 'Could not verify the payment.' }, 500);
  }
});
