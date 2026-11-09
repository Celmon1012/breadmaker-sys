// Starts a Flutterwave payment for a Business Leak Test report.
//
//   POST { submissionId, token, tier, redirectPath? } -> { txRef, link }
//
// The price comes from breadmaker.leak_test_prices, so the browser cannot change
// it, and the token proves the caller owns the result they are paying to unlock.
// The payment is recorded as pending first; flutterwave-verify and
// flutterwave-webhook settle it and unlock the report.
//
// Env: FLUTTERWAVE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// optional PUBLIC_SITE_URL, FLUTTERWAVE_API_URL.
import { serve } from 'https://deno.land/std@0.177.1/http/server.ts';
import { admin, corsHeaders, flutterwave, json, newTxRef, pickAmount, siteUrl, wantedCurrency } from '../_shared/flutterwave.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const submissionId = String(body.submissionId ?? '').trim();
    const token = String(body.token ?? '').trim();
    const tier = String(body.tier ?? '').trim();
    if (!submissionId || !token) return json({ error: 'submissionId and token are required.' }, 400);

    const db = admin();
    const { data: submission, error: submissionError } = await db
      .from('leak_test_submissions')
      .select('id, name, email, whatsapp, paid_tier, created_at')
      .eq('id', submissionId)
      .eq('access_token', token)
      .maybeSingle();
    // A database error (for example missing privileges) must not look like "not found".
    if (submissionError) throw submissionError;
    if (!submission) return json({ error: 'We could not find that result.' }, 404);
    if (submission.paid_tier === 'report_call' || (submission.paid_tier === 'report' && tier === 'report')) {
      return json({ error: 'This report is already unlocked.' }, 409);
    }

    const { data: price, error: priceError } = await db
      .from('leak_test_prices')
      .select('tier, label, price_minor, currency, alt_price_minor, discount_pct, discount_hours')
      .eq('tier', tier)
      .eq('active', true)
      .maybeSingle();
    if (priceError) throw priceError;
    if (!price) return json({ error: 'That option is not on sale.' }, 400);

    // Launch offer: discount_pct off for discount_hours after the result was saved.
    // Same rule as breadmaker.leak_test_offers, enforced here so the browser cannot extend it.
    const offerEnds = new Date(submission.created_at).getTime() + (price.discount_hours ?? 0) * 3_600_000;
    const percentOff = price.discount_pct > 0 && Date.now() < offerEnds ? price.discount_pct : 0;
    // The amount in the currency the visitor picked; the discount takes the same percentage off either.
    const picked = pickAmount(price, wantedCurrency(body.currency));
    const amountMinor = Math.round((picked.price_minor * (100 - percentOff)) / 100);

    // "leaktest" has no hyphen, so the callback can read the program out of the reference.
    const txRef = newTxRef('leaktest', tier);
    const { error: insertError } = await db.from('payments').insert({
      tx_ref: txRef,
      provider: 'flutterwave',
      program: 'leaktest',
      tier,
      email: submission.email,
      name: submission.name,
      phone: submission.whatsapp,
      submission_id: submission.id,
      amount_minor: amountMinor,
      currency: picked.currency,
      status: 'pending',
    });
    if (insertError) throw insertError;

    const redirectPath = `/payment/callback?s=${submission.id}&t=${token}`;
    const checkout = await flutterwave<{ status: string; data?: { link?: string } }>('/payments', {
      method: 'POST',
      body: JSON.stringify({
        tx_ref: txRef,
        amount: (amountMinor / 100).toFixed(2),
        currency: picked.currency,
        redirect_url: `${siteUrl()}${redirectPath}`,
        payment_options: 'card,banktransfer,ussd',
        customer: { email: submission.email, name: submission.name || submission.email, phonenumber: submission.whatsapp },
        customizations: { title: price.label || 'Business Leak Test report', description: 'Breadmaker Business Leak Test' },
        meta: { program: 'leaktest', tier, submission_id: submission.id },
      }),
    });

    const link = checkout?.data?.link;
    if (!link) {
      await db.from('payments').update({ status: 'failed', failure_reason: 'No checkout link returned', updated_at: new Date().toISOString() }).eq('tx_ref', txRef);
      return json({ error: 'Flutterwave did not return a checkout link.' }, 502);
    }
    return json({ txRef, link, amountMinor, currency: picked.currency });
  } catch (error) {
    console.error('leak-test-checkout failed', error);
    return json({ error: (error as Error).message ?? 'Checkout could not be started.' }, 500);
  }
});
