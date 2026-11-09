// Lago -> Breadmaker: settles a payment when its Lago invoice is paid.
//
// In Lago (Developers -> Webhooks) add a second endpoint:
//   https://db.restart.ng/functions/v1/lago-breadmaker-webhook   (HMAC signature)
// Restart's own lago-webhook ignores invoices for customers whose external id starts with "bm-",
// and this function ignores everyone else's.
//
// Deploy with JWT verification off: Lago cannot send a Supabase JWT, the HMAC signature is the
// authentication. The invoice is re-read from Lago before anyone is enrolled.
//
// Env: LAGO_WEBHOOK_HMAC_KEY, LAGO_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { serve } from 'https://deno.land/std@0.177.1/http/server.ts';
import { json, settleFromLagoInvoice } from '../_shared/flutterwave.ts';
import { getInvoice, LAGO_CUSTOMER_PREFIX, validLagoSignature } from '../_shared/lago.ts';

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const raw = await req.text();
  const algorithm = req.headers.get('X-Lago-Signature-Algorithm');
  if (algorithm && algorithm.toLowerCase() !== 'hmac') return json({ error: 'Configure this webhook with HMAC signatures.' }, 400);
  if (!(await validLagoSignature(raw, req.headers.get('X-Lago-Signature')))) return json({ error: 'Invalid signature.' }, 401);

  try {
    const event = JSON.parse(raw) as { webhook_type?: string; invoice?: { lago_id?: string; customer?: { external_id?: string } } };
    const type = event.webhook_type ?? '';
    const stub = event.invoice;

    // Only Breadmaker customers, and only payment changes. Everything else is acknowledged so Lago does not retry.
    if (type !== 'invoice.payment_status_updated' || !stub?.lago_id || !String(stub.customer?.external_id ?? '').startsWith(LAGO_CUSTOMER_PREFIX)) {
      return json({ ok: true, ignored: type });
    }

    // Do not trust the body for the amount or the status: read the invoice back from Lago.
    const invoice = await getInvoice(stub.lago_id);
    if (!invoice) return json({ ok: true, ignored: 'unknown invoice' });

    const result = await settleFromLagoInvoice(invoice, invoice);
    console.log('lago-breadmaker-webhook', stub.lago_id, JSON.stringify(result));
    return json({ ok: true, ...result });
  } catch (error) {
    console.error('lago-breadmaker-webhook failed', error);
    // 500 so Lago retries: a transient database or Lago error must not lose a paid enrolment.
    return json({ error: (error as Error).message }, 500);
  }
});
