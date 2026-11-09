// The tools behind the Breadmaker chat agent (n8n + Claude, replying on WhatsApp through Kumoda).
//
//   POST { tool, args }   header  x-agent-secret: <AGENT_TOOLS_SECRET>
//
//   get_prices                      -> live prices, already formatted ("$297"), one-off or monthly
//   lookup_customer { phone }       -> what we hold for the person writing, found by their WhatsApp number
//   check_cohort                    -> next Launchpad and Foundry start dates and places left
//   create_payment_link { item: hub|launchpad|foundry, name, email, phone }
//                                   -> Flutterwave/Lago link. Programs only for an accepted application on that phone
//   get_call_slots { time_zone? }   -> open Discovery Call times on the self-hosted Cal.com (30 minutes, Google Meet)
//   book_call { name, email, phone, start, practice, years_in_practice, challenge, follow_up_process, source?, notes?, time_zone? }
//                                   -> books it. The Cal.com webhook (cal-webhook) then updates the CRM
//   claim_message { message_id, conversation_id, phone, user_text }
//                                   -> { duplicate: true } when Kumoda delivered this message before
//   log_turn { message_id, reply_text, tools, guards, handed_over, model, latency_ms, error }
//
// Only n8n holds the secret. Nothing here writes to a customer's records: lookups are read-only and the only
// writes are rows in agent_turns. The agent can show a customer only what lookup_customer returns for the number
// that wrote in, so an email typed into a chat cannot be used to read someone else's records.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AGENT_TOOLS_SECRET. Optional: CAL_BASE_URL, CAL_USERNAME, CAL_EVENT_SLUG, CAL_EVENT_TYPE_ID.
import { serve } from 'https://deno.land/std@0.177.1/http/server.ts';
import { admin, corsHeaders, env, json } from '../_shared/flutterwave.ts';

/** Compares two strings without stopping at the first difference. */
function sameSecret(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const PRACTICES = ['Consultant / Advisor', 'Coach / Trainer', 'Lawyer / Solicitor', 'Accountant / Finance Professional', 'Fractional Executive', 'Other Practice'];
const YEARS = ['Less than 1 year', '1–2 years', '2–5 years', '5+ years'];
const SOURCES = ['LinkedIn post', 'The Breadmaker Playbook (downloaded)', 'Referral from someone I know', 'Google / web search', 'Other'];

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase(), maximumFractionDigits: minor % 100 === 0 ? 0 : 2 }).format(minor / 100);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  if (!sameSecret(req.headers.get('x-agent-secret') ?? '', env('AGENT_TOOLS_SECRET'))) return json({ error: 'Not authorised.' }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    // n8n sends { tool, args }. The CRM's HTTP tools send flat fields and name the tool in the URL: ?tool=book_call
    const { tool: bodyTool, args: bodyArgs, ...flat } = body as Record<string, unknown>;
    const tool = String(bodyTool ?? new URL(req.url).searchParams.get('tool') ?? '');
    const args = (bodyArgs ?? flat) as Record<string, unknown>;
    const db = admin();

    if (tool === 'get_prices') {
      const { data, error } = await db.rpc('agent_prices');
      if (error) throw error;
      const price = (row: { price_minor: number; currency: string }) => money(row.price_minor, row.currency);
      return json({
        note: 'All amounts are as shown. Quote only these. Programs and the Leak Test report are one-off payments; only Prestige Partner is monthly.',
        programs: (data.programs ?? []).map((row: any) => ({ program: row.program, level: row.level, price: price(row), one_off: true })),
        leak_test: [
          { item: 'Take the test, see your score, band, archetype and biggest leak', price: 'Free' },
          ...(data.leak_test ?? []).map((row: any) => ({ item: row.label, tier: row.tier, price: price(row), one_off: true })),
        ],
        prestige: (data.prestige ?? []).map((row: any) => ({
          plan: row.plan,
          label: row.label,
          price: price(row),
          billing: row.one_time ? 'one-time, lifetime access' : 'monthly',
          on_sale: row.on_sale,
        })),
      });
    }

    if (tool === 'lookup_customer') {
      const phone = String(args.phone ?? '');
      const { data, error } = await db.rpc('agent_customer_lookup', { p_phone: phone });
      if (error) throw error;
      if (!data?.found) return json({ found: false });
      return json({
        ...data,
        payments: (data.payments ?? []).map((row: any) => ({ ...row, amount: money(row.amount_minor, row.currency), amount_minor: undefined })),
      });
    }

    if (tool === 'check_cohort') {
      const out: Record<string, unknown> = {};
      for (const program of ['launchpad', 'foundry']) {
        const { data, error } = await db.rpc('program_status', { check_program: program });
        if (error) throw error;
        out[program] = {
          accepting: !!data.accepting,
          starts_on: data.starts_on ?? null,
          places_left: data.remaining ?? null,
          on_waitlist: data.waitlist_count ?? 0,
        };
      }
      return json(out);
    }

    if (tool === 'create_payment_link') {
      // Hub membership is self-serve. A program (launchpad, foundry) is paid only after an application was
      // accepted, and only for the number that applied, so a typed email cannot start someone else's payment.
      const what = String(args.item ?? '');
      const email = String(args.email ?? '').trim();
      const name = String(args.name ?? '').trim();
      const phone = String(args.phone ?? '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email) || !name) return json({ error: 'name and a valid email are required.' }, 400);
      let program = 'membership';
      let tier = 'hub';
      let applicationId: string | null = null;
      if (what !== 'hub') {
        if (!['launchpad', 'foundry'].includes(what)) return json({ error: 'item must be hub, launchpad or foundry.' }, 400);
        const { data: apps, error } = await db
          .from('applications')
          .select('id, tier, phone, status')
          .ilike('email', email)
          .eq('program', what)
          .in('status', ['accepted', 'invoiced'])
          .order('created_at', { ascending: false })
          .limit(1);
        if (error) throw error;
        const app = apps?.[0];
        const last9 = (v: string | null | undefined) => String(v ?? '').replace(/\D/g, '').slice(-9);
        if (!app || !last9(phone) || last9(phone) !== last9(app.phone)) {
          return json({ ok: false, reason: 'No accepted application for this number. Do not send a link; offer to hand over or point to the application page.' });
        }
        program = what;
        tier = app.tier;
        applicationId = app.id;
      }
      const response = await fetch(`${env('SUPABASE_URL').replace(/\/$/, '')}/functions/v1/flutterwave-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}` },
        body: JSON.stringify({ program, tier, name, email, phone, applicationId }),
        signal: AbortSignal.timeout(25000),
      });
      const out = await response.json().catch(() => ({}));
      if (!response.ok || !out.link) return json({ ok: false, reason: out.error ?? 'The payment link could not be created.' });
      return json({ ok: true, link: out.link, amount: money(out.amountMinor, out.currency), note: 'Send this link exactly as given. It is for this person only.' });
    }

    // Call booking on the self-hosted Cal.com, through the same public endpoints its booking page uses (no API key).
    // The Discovery Call event asks four questions that must be answered before a booking is accepted.
    if (tool === 'get_call_slots' || tool === 'book_call') {
      const base = (env('CAL_BASE_URL') || 'https://cal.restart.ng').replace(/\/$/, '');
      const calUser = env('CAL_USERNAME') || 'adeusuf';
      const slug = env('CAL_EVENT_SLUG') || 'discovery-call';
      const eventTypeId = Number(env('CAL_EVENT_TYPE_ID') || 3);
      const page = `${base}/${calUser}/${slug}`;
      const timeZone = String(args.time_zone ?? 'Africa/Lagos');
      const label = (iso: string) =>
        new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
      if (tool === 'get_call_slots') {
        const from = new Date();
        const to = new Date(Date.now() + 7 * 86400_000);
        const input = { json: { isTeamEvent: false, usernameList: [calUser], eventTypeSlug: slug, startTime: from.toISOString(), endTime: to.toISOString(), timeZone, rescheduleUid: null, orgSlug: null } };
        const res = await fetch(`${base}/api/trpc/slots/getSchedule?input=${encodeURIComponent(JSON.stringify(input))}`, { signal: AbortSignal.timeout(20000) });
        const out = await res.json().catch(() => ({}));
        const slots = out?.result?.data?.json?.slots;
        if (!res.ok || !slots) return json({ ok: false, reason: 'Could not read the calendar.', booking_page: page });
        const days = Object.entries(slots as Record<string, { time: string }[]>)
          .slice(0, 5)
          .map(([day, list]) => ({ day, times: list.slice(0, 4).map((s) => ({ start: s.time, label: label(s.time) })) }));
        if (!days.length) return json({ ok: true, days: [], note: 'No free times in the next 7 days. Send the booking page.', booking_page: page });
        return json({
          ok: true,
          time_zone: timeZone,
          days,
          questions_needed: ['name', 'email', 'phone (WhatsApp)', 'practice', 'years_in_practice', 'challenge', 'follow_up_process'],
          practice_options: PRACTICES,
          years_in_practice_options: YEARS,
          note: 'Offer two or three of these by their label. Pass the chosen start value unchanged to book_call. Ask the customer the questions first; a booking is refused without them.',
        });
      }
      const email = String(args.email ?? '').trim();
      const name = String(args.name ?? '').trim();
      const startAt = String(args.start ?? '');
      // Accept the option however the model typed it: any dash, any case, extra spaces.
      const norm = (v: string) => v.toLowerCase().replace(/[‐-―-]/g, '-').replace(/\s+/g, ' ').trim();
      const pick = (options: string[], v: unknown) => options.find((o) => norm(o) === norm(String(v ?? ''))) ?? '';
      const practice = pick(PRACTICES, args.practice);
      const years = pick(YEARS, args.years_in_practice);
      const challenge = String(args.challenge ?? '').trim();
      const followUp = String(args.follow_up_process ?? '').trim();
      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email) || !startAt || Number.isNaN(Date.parse(startAt))) return json({ error: 'name, a valid email and start are required.' }, 400);
      if (!PRACTICES.includes(practice)) return json({ error: `practice must be exactly one of: ${PRACTICES.join(' | ')}` }, 400);
      if (!YEARS.includes(years)) return json({ error: `years_in_practice must be exactly one of: ${YEARS.join(' | ')}` }, 400);
      if (challenge.length < 5 || followUp.length < 5) return json({ error: 'challenge and follow_up_process are required: ask the customer.' }, 400);
      const start = new Date(startAt);
      const end = new Date(start.getTime() + 30 * 60_000);
      const source = pick(SOURCES, args.source);
      const res = await fetch(`${base}/api/book/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start: start.toISOString(),
          end: end.toISOString(),
          eventTypeId,
          eventTypeSlug: slug,
          timeZone,
          language: 'en',
          user: calUser,
          metadata: {},
          hasHashedBookingLink: false,
          responses: {
            name,
            email,
            ...(args.phone ? { attendeePhoneNumber: String(args.phone) } : {}),
            location: { value: 'integrations:google:meet', optionValue: '' },
            Practice: practice,
            Durationinpractice: years,
            Challenges: challenge,
            Process: followUp,
            ...(SOURCES.includes(source) ? { 'How-did-you-hear-about-Breadmaker': source } : {}),
            ...(args.notes ? { notes: String(args.notes).slice(0, 500) } : {}),
          },
        }),
        signal: AbortSignal.timeout(30000),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.warn('cal booking refused', res.status, JSON.stringify(out).slice(0, 300));
        return json({ ok: false, reason: 'That time could not be booked. Call get_call_slots again and offer another time.', booking_page: page });
      }
      const meet = out?.metadata?.videoCallUrl ?? out?.videoCallUrl ?? null;
      return json({ ok: true, booked_for: label(start.toISOString()), time_zone: timeZone, meeting_link: meet, note: 'A calendar invitation with the Google Meet link goes to their email.' });
    }

    if (tool === 'claim_message') {
      const messageId = String(args.message_id ?? '');
      if (!messageId) return json({ error: 'message_id is required.' }, 400);
      const { error } = await db.from('agent_turns').insert({
        message_id: messageId,
        conversation_id: String(args.conversation_id ?? ''),
        phone: String(args.phone ?? ''),
        user_text: String(args.user_text ?? '').slice(0, 4000),
      });
      if (error?.code === '23505') return json({ duplicate: true });
      if (error) throw error;
      return json({ duplicate: false });
    }

    if (tool === 'log_turn') {
      const messageId = String(args.message_id ?? '');
      if (!messageId) return json({ error: 'message_id is required.' }, 400);
      const { error } = await db
        .from('agent_turns')
        .update({
          reply_text: String(args.reply_text ?? '').slice(0, 4000),
          tools: Array.isArray(args.tools) ? args.tools : [],
          guards: typeof args.guards === 'object' && args.guards ? args.guards : {},
          handed_over: args.handed_over === true,
          model: String(args.model ?? '').slice(0, 80),
          latency_ms: Number.isFinite(Number(args.latency_ms)) ? Math.round(Number(args.latency_ms)) : null,
          error: String(args.error ?? '').slice(0, 1000),
        })
        .eq('message_id', messageId);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: `Unknown tool "${tool}".` }, 400);
  } catch (error) {
    console.error('agent-tools failed', error);
    return json({ error: (error as Error).message ?? 'The tool failed.' }, 500);
  }
});
