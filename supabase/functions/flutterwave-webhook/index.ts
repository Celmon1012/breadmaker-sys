// Flutterwave webhook: the authoritative confirmation of a payment.
//
// Point the Flutterwave dashboard webhook at
//   https://db.restart.ng/functions/v1/flutterwave-webhook
// with a secret hash set in FLUTTERWAVE_WEBHOOK_HASH. Every request is checked
// against that hash before anything is trusted, and the transaction is then
// verified with the Flutterwave API. Safe to receive twice.
//
// Env: FLUTTERWAVE_WEBHOOK_HASH, FLUTTERWAVE_SECRET_KEY, SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY.
import { serve } from 'https://deno.land/std@0.177.1/http/server.ts';
import { env, json, settlePayment, verifyByReference } from '../_shared/flutterwave.ts';

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const expected = env('FLUTTERWAVE_WEBHOOK_HASH');
  const provided = req.headers.get('verif-hash') ?? '';
  if (!expected || provided !== expected) {
    console.warn('flutterwave-webhook: bad or missing verif-hash');
    return json({ error: 'Not authorised.' }, 401);
  }

  try {
    const payload = await req.json().catch(() => null);
    const txRef = payload?.data?.tx_ref as string | undefined;
    if (!txRef) return json({ received: true, ignored: 'no tx_ref' });

    // Ask Flutterwave what actually happened rather than trusting the body.
    const transaction = await verifyByReference(txRef);
    if (!transaction) return json({ received: true, ignored: 'unknown reference' });

    const result = await settlePayment(txRef, transaction, payload);
    console.log('flutterwave-webhook', txRef, JSON.stringify(result));
    return json({ received: true, ...result });
  } catch (error) {
    console.error('flutterwave-webhook failed', error);
    // 200 so Flutterwave does not retry a request we could not process for a
    // reason that will not change; the verify endpoint can settle it later.
    return json({ received: true, error: (error as Error).message });
  }
});
