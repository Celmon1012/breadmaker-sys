// Shared helpers for the Business Leak Test: the result email and the lead webhook.
//
// Env (edge-functions container): RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY;
// optional N8N_LEAK_WEBHOOK_URL and N8N_LEAK_WEBHOOK_SECRET (leads are pushed there for
// the email and WhatsApp nurture sequence), optional KUMODA_LEAD_WEBHOOK_URL (leads are added to
// the Kumoda pipeline), PUBLIC_SITE_URL, LEAK_TEST_FROM.
import { admin, env, siteUrl } from './flutterwave.ts';

export type LeakEvent = 'submitted' | 'paid';

interface Submission {
  id: string;
  access_token: string;
  name: string;
  email: string;
  whatsapp: string;
  profile: Record<string, string>;
  total: number;
  band: string;
  archetype: string;
  leakiest: string;
  owner_dependence: number;
  paid_tier: string | null;
  code: string | null;
  created_at: string;
}

/** The launch discount on the report, from breadmaker.leak_test_prices. */
interface Offer {
  pct: number;
  endsAt: Date;
}

const BAND_LABEL: Record<string, string> = {
  firefighting: 'Firefighting',
  surviving: 'Surviving',
  stabilising: 'Stabilising',
  scaling: 'Scaling',
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);

const FROM = () => env('LEAK_TEST_FROM', 'Breadmaker Systems <academy@breadmakersystems.com>');

function emailFor(event: LeakEvent, s: Submission, offer: Offer | null) {
  const base = siteUrl();
  const query = `s=${s.id}&t=${s.access_token}`;
  const name = escapeHtml(s.name.split(' ')[0] || 'there');
  const shell = (heading: string, body: string, ctaLabel: string, ctaHref: string) => `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e1b16">
      <p style="font-size:14px;font-weight:600;color:#A24712;margin:0 0 16px">Breadmaker Systems</p>
      <h1 style="font-size:26px;font-weight:700;line-height:1.15;letter-spacing:-0.02em;margin:0 0 16px">${heading}</h1>
      ${body}
      <p style="margin:28px 0"><a href="${ctaHref}" style="background:#A24712;color:#fff;text-decoration:none;padding:14px 26px;border-radius:999px;display:inline-block;font-weight:600">${ctaLabel}</a></p>
      <p style="font-size:13px;color:#6b665c;line-height:1.6">This is a self-assessment, not a financial or legal audit. You are getting this email because you took the Business Leak Test and agreed to hear from us. Reply STOP any time and we will stop.</p>
    </div>`;

  if (event === 'paid') {
    return {
      subject: 'Your Business Leak Test report is ready',
      html: shell(
        `Your full report is ready, ${name}.`,
        `<p style="line-height:1.6">It has your six-pillar chart, every leak ranked with what it means, a 30-day plan for your top two, and how to cover your archetype's blind spot. Open it, answer three short questions about your business, and we will write a plan specific to you. Use <strong>Download PDF</strong> to keep a copy.</p>${
          s.paid_tier === 'report_call'
            ? '<p style="line-height:1.6">Your 30-minute review call is included. Book it from your report. Because your report includes a call, we read your personal plan before you see it, so it may take up to one business day to appear.</p>'
            : ''
        }`,
        'Open your report',
        `${base}/leak-test/report?${query}`,
      ),
      text: `Your full report is ready: ${base}/leak-test/report?${query}`,
    };
  }
  return {
    subject: `Your Business Leak Test result: ${s.total}/100`,
    html: shell(
      `You scored ${s.total}/100, ${name}.`,
      `<p style="line-height:1.6">Band: <strong>${escapeHtml(BAND_LABEL[s.band] ?? s.band)}</strong><br>Archetype: <strong>${escapeHtml(s.archetype)}</strong><br>Biggest leak: <strong>${escapeHtml(s.leakiest)}</strong></p>
       <p style="line-height:1.6">The full report ranks every leak, explains it in plain language and gives you a 30-day plan for the top two.</p>${
         offer
           ? `<p style="line-height:1.6"><strong>${offer.pct}% off the report until ${offer.endsAt.toUTCString()}.</strong> The discount is applied automatically at checkout from this link.</p>`
           : ''
       }`,
      'See your result',
      `${base}/leak-test/result?${query}`,
    ),
    text: `You scored ${s.total}/100 (${BAND_LABEL[s.band] ?? s.band}). Archetype: ${s.archetype}. Biggest leak: ${s.leakiest}.${offer ? ` ${offer.pct}% off the report until ${offer.endsAt.toUTCString()}.` : ''} ${base}/leak-test/result?${query}`,
  };
}

async function sendEmail(to: string, message: { subject: string; html: string; text: string }) {
  if (!env('RESEND_API_KEY')) {
    console.warn('leaktest: RESEND_API_KEY is not set, email skipped');
    return;
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM(), to, ...message }),
  });
  if (!response.ok) throw new Error(`Resend ${response.status}: ${await response.text()}`);
}

async function pushToWebhook(event: LeakEvent, s: Submission, offer: Offer | null) {
  const url = env('N8N_LEAK_WEBHOOK_URL');
  if (!url) return;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (env('N8N_LEAK_WEBHOOK_SECRET')) headers['x-webhook-secret'] = env('N8N_LEAK_WEBHOOK_SECRET');
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      event,
      name: s.name,
      email: s.email,
      whatsapp: s.whatsapp,
      profile: s.profile,
      score: s.total,
      band: s.band,
      archetype: s.archetype,
      biggest_leak: s.leakiest,
      owner_dependence: s.owner_dependence,
      paid_tier: s.paid_tier,
      code: s.code,
      offer_pct: offer?.pct ?? 0,
      offer_ends_at: offer?.endsAt.toISOString() ?? null,
      result_url: `${siteUrl()}/leak-test/result?s=${s.id}&t=${s.access_token}`,
    }),
  });
  if (!response.ok) throw new Error(`Webhook ${response.status}`);
}

/** The wording of the tick box on the test form; sent to Kumoda as the consent evidence. */
const CONSENT_TEXT =
  'I agree that Breadmaker Systems (Restart Integrated Systems Ltd.) may store my answers and contact details and send me my result and related emails and WhatsApp messages about it.';

/**
 * Adds the lead to the Kumoda pipeline (workspace "Breadmaker") through its lead-form webhook.
 *
 * KUMODA_LEAD_WEBHOOK_URL is the form's URL from Kumoda -> Leads -> Lead forms. The Idempotency-Key makes
 * a retry (or the "paid" event) safe: a repeat submission adds a note to the same pipeline card
 * and never creates a second one. Retries a few times, because this runs once per result.
 */
async function pushToKumoda(event: LeakEvent, s: Submission, offer: Offer | null) {
  const url = env('KUMODA_LEAD_WEBHOOK_URL');
  if (!url) return;

  const hasPhone = Boolean(s.whatsapp?.trim());
  const body = JSON.stringify({
    event,
    name: s.name,
    email: s.email,
    phone: s.whatsapp,
    score: `${s.total}/100`,
    band: BAND_LABEL[s.band] ?? s.band,
    archetype: s.archetype,
    biggest_leak: s.leakiest,
    owner_dependence: s.owner_dependence,
    profile: s.profile,
    report: s.paid_tier ? (s.paid_tier === 'report_call' ? 'Paid: report + call' : 'Paid: report') : 'Free result only',
    partner_code: s.code,
    offer: offer ? `${offer.pct}% off until ${offer.endsAt.toUTCString()}` : null,
    result_url: `${siteUrl()}/leak-test/result?s=${s.id}&t=${s.access_token}`,
    // Extra tags on top of the form's own (e.g. "leak-test"); a paid result is easy to filter.
    tags: event === 'paid' ? ['leak-test-paid'] : [],
    consent_email: true,
    consent_whatsapp: hasPhone,
    consent_text: CONSENT_TEXT,
    submission_id: `leak-${s.id}-${event}`,
  });

  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Idempotency-Key': `leak-${s.id}-${event}` },
        body,
        signal: AbortSignal.timeout(8000),
      });
      // 4xx other than rate limiting will not get better by retrying.
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

/** The report's launch discount while its window (from the result date) is still open. */
async function currentOffer(s: Submission): Promise<Offer | null> {
  const { data } = await admin()
    .from('leak_test_prices')
    .select('discount_pct, discount_hours')
    .eq('tier', 'report')
    .eq('active', true)
    .maybeSingle();
  if (!data || data.discount_pct <= 0) return null;
  const endsAt = new Date(new Date(s.created_at).getTime() + data.discount_hours * 3_600_000);
  return endsAt.getTime() > Date.now() ? { pct: data.discount_pct, endsAt } : null;
}

/**
 * Sends the result email and pushes the lead to the nurture webhook, once per
 * event. The "claim" update means two calls at the same moment (the verify
 * endpoint and the webhook) cannot both send.
 */
export async function notifyLead(submissionId: string, event: LeakEvent) {
  const db = admin();
  const column = event === 'paid' ? 'report_notified_at' : 'notified_at';
  const { data: claimed, error } = await db
    .from('leak_test_submissions')
    .update({ [column]: new Date().toISOString() })
    .eq('id', submissionId)
    .is(column, null)
    .select('id, access_token, name, email, whatsapp, profile, total, band, archetype, leakiest, owner_dependence, paid_tier, code, created_at')
    .maybeSingle();
  if (error) throw error;
  if (!claimed) return { sent: false, reason: 'already-sent' as const };

  const submission = claimed as Submission;
  const offer = event === 'submitted' ? await currentOffer(submission) : null;
  const results = await Promise.allSettled([
    sendEmail(submission.email, emailFor(event, submission, offer)),
    pushToWebhook(event, submission, offer),
    pushToKumoda(event, submission, offer),
  ]);
  const failures = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
  for (const failure of failures) console.error('leaktest notify failed', event, submissionId, failure.reason);

  // Let a later retry try again if nothing went out at all.
  if (failures.length === results.length) {
    await db.from('leak_test_submissions').update({ [column]: null }).eq('id', submissionId);
    return { sent: false, reason: 'failed' as const };
  }
  return { sent: true as const };
}
