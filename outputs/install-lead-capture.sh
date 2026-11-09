#!/bin/sh
# Installs only the lead-capture edge function. Run INSIDE the edge-functions container terminal.
set -eu
D="${FUNCTIONS_DIR:-/home/deno/functions}"
mkdir -p "$D/lead-capture"
cat > "$D/lead-capture/index.ts" <<'EOF_LEADCAPTURE'
// Saves a lead from the Guides and Tools pages, then pushes it to Kumoda (the Newsletter lead form)
// and, if set, the n8n webhook.
//
//   POST { email, name?, source?, pillar?, consent: true } -> { ok }
//
// Anon callers cannot write breadmaker.leads, so this function (service role) does it. A repeat
// email changes nothing and does not send a second webhook, and someone who unsubscribed is not
// re-added. The unsubscribe link in the payload lets the nurture email include a working opt-out.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, optional KUMODA_NEWSLETTER_WEBHOOK_URL (Kumoda -> Leads ->
// Lead forms -> Newsletter), N8N_LEAK_WEBHOOK_URL, N8N_LEAK_WEBHOOK_SECRET, PUBLIC_SITE_URL.
import { serve } from 'https://deno.land/std@0.177.1/http/server.ts';
import { admin, corsHeaders, env, json, siteUrl } from '../_shared/flutterwave.ts';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const PILLARS = ['offer', 'sales', 'operations', 'cash', 'team', 'tech'];
const CONSENT_TEXT =
  'I agree that Breadmaker Systems (Restart Integrated Systems Ltd.) may store my email and send me guides and updates. I can unsubscribe at any time.';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? '').trim();
    if (!EMAIL.test(email) || email.length > 200) return json({ error: 'Enter a valid email address.' }, 400);
    if (body.consent !== true) return json({ error: 'Please tick the box so we can email you.' }, 400);

    const name = String(body.name ?? '').trim().slice(0, 120);
    if (!name) return json({ error: 'Add your first name so we can greet you.' }, 400);
    const source = String(body.source ?? 'site').trim().slice(0, 80) || 'site';
    const pillar = PILLARS.includes(body.pillar) ? body.pillar : null;

    const db = admin();
    const now = new Date().toISOString();
    // The unique index is on lower(email), which an upsert cannot target, so insert and treat a
    // duplicate (23505) as "already a lead".
    const { data: created, error } = await db
      .from('leads')
      .insert({ email, name, source, pillar, consent_text: CONSENT_TEXT, newsletter_consented_at: now })
      .select('id, unsubscribe_token')
      .maybeSingle();
    if (error && error.code !== '23505') throw error;

    let row = created;
    if (!row) {
      // Already a lead, for example from the Leak Test. Ticking this box is fresh consent to the newsletter,
      // so mark it and send them on, unless they already joined or have unsubscribed. Nothing sends twice.
      const { data: claimed, error: claimError } = await db
        .from('leads')
        .update({ newsletter_consented_at: now, consent_text: CONSENT_TEXT })
        .ilike('email', email.replace(/[\\%_]/g, (c) => `\\${c}`))
        .is('newsletter_consented_at', null)
        .is('unsubscribed_at', null)
        .select('id, unsubscribe_token')
        .maybeSingle();
      if (claimError) throw claimError;
      row = claimed;
    }

    if (row) {
      const lead = { id: row.id as string, email, name, source, pillar, token: row.unsubscribe_token as string };
      const results = await Promise.allSettled([pushToKumoda(lead), pushToWebhook(lead)]);
      for (const r of results) if (r.status === 'rejected') console.error('lead push failed', r.reason);
    }
    return json({ ok: true });
  } catch (error) {
    console.error('lead-capture failed', error);
    return json({ error: 'We could not save that. Please try again.' }, 500);
  }
});

type Lead = { id: string; email: string; name: string; source: string; pillar: string | null; token: string };

const unsubscribeUrl = (token: string) => `${siteUrl()}/unsubscribe?t=${token}`;

/** Adds the contact to Kumoda's Newsletter lead form. The Idempotency-Key makes a retry safe; consent is logged per person. */
async function pushToKumoda(lead: Lead) {
  const url = env('KUMODA_NEWSLETTER_WEBHOOK_URL');
  if (!url) return;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Idempotency-Key': `lead-${lead.id}` },
        body: JSON.stringify({
          email: lead.email,
          name: lead.name,
          source: lead.source,
          biggest_leak: lead.pillar,
          unsubscribe_url: unsubscribeUrl(lead.token),
          consent_email: true,
          consent_text: CONSENT_TEXT,
          submission_id: `lead-${lead.id}`,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (response.ok) return;
      lastError = new Error(`Kumoda ${response.status}: ${(await response.text()).slice(0, 200)}`);
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }
  throw lastError instanceof Error ? lastError : new Error('Kumoda lead push failed');
}

async function pushToWebhook(lead: Lead) {
  const url = env('N8N_LEAK_WEBHOOK_URL');
  if (!url) return;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (env('N8N_LEAK_WEBHOOK_SECRET')) headers['x-webhook-secret'] = env('N8N_LEAK_WEBHOOK_SECRET');
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      event: 'lead',
      name: lead.name,
      email: lead.email,
      source: lead.source,
      biggest_leak: lead.pillar,
      unsubscribe_url: unsubscribeUrl(lead.token),
    }),
  });
  if (!response.ok) throw new Error(`Webhook ${response.status}`);
}
EOF_LEADCAPTURE
echo "wrote lead-capture/index.ts"
echo "Restart the supabase-edge-functions container."
