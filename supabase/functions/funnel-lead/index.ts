// Receives the enquiry form of a Launchpad funnel and gets it to the funnel's owner, safely.
//
//   POST /functions/v1/funnel-lead?k=<lead_key>   { name, email?, phone?, message?, consent_whatsapp?, consent_text?, website?,
//                                                    score?, segment?, category_scores?, scorecard? }   (the last four come from a scorecard funnel)
//        -> 200 { ok: true }
//   POST { action: 'drain' }  (header x-cron-secret)  -> delivers whatever is due; run every minute by pg_cron (migration 50)
//
// The enquiry is SAVED FIRST (breadmaker.funnel_leads), then delivered:
//   * the owner has Kumoda connected -> it is posted to their Kumoda lead form (with an idempotency key, so a
//     retry never makes a second contact), carrying the person's explicit WhatsApp consent if they ticked the box;
//   * otherwise the owner is emailed the enquiry.
// A delivery that fails (Kumoda down, rate limited, our own hiccup) is retried with a growing delay for up to
// 8 tries, and when it finally fails the owner is emailed and the row is kept. The visitor always sees success
// once the enquiry is saved. The Kumoda form's address never appears in the public page.
//
// Public, so it defends itself: unknown keys get a flat 404, a filled honeypot field is ignored without telling
// the bot, and each funnel is capped at 100 enquiries an hour and 5 per visitor address every 10 minutes.
//
// Env: CRON_SECRET, RESEND_API_KEY (via the mail helper), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { serve } from 'https://deno.land/std@0.177.1/http/server.ts';
import { admin, corsHeaders, env, json } from '../_shared/flutterwave.ts';
import { emailHtml, sendMail } from '../_shared/mail.ts';

const BACKOFF_MINUTES = [1, 2, 5, 15, 30, 60, 120, 240];
const MAX_ATTEMPTS = BACKOFF_MINUTES.length;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const clip = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const SEGMENTS = ['ready', 'warming', 'early'];
const SEGMENT_LABEL: Record<string, string> = { ready: 'ready now', warming: 'warming up', early: 'early' };

/** A scorecard result from the page, made safe: a score 0 to 100, a known segment, at most 6 category scores. */
function scoreOf(body: Record<string, unknown>) {
  const score = Math.round(Number(body.score));
  if (!Number.isFinite(score) || score < 0 || score > 100) return {};
  const segment = SEGMENTS.includes(String(body.segment)) ? String(body.segment) : undefined;
  const categories: Record<string, number> = {};
  if (body.category_scores && typeof body.category_scores === 'object') {
    for (const [key, value] of Object.entries(body.category_scores as Record<string, unknown>).slice(0, 6)) {
      const n = Math.round(Number(value));
      if (Number.isFinite(n) && n >= 0 && n <= 100) categories[clip(key, 24)] = n;
    }
  }
  return { score, segment, category_scores: Object.keys(categories).length ? categories : undefined, scorecard: clip(body.scorecard, 100) || undefined };
}

const truthy = (value: unknown) => value === true || ['true', '1', 'yes', 'on'].includes(String(value ?? '').toLowerCase());

type Lead = {
  id: string;
  job_id: string;
  payload: {
    name?: string;
    email?: string;
    phone?: string;
    message?: string;
    /** From a scorecard funnel: 0 to 100, the segment it falls in, and the score per category. */
    score?: number;
    segment?: string;
    category_scores?: Record<string, number>;
    scorecard?: string;
  };
  consent_whatsapp: boolean;
  consent_text: string | null;
  source_url: string | null;
  ip: string | null;
  user_agent: string | null;
  attempts: number;
};

type Db = ReturnType<typeof admin>;

async function emailOwner(db: Db, lead: Lead, ownerEmail: string, funnelName: string, why?: string): Promise<boolean> {
  const p = lead.payload;
  const lines = [
    `${p.name || 'Someone'} sent an enquiry through ${funnelName}.`,
    p.email ? `Email: ${p.email}` : '',
    p.phone ? `Phone: ${p.phone}${lead.consent_whatsapp ? ' (agreed to be messaged on WhatsApp)' : ''}` : '',
    p.message ? `Message: ${p.message}` : '',
    p.score !== undefined ? `Scorecard${p.scorecard ? ` (${p.scorecard})` : ''}: ${p.score}%${p.segment ? `, ${SEGMENT_LABEL[p.segment] ?? p.segment}` : ''}` : '',
    why ? `Note: ${why}` : '',
  ].filter(Boolean);
  return sendMail(ownerEmail, `New enquiry: ${p.name || 'a visitor'}`, emailHtml('You have a new enquiry', lines), lines.join('\n'));
}

/** Moves one saved enquiry towards the owner. Returns its new status. Never throws. */
async function deliver(db: Db, lead: Lead): Promise<string> {
  const { data: job } = await db.from('build_jobs').select('id, application_id, outputs').eq('id', lead.job_id).maybeSingle();
  const { data: application } = job ? await db.from('applications').select('name, email, company').eq('id', job.application_id).maybeSingle() : { data: null };
  if (!job || !application) {
    await db.from('funnel_leads').update({ status: 'failed', last_error: 'funnel not found' }).eq('id', lead.id);
    return 'failed';
  }
  const outputs = (job.outputs ?? {}) as Record<string, any>;
  const funnelName = outputs.slug ? `${outputs.slug}` : application.company || application.name;
  const kumodaUrl: string | undefined = outputs.kumoda?.lead_form_url;
  const attempts = lead.attempts + 1;
  const now = new Date().toISOString();

  const giveUp = async (reason: string) => {
    await db.from('funnel_leads').update({ status: 'failed', attempts, last_error: reason }).eq('id', lead.id);
    await emailOwner(db, lead, application.email, funnelName, `We could not add this to Kumoda (${reason}). It is saved, so nothing is lost.`);
    return 'failed';
  };
  const retry = async (reason: string) => {
    if (attempts >= MAX_ATTEMPTS) return giveUp(reason);
    const next = new Date(Date.now() + BACKOFF_MINUTES[attempts - 1] * 60_000).toISOString();
    await db.from('funnel_leads').update({ attempts, last_error: reason, next_attempt_at: next }).eq('id', lead.id);
    return 'pending';
  };

  // No Kumoda: the owner gets the enquiry by email.
  if (!kumodaUrl) {
    const sent = await emailOwner(db, lead, application.email, funnelName);
    if (sent) {
      await db.from('funnel_leads').update({ status: 'emailed', attempts, last_error: null, delivered_at: now }).eq('id', lead.id);
      return 'emailed';
    }
    return retry('the email was not accepted');
  }

  // Kumoda: the same enquiry id is the idempotency key, so retries never create a second contact.
  const p = lead.payload;
  try {
    const response = await fetch(kumodaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Idempotency-Key': lead.id },
      body: JSON.stringify({
        name: p.name,
        email: p.email || undefined,
        phone: p.phone || undefined,
        message: p.message || undefined,
        // Scorecard funnels: the segment becomes a tag the owner can build a journey on; the numbers land on the contact's note.
        ...(p.score !== undefined
          ? {
              tags: ['scorecard', ...(p.segment ? [`scorecard-${p.segment}`] : [])],
              score: p.score,
              segment: p.segment || undefined,
              scorecard: p.scorecard || undefined,
              category_scores: p.category_scores || undefined,
            }
          : {}),
        ...(lead.consent_whatsapp
          ? { opt_in_whatsapp: true, consent_whatsapp: true, consent_text: lead.consent_text || undefined, consent_ip: lead.ip || undefined, consent_user_agent: lead.user_agent || undefined }
          : {}),
        submission_id: lead.id,
        landing_url: lead.source_url || undefined,
        funnel: outputs.slug || undefined,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) {
      await db.from('funnel_leads').update({ status: 'sent', attempts, last_error: null, delivered_at: now }).eq('id', lead.id);
      return 'sent';
    }
    const detail = `Kumoda answered ${response.status}`;
    // Rate limits and server errors are worth retrying; anything else will not get better.
    return response.status === 429 || response.status >= 500 ? retry(detail) : giveUp(detail);
  } catch (error) {
    return retry((error as Error).message || 'could not reach Kumoda');
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const db = admin();
  const body = await req.json().catch(() => ({}));

  // ---- drain: the retry job ------------------------------------------------------------------------------
  if (body.action === 'drain') {
    const secret = env('CRON_SECRET');
    if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'Not allowed.' }, 401);
    const { data: due } = await db
      .from('funnel_leads')
      .select('id, job_id, payload, consent_whatsapp, consent_text, source_url, ip, user_agent, attempts')
      .eq('status', 'pending')
      .lte('next_attempt_at', new Date().toISOString())
      .order('next_attempt_at')
      .limit(25);
    const rows = (due ?? []) as Lead[];
    // Claim them for two minutes so an overlapping run does not deliver the same ones.
    if (rows.length) {
      await db.from('funnel_leads').update({ next_attempt_at: new Date(Date.now() + 2 * 60_000).toISOString() }).in('id', rows.map((row) => row.id));
    }
    const results: Record<string, number> = {};
    for (const row of rows) {
      const status = await deliver(db, row);
      results[status] = (results[status] ?? 0) + 1;
    }
    return json({ ok: true, processed: rows.length, results });
  }

  // ---- a visitor's enquiry -------------------------------------------------------------------------------
  try {
    const key = clip(new URL(req.url).searchParams.get('k') ?? body.key, 64);
    if (!/^[a-f0-9]{32}$/i.test(key)) return json({ error: 'Not found.' }, 404);
    const { data: job } = await db.from('build_jobs').select('id').eq('lead_key', key).maybeSingle();
    if (!job) return json({ error: 'Not found.' }, 404);

    // A bot filled the hidden field: say thanks and drop it.
    if (clip(body.website, 200)) return json({ ok: true });

    const name = clip(body.name, 120);
    const email = clip(body.email, 254).toLowerCase();
    const phone = clip(body.phone, 32);
    const message = clip(body.message, 2000);
    if (!name) return json({ error: 'Please add your name.' }, 400);
    if (!email && !phone) return json({ error: 'Please add an email address or a phone number.' }, 400);
    if (email && !EMAIL.test(email)) return json({ error: 'That email address does not look right.' }, 400);
    if (phone && !/^[+\d][\d\s()-]{5,31}$/.test(phone)) return json({ error: 'That phone number does not look right.' }, 400);

    const ip = clip(req.headers.get('cf-connecting-ip') ?? (req.headers.get('x-forwarded-for') ?? '').split(',')[0], 64) || null;
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const tenMinutesAgo = new Date(Date.now() - 600_000).toISOString();
    const { count: hourly } = await db.from('funnel_leads').select('id', { count: 'exact', head: true }).eq('job_id', job.id).gte('created_at', hourAgo);
    if ((hourly ?? 0) >= 100) return json({ error: 'Too many enquiries just now. Please try again later.' }, 429);
    if (ip) {
      const { count: recent } = await db.from('funnel_leads').select('id', { count: 'exact', head: true }).eq('job_id', job.id).eq('ip', ip).gte('created_at', tenMinutesAgo);
      if ((recent ?? 0) >= 5) return json({ error: 'Too many enquiries just now. Please try again later.' }, 429);
    }

    const consent = truthy(body.consent_whatsapp) && !!phone;
    const { data: saved, error } = await db
      .from('funnel_leads')
      .insert({
        job_id: job.id,
        payload: { name, email: email || undefined, phone: phone || undefined, message: message || undefined, ...scoreOf(body) },
        consent_whatsapp: consent,
        consent_text: consent ? clip(body.consent_text, 400) || null : null,
        source_url: clip(body.source, 500) || clip(req.headers.get('origin') ?? req.headers.get('referer'), 500) || null,
        ip,
        user_agent: clip(req.headers.get('user-agent'), 300) || null,
      })
      .select('id, job_id, payload, consent_whatsapp, consent_text, source_url, ip, user_agent, attempts')
      .single();
    if (error || !saved) throw new Error(error?.message ?? 'could not save the enquiry');

    // Delivered now if possible; if not, the retry job picks it up. The visitor sees success either way.
    await deliver(db, saved as Lead).catch((err) => console.error('funnel-lead deliver', (err as Error).message));
    return json({ ok: true });
  } catch (error) {
    console.error('funnel-lead', (error as Error).message);
    return json({ error: 'Something went wrong. Please try again in a moment.' }, 500);
  }
});
