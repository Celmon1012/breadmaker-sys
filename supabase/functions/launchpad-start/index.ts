// Starts a Launchpad application: opens the applicant's Hub account, drafts their funnel brief, and
// emails (and, through Kumoda, WhatsApps) them a private link to review it.
//
//   POST { application_id }  (header x-cron-secret: <CRON_SECRET>)  ->  { ok, ... }
//
// Called by the database when an application is inserted (migration 49). Safe to call twice: once the
// welcome has gone out (build_jobs.welcomed_at) it does nothing. Each step is best-effort and logged on
// the job, so a failed email never loses the account or the brief.
//
//   1. Account   Creates the Hub user from the application (name, email, phone) with an invite link, or, if
//                the email already has an account, a sign-in link. Links the application to the user.
//   2. Brief     Asks build-brief for the funnel brief. At most 3 Launchpad applications per email a day
//                get a brief, so a script cannot run up model costs.
//   3. Email     The brief link and the "complete your account" link, from the Breadmaker address.
//   4. WhatsApp  Pushes the contact to Kumoda's lead form with the tag launchpad-brief. A Kumoda automation
//                on that tag sends the message (set it up once in Kumoda -> Automations).
//
// Env: CRON_SECRET, RESEND_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY;
// optional PUBLIC_SITE_URL, KUMODA_LEAD_WEBHOOK_URL.
import { serve } from 'https://deno.land/std@0.177.1/http/server.ts';
import { admin, corsHeaders, env, json, siteUrl } from '../_shared/flutterwave.ts';
import { emailHtml, sendMail } from '../_shared/mail.ts';

const clip = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

async function internalCall(fn: string, body: Record<string, unknown>): Promise<{ ok: boolean; data: any }> {
  const response = await fetch(`${env('SUPABASE_URL').replace(/\/$/, '')}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': env('CRON_SECRET'), apikey: env('SUPABASE_ANON_KEY'), Authorization: `Bearer ${env('SUPABASE_ANON_KEY')}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(110000),
  });
  return { ok: response.ok, data: await response.json().catch(() => null) };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  const secret = env('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'Not allowed.' }, 401);

  const body = await req.json().catch(() => ({}));
  const applicationId = clip(body.application_id, 64);
  if (!applicationId) return json({ error: 'Missing application_id.' }, 400);

  const db = admin();
  const { data: application } = await db.from('applications').select('id, program, name, email, phone, user_id, created_at').eq('id', applicationId).maybeSingle();
  if (!application || application.program !== 'launchpad') return json({ error: 'Launchpad application not found.' }, 404);
  const { data: job } = await db.from('build_jobs').select('id, access_token, welcomed_at, brief, log').eq('application_id', applicationId).maybeSingle();
  if (!job) return json({ error: 'No build job for this application.' }, 404);
  if (job.welcomed_at) return json({ ok: true, skipped: 'already welcomed' });

  const log: { at: string; step: string; ok: boolean; detail: string }[] = Array.isArray(job.log) ? [...job.log] : [];
  const note = (step: string, ok: boolean, detail: string) => log.push({ at: new Date().toISOString(), step, ok, detail });
  const email = String(application.email).toLowerCase();
  const site = siteUrl();
  let accountLink = '';
  let existingAccount = false;
  let briefReady = !!job.brief;

  // 1. Account ---------------------------------------------------------------------------------------------
  try {
    const [first, ...rest] = String(application.name).trim().split(/\s+/);
    const meta = { first_name: first ?? '', last_name: rest.join(' '), full_name: application.name };
    const redirectTo = `${site}/dashboard`;
    let link = await db.auth.admin.generateLink({ type: 'invite', email, options: { redirectTo, data: meta } });
    if (link.error && /already|registered|exists/i.test(link.error.message)) {
      link = await db.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo } });
      existingAccount = true;
    }
    if (link.error || !link.data?.user) throw new Error(link.error?.message ?? 'no user returned');
    const userId = link.data.user.id;
    // A member who already has an account does not need an account-completion link; the brief link is enough.
    accountLink = existingAccount ? '' : link.data.properties?.action_link ?? '';
    await db.from('applications').update({ user_id: application.user_id ?? userId }).eq('id', applicationId);
    if (application.phone) await db.from('profiles').update({ phone: application.phone }).eq('id', userId);
    note('account', true, 'Hub account ready and linked to the application');
  } catch (error) {
    note('account', false, (error as Error).message);
  }

  // 2. Brief -----------------------------------------------------------------------------------------------
  if (!briefReady) {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await db.from('applications').select('id', { count: 'exact', head: true }).eq('program', 'launchpad').ilike('email', email).gte('created_at', since);
    if ((count ?? 0) > 3) {
      note('brief', false, 'skipped: more than 3 applications from this email today');
    } else {
      try {
        const result = await internalCall('build-brief', { application_id: applicationId });
        if (!result.ok) throw new Error(result.data?.error ?? 'build-brief failed');
        briefReady = true;
        note('brief', true, 'drafted');
      } catch (error) {
        note('brief', false, (error as Error).message);
      }
    }
  }

  // 3. Email -----------------------------------------------------------------------------------------------
  const briefUrl = `${site}/launchpad/brief/${job.access_token}`;
  let emailed = false;
  if (briefReady) {
    const first = String(application.name).trim().split(/\s+/)[0] || 'there';
    const paragraphs = [
      `Hi ${first}, we have drafted your funnel brief. It names the one problem your funnel solves, the one customer it speaks to, and the page and follow-up built around them.`,
      'Read it, ask for changes if something is off, choose your web address, and when it reads right, pay to build. Paying confirms the brief and starts your build.',
      ...(accountLink ? ['We also opened your Breadmaker Hub account. Use the second link to set your password and see your funnel there.'] : []),
    ];
    const text = `${paragraphs.join('\n\n')}\n\nYour brief: ${briefUrl}${accountLink ? `\n\nComplete your account: ${accountLink}` : ''}`;
    let html = emailHtml('Your funnel brief is ready', paragraphs, { label: 'Read your funnel brief', url: briefUrl });
    if (accountLink) html = html.replace('</div>\n<p style="font-size:13px', `<p style="margin:14px 0 0"><a href="${accountLink}" style="color:#1D6A58;font-weight:600">Complete your Hub account</a></p></div>\n<p style="font-size:13px`);
    emailed = await sendMail(email, 'Your funnel brief is ready', html, text);
    note('email', emailed, emailed ? 'brief link sent' : 'email was not accepted');
  } else {
    note('email', false, 'not sent: no brief yet');
  }

  // 4. WhatsApp through Kumoda ----------------------------------------------------------------------------
  const kumodaUrl = env('KUMODA_LEAD_WEBHOOK_URL');
  if (briefReady && application.phone && kumodaUrl) {
    try {
      const response = await fetch(kumodaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Idempotency-Key': `launchpad-${applicationId}-brief` },
        body: JSON.stringify({
          event: 'launchpad_brief_ready',
          name: application.name,
          email,
          phone: application.phone,
          brief_url: briefUrl,
          tags: ['launchpad-brief'],
          consent_email: true,
          consent_whatsapp: true,
          consent_text: 'The applicant gave this number on their Launchpad application so we can message them about it.',
          submission_id: `launchpad-${applicationId}-brief`,
        }),
        signal: AbortSignal.timeout(8000),
      });
      note('whatsapp', response.ok, response.ok ? 'sent to Kumoda (tag launchpad-brief)' : `Kumoda answered ${response.status}`);
    } catch (error) {
      note('whatsapp', false, (error as Error).message);
    }
  }

  // Only a finished welcome is final; a failed brief leaves the job open for the Studio or a retry.
  await db
    .from('build_jobs')
    .update({ log, welcomed_at: briefReady && emailed ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq('id', job.id);
  return json({ ok: true, brief: briefReady, emailed });
});
