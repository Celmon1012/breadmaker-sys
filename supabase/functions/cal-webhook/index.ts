// Cal.com booking webhook -> Evo CRM.
//
//   POST from Cal.com, header x-cal-signature-256 = hex HMAC-SHA256 of the raw body
//
// A booked, rescheduled or cancelled Discovery Call updates the contact in the CRM and keeps one Sales card for them:
//   booked / rescheduled -> contact labelled "call-booked", card in Sales > Qualification (moved forward only)
//   cancelled            -> label swapped to "call-cancelled", the card stays where it is
// Anything else Cal.com sends is acknowledged and ignored.
//
// The webhook secret is derived, not stored: sha256("cal-webhook:" + AGENT_TOOLS_SECRET), so a leak from Cal.com
// does not expose the agent tools secret. Paste that value into the Cal.com webhook's "Secret" box.
//
// Env: AGENT_TOOLS_SECRET, CRM_API_URL, CRM_SERVICE_TOKEN.
import { serve } from 'https://deno.land/std@0.177.1/http/server.ts';
import { env, json } from '../_shared/flutterwave.ts';
import { ensureItem, upsertContact } from '../_shared/crm.ts';

const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function webhookSecret() {
  const base = env('AGENT_TOOLS_SECRET');
  if (!base) return '';
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`cal-webhook:${base}`)));
}

async function sign(secret: string, body: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
}

function same(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const text = (v: unknown, max: number) => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s.slice(0, max) : undefined;
};

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  const raw = await req.text();
  const secret = await webhookSecret();
  const given = (req.headers.get('x-cal-signature-256') ?? '').toLowerCase();
  if (!secret || !same(given, await sign(secret, raw))) return json({ error: 'Not authorised.' }, 401);

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'Bad JSON.' }, 400);
  }
  const event = String(body?.triggerEvent ?? '');
  if (!['BOOKING_CREATED', 'BOOKING_RESCHEDULED', 'BOOKING_CANCELLED'].includes(event)) return json({ ok: true, ignored: event });

  try {
    const p = body.payload ?? {};
    const answers = p.responses ?? {};
    const answer = (key: string) => {
      const v = answers[key];
      return text(v && typeof v === 'object' && 'value' in v ? v.value : v, 600);
    };
    const attendee = (p.attendees ?? [])[0] ?? {};
    const email = String(answer('email') ?? attendee.email ?? '').toLowerCase();
    if (!email) return json({ ok: true, ignored: 'no attendee email' });
    const name = answer('name') ?? text(attendee.name, 120) ?? email.split('@')[0];
    const phone = answer('attendeePhoneNumber') ?? text(attendee.phoneNumber, 40);
    const cancelled = event === 'BOOKING_CANCELLED';

    const saved = await upsertContact({
      email,
      name,
      phone,
      firstTouch: { lead_channel: 'call_booking', lead_source: 'cal-discovery-call' },
      attrs: cancelled
        ? {}
        : {
            lifecycle_stage: 'lead',
            business_industry: answer('Practice'),
            business_age: answer('Durationinpractice'),
            main_goal: text(answer('Challenges'), 300),
            whatsapp: phone,
          },
      labels: [cancelled ? 'call-cancelled' : 'call-booked'],
      removeLabels: [cancelled ? 'call-booked' : 'call-cancelled'],
    });

    await ensureItem(saved.id, {
      pipeline: 'sales',
      stage: 'Qualification',
      advance: !cancelled,
      create: !cancelled,
      fields: {
        entry_point: 'discovery_call',
        call_status: cancelled ? 'cancelled' : event === 'BOOKING_RESCHEDULED' ? 'rescheduled' : 'booked',
        call_at: text(p.startTime, 40),
        // Only a real link: Cal.com sometimes sends just the location type ("integrations:google:meet").
        call_link: [p.metadata?.videoCallUrl, p.videoCallData?.url, p.location].map((v) => text(v, 300)).find((v) => v?.startsWith('http')),
        follow_up_process: answer('Process'),
        source_record_id: text(p.uid, 80),
      },
    });
    return json({ ok: true, event, contact: saved.id });
  } catch (error) {
    console.error('cal-webhook failed', error);
    // 500 makes Cal.com retry the delivery.
    return json({ error: (error as Error).message ?? 'The update failed.' }, 500);
  }
});
