// Starts a Flutterwave payment for a Breadmaker program tier or a Prestige membership.
//
//   POST { program, tier, name, email, phone?, applicationId?, redirectPath? }
//   program is foundry or launchpad (tier = support level), or "membership" (tier = hub). Kits are not
//   sold one by one: they are free for Prestige Community members.
//   -> { txRef, link }   (send the browser to link)
//
// The amount comes from breadmaker.program_tiers, so the browser cannot change
// the price. The attempt is recorded as a pending payment before we call
// Flutterwave, so a reference always exists to reconcile against.
//
// Env: FLUTTERWAVE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// optional PUBLIC_SITE_URL, FLUTTERWAVE_API_URL.
// With LAGO_API_KEY and LAGO_BREADMAKER_ENTITY_CODE set, the invoice and payment link come from
// Lago (see _shared/lago.ts); otherwise, or if Lago is down, the link is created directly.
import { serve } from 'https://deno.land/std@0.177.1/http/server.ts';
import { admin, corsHeaders, flutterwave, json, newTxRef, pickAmount, siteUrl, tierPrice, wantedCurrency } from '../_shared/flutterwave.ts';
import { createInvoiceWithLink, lagoEnabled, upsertCustomer } from '../_shared/lago.ts';
import { hubPrice } from '../_shared/hub.ts';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const program = String(body.program ?? '').trim();
    const tier = String(body.tier ?? '').trim();
    const email = String(body.email ?? '').trim();
    const name = String(body.name ?? '').trim();
    const phone = String(body.phone ?? '').trim();
    const applicationId = body.applicationId ? String(body.applicationId) : null;
    const redirectPath = String(body.redirectPath ?? '/payment/callback');
    // The currency the visitor picked in the switcher; each price falls back to its main currency.
    const wanted = wantedCurrency(body.currency);

    if (!['foundry', 'launchpad', 'kit', 'membership'].includes(program)) return json({ error: 'Unknown program.' }, 400);
    if (!EMAIL.test(email)) return json({ error: 'A valid email is required.' }, 400);

    const db = admin();
    let courseId: string | null = null;
    let price: { price_minor: number; currency: string; label: string } | null = null;
    // Kits are free for Prestige Community members and included in the programs: they are not sold one by one.
    if (program === 'kit') return json({ error: 'Kits are included with Prestige Community.' }, 400);
    if (program === 'membership') {
      // The Breadmaker Hub: one month at the price (and discount) set in Studio.
      price = await hubPrice(wanted);
      if (!price) return json({ error: 'The Breadmaker Hub is not on sale yet.' }, 400);
    } else {
      const found = await tierPrice(program, tier);
      price = found ? { ...pickAmount(found, wanted), label: found.label } : null;
    }
    if (!price) return json({ error: 'That support level is not on sale.' }, 400);

    const txRef = newTxRef(program, tier);

    const { error: insertError } = await db.from('payments').insert({
      tx_ref: txRef,
      provider: 'flutterwave',
      application_id: applicationId,
      course_id: courseId,
      program,
      tier,
      email,
      name,
      phone: phone || null,
      amount_minor: price.price_minor,
      currency: price.currency,
      status: 'pending',
    });
    if (insertError) throw insertError;

    // Billing runs through Lago when it is configured: one invoice per purchase on the Breadmaker
    // billing entity, paid through Lago's Flutterwave link. The payment is already recorded above.
    if (lagoEnabled()) {
      try {
        const externalCustomerId = await upsertCustomer({ email, name, phone, currency: price.currency });
        const { invoice, link: lagoLink } = await createInvoiceWithLink({
          externalCustomerId,
          // A Lago add-on has one currency, so dollar purchases get their own.
          addOnCode: `bm-${program}-${tier}${price.currency === 'USD' ? '-usd' : ''}`.slice(0, 64),
          label: price.label || `Breadmaker ${program} ${tier}`,
          amountMinor: price.price_minor,
          currency: price.currency,
        });
        if (!lagoLink) throw new Error('Lago returned no payment link');
        await db
          .from('payments')
          .update({ provider: 'lago-flutterwave', lago_invoice_id: invoice.lago_id, lago_invoice_number: invoice.number ?? null, lago_customer_id: externalCustomerId, updated_at: new Date().toISOString() })
          .eq('tx_ref', txRef);
        return json({ txRef, link: lagoLink, amountMinor: price.price_minor, currency: price.currency });
      } catch (lagoFailure) {
        // Never lose a sale to a billing outage: fall back to the direct Flutterwave link below.
        console.error('flutterwave-checkout: Lago failed, using direct Flutterwave', lagoFailure);
      }
    }

    const checkout = await flutterwave<{ status: string; data?: { link?: string } }>('/payments', {
      method: 'POST',
      body: JSON.stringify({
        tx_ref: txRef,
        amount: (price.price_minor / 100).toFixed(2),
        currency: price.currency,
        redirect_url: `${siteUrl()}${redirectPath.startsWith('/') ? redirectPath : `/${redirectPath}`}`,
        payment_options: 'card,banktransfer,ussd',
        customer: { email, name: name || email, phonenumber: phone || undefined },
        customizations: {
          title: price.label || `Breadmaker ${program}`,
          description: `Breadmaker ${program} — ${tier}`,
        },
        meta: { program, tier, application_id: applicationId },
      }),
    });

    const link = checkout?.data?.link;
    if (!link) {
      await db.from('payments').update({ status: 'failed', failure_reason: 'No checkout link returned', updated_at: new Date().toISOString() }).eq('tx_ref', txRef);
      return json({ error: 'Flutterwave did not return a checkout link.' }, 502);
    }

    return json({ txRef, link, amountMinor: price.price_minor, currency: price.currency });
  } catch (error) {
    console.error('flutterwave-checkout failed', error);
    return json({ error: (error as Error).message ?? 'Checkout could not be started.' }, 500);
  }
});
