// Lago billing for Breadmaker payments.
//
// Lago (billing-api.restart.ng, our patched build) is the invoice ledger. Each purchase becomes a
// one-off invoice on the Breadmaker billing entity, Lago's Flutterwave connector produces the payment
// link, and Lago tells us when the invoice is paid. The price still comes from the database.
//
// Env (edge-functions container): LAGO_API_KEY, LAGO_BREADMAKER_ENTITY_CODE, LAGO_WEBHOOK_HMAC_KEY;
// optional LAGO_API_URL (default https://billing-api.restart.ng), LAGO_BREADMAKER_PROVIDER_CODE
// (the Flutterwave integration code in Lago; default "flutterwave").
//
// Checkout uses Lago only when LAGO_API_KEY and LAGO_BREADMAKER_ENTITY_CODE are both set. With either
// missing it falls back to the direct Flutterwave link, so this can be switched on per environment.

const env = (key: string, fallback = '') => Deno.env.get(key) || fallback;

export const lagoApi = () => env('LAGO_API_URL', 'https://billing-api.restart.ng').replace(/\/$/, '');
export const lagoEntity = () => env('LAGO_BREADMAKER_ENTITY_CODE');
export const lagoEnabled = () => Boolean(env('LAGO_API_KEY') && lagoEntity());

/** Lago customers created by this site carry this prefix, so shared webhooks can tell them apart. */
export const LAGO_CUSTOMER_PREFIX = 'bm-';

export class LagoError extends Error {
  constructor(message: string, public status: number, public body: unknown) {
    super(message);
  }
}

export async function lago<T = any>(path: string, init: { method?: string; body?: unknown; allow404?: boolean } = {}): Promise<T | null> {
  const method = init.method ?? 'GET';
  const response = await fetch(`${lagoApi()}/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${env('LAGO_API_KEY')}`, 'Content-Type': 'application/json' },
    // Lago's Rails API rejects a POST that declares JSON but sends no body.
    body: method === 'GET' ? undefined : JSON.stringify(init.body ?? {}),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => null);
  if (response.status === 404 && init.allow404) return null;
  if (!response.ok) throw new LagoError(`Lago ${method} ${path.split('?')[0]} -> ${response.status}`, response.status, body);
  return body as T;
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** One Lago customer per email address, stable across purchases. */
export async function customerExternalId(email: string, currency = 'NGN') {
  // A Lago customer has one currency for life, so dollar payers get a second customer.
  const suffix = currency.toUpperCase() === 'NGN' ? '' : `-${currency.toLowerCase()}`;
  return `${LAGO_CUSTOMER_PREFIX}${(await sha256Hex(email.trim().toLowerCase())).slice(0, 24)}${suffix}`;
}

/** Creates or updates the Lago customer and links it to the Flutterwave connector. */
export async function upsertCustomer(input: { email: string; name: string; phone?: string; currency: string }) {
  const externalId = await customerExternalId(input.email, input.currency);
  await lago('/customers', {
    method: 'POST',
    body: {
      customer: {
        external_id: externalId,
        name: input.name || input.email,
        email: input.email,
        phone: input.phone || undefined,
        currency: input.currency,
        billing_entity_code: lagoEntity(),
        billing_configuration: {
          payment_provider: 'flutterwave',
          payment_provider_code: env('LAGO_BREADMAKER_PROVIDER_CODE', 'flutterwave'),
          // Without sync the provider link is created in a background job and the payment link can fail.
          sync_with_provider: true,
          sync: true,
        },
      },
    },
  });
  return externalId;
}

/** Lago bills one-off invoices from add-ons; the add-on's price is overridden per invoice. */
async function ensureAddOn(code: string, name: string, amountCents: number, currency: string) {
  const existing = await lago(`/add_ons/${encodeURIComponent(code)}`, { allow404: true });
  if (existing) return;
  await lago('/add_ons', { method: 'POST', body: { add_on: { name, code, amount_cents: amountCents, amount_currency: currency } } });
}

export interface LagoInvoice {
  lago_id: string;
  number?: string;
  status?: string;
  payment_status?: string;
  currency?: string;
  total_amount_cents?: number;
  total_due_amount_cents?: number;
  total_paid_amount_cents?: number;
  customer?: { external_id?: string; email?: string };
}

/** Raises the invoice for one purchase and returns it with the Flutterwave payment link. */
export async function createInvoiceWithLink(input: {
  externalCustomerId: string;
  addOnCode: string;
  label: string;
  amountMinor: number;
  currency: string;
}) {
  await ensureAddOn(input.addOnCode, input.label, input.amountMinor, input.currency);
  const created = await lago<{ invoice: LagoInvoice }>('/invoices', {
    method: 'POST',
    body: {
      invoice: {
        external_customer_id: input.externalCustomerId,
        currency: input.currency,
        fees: [{ add_on_code: input.addOnCode, units: 1, unit_amount_cents: input.amountMinor, description: input.label }],
      },
    },
  });
  const invoice = created!.invoice;
  const linked = await lago<{ invoice_payment_details?: { payment_url?: string } }>(`/invoices/${invoice.lago_id}/payment_url`, { method: 'POST' });
  const link = linked?.invoice_payment_details?.payment_url ?? null;
  return { invoice, link };
}

export async function getInvoice(lagoId: string) {
  const body = await lago<{ invoice: LagoInvoice }>(`/invoices/${encodeURIComponent(lagoId)}`, { allow404: true });
  return body?.invoice ?? null;
}

/**
 * Records a payment against an invoice in Lago, so the ledger shows it paid. Best-effort and safe to repeat:
 * Lago refuses a payment on an invoice that is already paid, which is the answer we want in that case.
 */
export async function recordLagoPayment(invoiceId: string, amountCents: number, reference: string) {
  try {
    await lago('/payments', {
      method: 'POST',
      body: { payment: { invoice_id: invoiceId, amount_cents: amountCents, reference, paid_at: new Date().toISOString() } },
    });
    return true;
  } catch (error) {
    console.warn('recordLagoPayment: not recorded', invoiceId, (error as Error).message);
    return false;
  }
}

/** Lago's Flutterwave tx_ref is "<invoice uuid>-<random>"; the invoice id is the first 36 characters. */
export function invoiceIdFromReference(reference: string) {
  const match = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(reference.trim());
  return match ? match[0].toLowerCase() : null;
}

/** Lago signs webhooks with base64(HMAC-SHA256(body, key)) in X-Lago-Signature. */
export async function validLagoSignature(raw: string, signature: string | null) {
  const key = env('LAGO_WEBHOOK_HMAC_KEY');
  if (!key || !signature) return false;
  const hmac = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', hmac, new TextEncoder().encode(raw)));
  const expected = btoa(String.fromCharCode(...mac));
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
