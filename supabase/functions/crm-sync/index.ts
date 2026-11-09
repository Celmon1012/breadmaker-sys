// Pushes queued site submissions into Evo CRM. Run every minute by pg_cron (migration 43).
//
//   POST (header x-cron-secret: <CRON_SECRET>)  ->  { processed, failed, waiting }
//
// breadmaker.crm_outbox is filled by database triggers on every form's table, so no form needs
// editing. A row that fails is retried with a growing delay (up to 8 tries) and its last error is
// kept on the row, so a CRM outage loses nothing. Re-sending a row is safe: contacts are matched
// by email and deal cards by contact, so nothing is duplicated.
//
// Env: CRON_SECRET, CRM_API_URL, CRM_SERVICE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { serve } from 'https://deno.land/std@0.177.1/http/server.ts';
import { admin, env, json } from '../_shared/flutterwave.ts';
import { ensureItem, upsertContact, type ContactPlan, type ItemPlan } from '../_shared/crm.ts';

type Row = { id: number; source_table: string; source_id: string; event: 'insert' | 'update'; payload: Record<string, any>; attempts: number; created_at: string };
type Plan = { contact: ContactPlan; item?: ItemPlan } | null;

const PILLARS = ['offer', 'sales', 'operations', 'cash', 'team', 'tech'];
const BATCH = 40;
const MAX_ATTEMPTS = 8;

const day = (value: unknown) => (value ? String(value).slice(0, 10) : undefined);
const text = (value: unknown, max = 500) => {
  const s = String(value ?? '').trim();
  return s ? s.slice(0, max) : undefined;
};
const pillar = (value: unknown) => (PILLARS.includes(String(value)) ? String(value) : undefined);

/** Every answer on an application, as "question: answer" lines, since each programme asks different things. */
function summariseAnswers(answers: unknown): string | undefined {
  if (!answers || typeof answers !== 'object') return undefined;
  const lines = Object.entries(answers as Record<string, unknown>)
    .map(([key, value]) => [key.replace(/[_-]+/g, ' '), String(value ?? '').trim()] as const)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}: ${value}`);
  return lines.length ? lines.join('\n').slice(0, 1500) : undefined;
}

function plan(row: Row): Plan {
  const p = row.payload;
  const email = String(p.email ?? '').trim();
  if (!email) return null;
  const name = String(p.name ?? '').trim();
  const base = { email, name };

  switch (row.source_table) {
    case 'leads': {
      const subscribed = !!p.newsletter_consented_at;
      const unsubscribed = !!p.unsubscribed_at;
      const fromLeakTest = p.source === 'leak-test';
      return {
        contact: {
          ...base,
          firstTouch: { lead_channel: fromLeakTest ? 'leak_test' : 'newsletter', lead_source: text(p.source, 80) },
          attrs: {
            lifecycle_stage: 'subscriber',
            biggest_leak: pillar(p.pillar),
            newsletter_subscribed: subscribed && !unsubscribed,
            newsletter_consented_at: day(p.newsletter_consented_at),
            newsletter_unsubscribed: unsubscribed,
          },
          labels: unsubscribed ? ['unsubscribed'] : subscribed ? ['newsletter'] : [],
          removeLabels: unsubscribed ? ['newsletter'] : [],
        },
        // The Leak Test makes its own card, so a guide signup only gets one when they ticked the newsletter box.
        item:
          row.event === 'insert' && subscribed && !fromLeakTest
            ? { pipeline: 'marketing', stage: 'Lead', fields: { entry_point: 'newsletter', source_record_id: row.source_id } }
            : undefined,
      };
    }

    case 'contact_messages':
      return {
        contact: {
          ...base,
          firstTouch: { lead_channel: 'contact_form', lead_source: 'contact' },
          attrs: { lifecycle_stage: 'lead', business_name: text(p.company, 120) },
          labels: ['contact-form'],
        },
        item: {
          pipeline: 'sales',
          stage: 'New Lead',
          fields: { entry_point: 'contact_form', message: text(p.message, 1000), source_record_id: row.source_id },
        },
      };

    case 'applications': {
      const status = String(p.status ?? 'new');
      const program = text(p.program, 40);
      const answers = (p.answers ?? {}) as Record<string, unknown>;
      const stage = ['paid', 'enrolled'].includes(status) ? 'Closing' : ['accepted', 'invoiced'].includes(status) ? 'Proposal' : status === 'reviewed' ? 'Qualification' : 'New Lead';
      return {
        contact: {
          ...base,
          phone: text(p.phone, 40),
          firstTouch: { lead_channel: 'application', lead_source: `application:${program ?? 'general'}` },
          attrs: {
            lifecycle_stage: ['paid', 'enrolled'].includes(status) ? 'customer' : 'applicant',
            interest_program: program,
            application_program: program,
            application_tier: text(p.tier, 40),
            application_status: status,
            applied_at: row.event === 'insert' ? day(p.created_at) : undefined,
            business_name: text(p.company, 120),
            whatsapp: text(p.phone, 40),
            business_industry: text(answers.industry, 120),
            team_size: text(answers.team_size, 60),
            revenue_band: text(answers.revenue_band ?? answers.revenue, 60),
            main_goal: text(answers.main_goal ?? answers.goal, 300),
          },
          labels: [`applied-${program ?? 'general'}`],
        },
        item: {
          pipeline: 'sales',
          stage,
          advance: true,
          // Declined applications keep their card where it is; the field records why it stopped.
          create: status !== 'declined',
          fields: {
            entry_point: 'application',
            program,
            tier: text(p.tier, 40),
            application_status: status,
            answers_summary: summariseAnswers(p.answers),
            source_record_id: row.source_id,
          },
        },
      };
    }

    case 'cohort_waitlist': {
      const program = text(p.program, 40);
      return {
        contact: {
          ...base,
          phone: text(p.phone, 40),
          firstTouch: { lead_channel: 'waitlist', lead_source: `waitlist:${program ?? 'general'}` },
          attrs: { lifecycle_stage: 'lead', interest_program: program, whatsapp: text(p.phone, 40) },
          labels: ['waitlist'],
        },
        item: { pipeline: 'marketing', stage: 'Nurturing', fields: { entry_point: 'waitlist', program, message: text(p.note, 500), source_record_id: row.source_id } },
      };
    }

    case 'leak_test_submissions': {
      const profile = (p.profile ?? {}) as Record<string, unknown>;
      const paidTier = text(p.paid_tier, 20);
      const score = typeof p.total === 'number' ? p.total : undefined;
      const bought = row.event === 'update' && paidTier;
      return {
        contact: {
          ...base,
          phone: text(p.whatsapp, 40),
          firstTouch: { lead_channel: 'leak_test', lead_source: 'leak-test' },
          attrs: {
            lifecycle_stage: paidTier ? 'customer' : 'lead',
            biggest_leak: pillar(p.leakiest),
            leak_test_score: score,
            leak_test_band: text(p.band, 60),
            leak_test_archetype: text(p.archetype, 80),
            leak_owner_dependence: typeof p.owner_dependence === 'number' ? p.owner_dependence : undefined,
            leak_report_tier: paidTier,
            leak_test_taken_at: day(p.created_at),
            business_industry: text(profile.industry, 120),
            business_age: text(profile.business_age, 60),
            team_size: text(profile.team_size, 60),
            revenue_band: text(profile.revenue_band, 60),
            main_goal: text(profile.main_goal, 300),
            whatsapp: text(p.whatsapp, 40),
          },
          labels: paidTier ? ['leak-test', `leak-${paidTier}`] : ['leak-test'],
        },
        // A taken test is a nurture lead; a bought report moves it on, and one with a call goes to sales.
        item:
          bought && paidTier === 'report_call'
            ? { pipeline: 'sales', stage: 'Qualification', advance: true, fields: { entry_point: 'leak_test_call', leak_score: score, leak_band: text(p.band, 60), source_record_id: row.source_id } }
            : bought
              ? { pipeline: 'marketing', stage: 'Qualified', advance: true, fields: { entry_point: 'leak_test_report', leak_score: score, leak_band: text(p.band, 60), source_record_id: row.source_id } }
              : { pipeline: 'marketing', stage: 'Nurturing', fields: { entry_point: 'leak_test', leak_score: score, leak_band: text(p.band, 60), source_record_id: row.source_id } },
      };
    }

    case 'partner_applications': {
      const status = String(p.status ?? 'new');
      return {
        contact: {
          ...base,
          phone: text(p.phone, 40),
          firstTouch: { lead_channel: 'partner_application', lead_source: 'prestige-partner' },
          attrs: {
            lifecycle_stage: status === 'approved' ? 'partner' : 'lead',
            business_name: text(p.business, 120),
            partner_needs: text(p.needs, 1000),
            whatsapp: text(p.phone, 40),
          },
          labels: ['partner-applicant'],
        },
        item: {
          pipeline: 'sales',
          stage: status === 'approved' ? 'Proposal' : 'New Lead',
          advance: true,
          create: status !== 'declined',
          fields: { entry_point: 'partner_application', program: 'prestige-partner', needs: text(p.needs, 1000), application_status: status, source_record_id: row.source_id },
        },
      };
    }

    case 'system_interest': {
      const system = text(p.system_id, 80);
      return {
        contact: {
          ...base,
          firstTouch: { lead_channel: 'system_interest', lead_source: `system:${system ?? ''}` },
          attrs: { lifecycle_stage: 'lead', systems_interested: system },
          labels: ['system-interest'],
        },
        item: { pipeline: 'marketing', stage: 'Lead', fields: { entry_point: 'system_interest', message: system, source_record_id: row.source_id } },
      };
    }

    case 'payments': {
      if (p.status !== 'successful') return null;
      const program = text(p.program, 40);
      return {
        contact: {
          ...base,
          phone: text(p.phone, 40),
          firstTouch: { lead_channel: 'purchase', lead_source: `payment:${program ?? 'course'}` },
          attrs: {
            lifecycle_stage: 'customer',
            first_paid_at: day(p.paid_at ?? p.created_at),
            last_payment_program: program,
            last_payment_tier: text(p.tier, 40),
            application_status: program ? 'paid' : undefined,
            whatsapp: text(p.phone, 40),
          },
          labels: ['customer'],
        },
        // Only programme payments get a card; a course or report purchase is already on the contact.
        item: program
          ? { pipeline: 'sales', stage: 'Closing', advance: true, fields: { entry_point: 'payment', program, tier: text(p.tier, 40), application_status: 'paid', source_record_id: row.source_id } }
          : undefined,
      };
    }

    case 'profiles': {
      const full = `${String(p.first_name ?? '').trim()} ${String(p.last_name ?? '').trim()}`.trim();
      return {
        contact: {
          email,
          name: full,
          phone: text(p.phone, 40),
          firstTouch: { lead_channel: 'signup', lead_source: 'academy-signup' },
          attrs: { lifecycle_stage: 'subscriber', signed_up_at: day(p.created_at), whatsapp: text(p.phone, 40) },
          labels: ['learner'],
        },
      };
    }

    case 'lms_enrollments': {
      const paid = p.source === 'purchase';
      return {
        contact: {
          ...base,
          firstTouch: { lead_channel: paid ? 'purchase' : 'signup', lead_source: `course:${text(p.course_title, 60) ?? ''}` },
          attrs: { lifecycle_stage: paid ? 'customer' : 'subscriber', courses_enrolled: text(p.course_title, 80) },
          labels: ['learner'],
        },
      };
    }

    case 'memberships': {
      const ends = p.current_period_end ? new Date(String(p.current_period_end)) : null;
      const active = !!ends && ends.getTime() > Date.now();
      return {
        contact: {
          ...base,
          firstTouch: { lead_channel: 'purchase', lead_source: `membership:${text(p.plan_code, 30) ?? 'hub'}` },
          attrs: {
            lifecycle_stage: 'customer',
            membership_plan: text(p.plan_code, 30),
            membership_ends_at: day(p.current_period_end),
            membership_active: active,
            first_paid_at: p.source === 'purchase' ? day(p.started_at) : undefined,
          },
          labels: active ? ['hub-member'] : ['hub-lapsed'],
          removeLabels: active ? ['hub-lapsed'] : ['hub-member'],
        },
      };
    }

    case 'support_tickets': {
      const open = p.status !== 'resolved';
      return {
        contact: {
          ...base,
          firstTouch: { lead_channel: 'support', lead_source: `support:${text(p.category, 30) ?? 'other'}` },
          attrs: {
            support_open: open,
            support_last_ticket_at: day(p.created_at),
            support_last_subject: text(p.subject, 160),
          },
          labels: open ? ['support-open'] : [],
          removeLabels: open ? [] : ['support-open'],
        },
      };
    }

    default:
      return null;
  }
}

/** How sales-ready a lead looks, 0 to 100. A starting heuristic you can tune; the score only ever rises on a contact. */
function leadScore(row: Row): number | undefined {
  const p = row.payload;
  let score: number;
  switch (row.source_table) {
    case 'payments': return 90;
    case 'partner_applications': score = 60; break;
    case 'applications': score = ['accepted', 'invoiced', 'paid', 'enrolled'].includes(String(p.status)) ? 85 : 55; break;
    case 'contact_messages': score = 45; break;
    case 'leak_test_submissions': {
      score = 25;
      if (typeof p.total === 'number') score += p.total <= 40 ? 20 : p.total <= 60 ? 10 : 0;
      if (typeof p.owner_dependence === 'number' && p.owner_dependence >= 60) score += 10;
      if (p.paid_tier === 'report') score += 25;
      if (p.paid_tier === 'report_call') score += 40;
      break;
    }
    case 'cohort_waitlist': score = 30; break;
    case 'system_interest': score = 15; break;
    case 'leads': score = p.newsletter_consented_at ? 12 : 8; break;
    default: return undefined;
  }
  return Math.min(100, score);
}

const priorityOf = (score: number) => (score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold');

/** First-touch and last-touch campaign data the site recorded for this email (migration 44). */
async function attributionFor(email: string): Promise<Record<string, string>> {
  const { data } = await admin().from('lead_attribution').select('first_touch, last_touch').eq('email', email.toLowerCase()).maybeSingle();
  if (!data) return {};
  const out: Record<string, string> = {};
  const first = (data.first_touch ?? {}) as Record<string, string>;
  const last = (data.last_touch ?? {}) as Record<string, string>;
  const pick = (target: string, value?: string) => { if (value) out[target] = value.slice(0, 200); };
  pick('first_touch_source', first.source); pick('first_touch_medium', first.medium); pick('first_touch_campaign', first.campaign);
  pick('first_touch_referrer', first.referrer); pick('first_touch_landing', first.landing);
  pick('last_touch_source', last.source); pick('last_touch_medium', last.medium); pick('last_touch_campaign', last.campaign);
  return out;
}

/** Emails the owner through Resend. Never throws: an alert failing must not fail the sync. */
async function alertOwner(subject: string, lines: string[]): Promise<void> {
  const key = env('RESEND_API_KEY');
  if (!key) return;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env('BREADMAKER_EMAIL_FROM', 'Breadmaker Academy <academy@breadmakersystems.com>'),
        to: [env('CRM_ALERT_EMAIL', 'adeusuf@restart.ng')],
        subject,
        text: [...lines, '', 'Open the CRM: https://crm.restart.ng'].join('\n'),
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) console.warn('crm-sync: alert email refused', response.status);
  } catch (error) {
    console.warn('crm-sync: alert email failed', (error as Error).message);
  }
}

async function process(row: Row) {
  const result = plan(row);
  if (!result) return;

  const score = leadScore(row);
  if (score !== undefined) {
    result.contact.attrs.lead_score = score;
    result.contact.attrs.lead_priority = priorityOf(score);
    // Tasks need a user, which the service token lacks, so a label marks who to call first.
    if (score >= 70) result.contact.labels = [...(result.contact.labels ?? []), 'hot-lead'];
  }
  const touches = await attributionFor(result.contact.email);
  // First-touch fields are written once; last-touch fields follow the latest campaign.
  const firstTouch = Object.fromEntries(Object.entries(touches).filter(([k]) => k.startsWith('first_touch_')));
  const lastTouch = Object.fromEntries(Object.entries(touches).filter(([k]) => k.startsWith('last_touch_')));
  result.contact.firstTouch = { ...(result.contact.firstTouch ?? {}), ...firstTouch };
  Object.assign(result.contact.attrs, lastTouch);

  const saved = await upsertContact(result.contact);
  if (result.item) await ensureItem(saved.id, result.item);

  // A lead that just turned hot: tell the owner, once. (The label was added with the contact above.)
  const nowHot = saved.after.lead_priority === 'hot';
  const wasHot = saved.before.lead_priority === 'hot';
  // History being backfilled is not news, so only fresh rows send an email.
  const fresh = Date.now() - new Date(row.created_at).getTime() < 24 * 3600_000;
  if (nowHot && !wasHot && fresh) {
    const who = result.contact.name || result.contact.email;
    const why = `${row.source_table.replace(/_/g, ' ')}${saved.after.leak_test_score !== undefined ? `, Leak Test ${saved.after.leak_test_score}/100` : ''}`;
    await alertOwner(`Hot lead: ${who}`, [
      `${who} <${result.contact.email}> just became a hot lead (score ${saved.after.lead_score}).`,
      `Entry point: ${why}.`,
      saved.after.first_touch_source ? `First touch: ${saved.after.first_touch_source}${saved.after.first_touch_campaign ? ` / ${saved.after.first_touch_campaign}` : ''}.` : '',
    ].filter(Boolean));
  }
}

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  const secret = env('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'Not authorised.' }, 401);
  if (!env('CRM_API_URL') || !env('CRM_SERVICE_TOKEN')) return json({ error: 'CRM_API_URL and CRM_SERVICE_TOKEN are not set.' }, 503);

  const db = admin();
  const { data: rows, error } = await db
    .from('crm_outbox')
    .select('id, source_table, source_id, event, payload, attempts, created_at')
    .is('sent_at', null)
    .lt('attempts', MAX_ATTEMPTS)
    .lte('next_attempt_at', new Date().toISOString())
    // Give the browser a moment to record campaign data (record_touch) after a form is sent.
    .lte('created_at', new Date(Date.now() - 20_000).toISOString())
    .order('id', { ascending: true })
    .limit(BATCH);
  if (error) {
    console.error('crm-sync: could not read the outbox', error);
    return json({ error: 'Could not read the outbox.' }, 500);
  }

  let processed = 0;
  let failed = 0;
  for (const row of (rows ?? []) as Row[]) {
    try {
      await process(row);
      await db.from('crm_outbox').update({ sent_at: new Date().toISOString(), last_error: null }).eq('id', row.id);
      processed += 1;
    } catch (err) {
      failed += 1;
      const attempts = row.attempts + 1;
      const message = (err as Error).message?.slice(0, 500) ?? 'unknown error';
      console.error('crm-sync', row.source_table, row.source_id, message);
      // 2, 8, 18 ... minutes: a CRM restart is ridden out without hammering it.
      const delayMinutes = attempts * attempts * 2;
      await db
        .from('crm_outbox')
        .update({ attempts, last_error: message, next_attempt_at: new Date(Date.now() + delayMinutes * 60_000).toISOString() })
        .eq('id', row.id);
    }
  }

  const { count } = await db.from('crm_outbox').select('id', { count: 'exact', head: true }).is('sent_at', null).lt('attempts', MAX_ATTEMPTS);

  // Health: rows stuck for 15 minutes, or given up on, mean leads are not reaching the CRM. Email once an hour.
  const stuckBefore = new Date(Date.now() - 15 * 60_000).toISOString();
  const [{ count: stuck }, { count: gaveUp }] = await Promise.all([
    db.from('crm_outbox').select('id', { count: 'exact', head: true }).is('sent_at', null).lt('created_at', stuckBefore),
    db.from('crm_outbox').select('id', { count: 'exact', head: true }).is('sent_at', null).gte('attempts', MAX_ATTEMPTS),
  ]);
  if ((stuck ?? 0) > 0 || (gaveUp ?? 0) > 0) {
    const { data: state } = await db.from('crm_sync_state').select('value').eq('key', 'stuck_alert').maybeSingle();
    const last = Number((state?.value as { at?: number } | undefined)?.at ?? 0);
    if (Date.now() - last > 3600_000) {
      const { data: sample } = await db.from('crm_outbox').select('source_table, attempts, last_error').is('sent_at', null).order('id', { ascending: true }).limit(1);
      await alertOwner('CRM sync is stuck', [
        `${stuck ?? 0} submission(s) have waited more than 15 minutes and ${gaveUp ?? 0} gave up after ${MAX_ATTEMPTS} tries.`,
        sample?.[0] ? `Oldest: ${sample[0].source_table}, ${sample[0].attempts} tries. Last error: ${String(sample[0].last_error ?? 'none').slice(0, 200)}` : '',
        'Nothing is lost: rows stay queued in breadmaker.crm_outbox. Check that the CRM at api-crm.restart.ng is up.',
      ].filter(Boolean));
      await db.from('crm_sync_state').upsert({ key: 'stuck_alert', value: { at: Date.now() }, updated_at: new Date().toISOString() });
    }
  }
  return json({ processed, failed, waiting: count ?? 0 });
});
