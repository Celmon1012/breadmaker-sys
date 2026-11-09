// Writes the AI section of a Business Leak Test report, grounded in the business's own data.
//
//   POST { submissionId, token } -> { status }
//
// Runs after the report is unlocked and the three intake answers are saved (the paywall RPC
// save_leak_intake queues it as ai_status = 'pending'). The token proves the caller owns the
// result. The report is generated once and stored; a repeat call while it is generating or
// ready does nothing. Report-only buyers see it at once. Report + call buyers see it after
// the team reviews and releases it in the Studio, and the team is told through the n8n
// webhook (event "ai_review_needed").
//
// Env: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY; optional LEAK_AI_MODEL
// (default claude-sonnet-5-5), N8N_LEAK_WEBHOOK_URL, N8N_LEAK_WEBHOOK_SECRET, PUBLIC_SITE_URL.
import { serve } from 'https://deno.land/std@0.177.1/http/server.ts';
import { admin, corsHeaders, env, json, siteUrl } from '../_shared/flutterwave.ts';
import { LEAK_ANSWER_LABELS, LEAK_AREA_IDS, LEAK_CATALOG, LEAK_QUESTIONS } from '../_shared/leak-questions.ts';

const STALE_MS = 5 * 60 * 1000;

const SYSTEM = `You write the personal section of a Business Leak Test report for a small business owner, mostly in Nigeria.

Rules:
- Use only the facts you are given. Never invent numbers, customers, prices, tools or results.
- Never promise or predict earnings, growth or any outcome. Say what to do, not what it will earn.
- Do not give financial, tax, legal or investment advice. For anything of that kind, say to check with a qualified professional.
- Write in plain, direct language a busy owner can act on. Short sentences. No jargon, no hype, no filler.
- Refer to the owner's own words and answers so it reads as written for this business. Do not quote more than a few words at a time.
- Build on the base plan you are given for the top leaks. Make each action specific to this business, small enough to finish in a day or a week, and say what "done" looks like.
- Reply with one JSON object and nothing else.`;

const SHAPE = `{
  "headline": "one sentence naming the single most important thing for this business",
  "business_snapshot": "2 to 3 sentences describing the business and its situation back to the owner, in their terms",
  "why_these_leaks": [{ "pillar": "pillar id", "why_for_you": "2 sentences on why this leak matters for this business specifically" }],
  "first_week": ["5 concrete actions for the first 7 days, in order"],
  "thirty_day_plan": [{ "week": 1, "focus": "short title", "actions": ["2 to 4 actions"] }],
  "watch_outs": ["2 to 3 risks or traps for this kind of business at this stage"],
  "questions_for_call": ["3 questions worth discussing with a business advisor on a call"]
}
"why_these_leaks" covers the top three leaks, weakest first. "thirty_day_plan" has exactly 4 weeks.`;

const asText = (value: unknown, max = 600) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const asList = (value: unknown, max: number, each = 400) =>
  Array.isArray(value) ? value.map((v) => asText(v, each)).filter(Boolean).slice(0, max) : [];

/** Keeps only the fields the report page reads, so a stray model reply cannot break it. */
function cleanReport(raw: Record<string, unknown>) {
  const why = Array.isArray(raw.why_these_leaks) ? raw.why_these_leaks : [];
  const plan = Array.isArray(raw.thirty_day_plan) ? raw.thirty_day_plan : [];
  const report = {
    headline: asText(raw.headline, 300),
    business_snapshot: asText(raw.business_snapshot, 900),
    why_these_leaks: why
      .map((w) => ({ pillar: asText((w as Record<string, unknown>)?.pillar, 30), why_for_you: asText((w as Record<string, unknown>)?.why_for_you, 600) }))
      .filter((w) => w.pillar && w.why_for_you)
      .slice(0, 3),
    first_week: asList(raw.first_week, 7),
    thirty_day_plan: plan
      .map((p, i) => ({
        week: Number((p as Record<string, unknown>)?.week) || i + 1,
        focus: asText((p as Record<string, unknown>)?.focus, 120),
        actions: asList((p as Record<string, unknown>)?.actions, 5),
      }))
      .filter((p) => p.focus && p.actions.length)
      .slice(0, 4),
    watch_outs: asList(raw.watch_outs, 4),
    questions_for_call: asList(raw.questions_for_call, 4),
  };
  if (!report.headline || !report.business_snapshot || report.first_week.length === 0 || report.thirty_day_plan.length === 0) {
    throw new Error('The generated report was incomplete.');
  }
  return report;
}

function parseJson(text: string) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The model did not return JSON.');
  return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
}

async function generate(prompt: string) {
  const key = env('ANTHROPIC_API_KEY');
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set.');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: env('LEAK_AI_MODEL', 'claude-sonnet-5-5'),
      max_tokens: 3500,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!response.ok) throw new Error(`Anthropic ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const body = await response.json();
  const text = (body?.content ?? []).map((part: { text?: string }) => part?.text ?? '').join('');
  return cleanReport(parseJson(text));
}

async function pushReviewNeeded(s: { id: string; name: string; email: string; whatsapp: string; leakiest: string; total: number; paid_tier: string }) {
  const url = env('N8N_LEAK_WEBHOOK_URL');
  if (!url) return;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (env('N8N_LEAK_WEBHOOK_SECRET')) headers['x-webhook-secret'] = env('N8N_LEAK_WEBHOOK_SECRET');
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      event: 'ai_review_needed',
      name: s.name,
      email: s.email,
      whatsapp: s.whatsapp,
      score: s.total,
      biggest_leak: s.leakiest,
      paid_tier: s.paid_tier,
      review_url: `${siteUrl()}/studio/leak-test?lead=${s.id}`,
    }),
  });
  if (!response.ok) throw new Error(`Webhook ${response.status}`);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  let claimedId: string | null = null;
  const db = admin();
  try {
    const body = await req.json().catch(() => ({}));
    const submissionId = String(body.submissionId ?? '').trim();
    const token = String(body.token ?? '').trim();
    if (!submissionId || !token) return json({ error: 'submissionId and token are required.' }, 400);

    const { data: owned, error: ownedError } = await db
      .from('leak_test_submissions')
      .select('id, paid_tier, intake, ai_status')
      .eq('id', submissionId)
      .eq('access_token', token)
      .maybeSingle();
    if (ownedError) throw ownedError;
    if (!owned) return json({ error: 'We could not find that result.' }, 404);
    if (!owned.paid_tier) return json({ error: 'This report is not unlocked.' }, 403);
    if (!owned.intake) return json({ error: 'Answer the three questions first.' }, 409);
    if (owned.ai_status === 'ready') return json({ status: 'ready' });

    // Claim the job. A "generating" job older than STALE_MS is treated as crashed and retried.
    const staleBefore = new Date(Date.now() - STALE_MS).toISOString();
    const { data: claimed, error: claimError } = await db
      .from('leak_test_submissions')
      .update({ ai_status: 'generating', ai_started_at: new Date().toISOString() })
      .eq('id', submissionId)
      .or(`ai_status.in.(pending,failed),and(ai_status.eq.generating,ai_started_at.lt.${staleBefore})`)
      .select('id, name, email, whatsapp, profile, answers, pillar_scores, total, band, archetype, leakiest, owner_dependence, paid_tier, intake')
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return json({ status: 'generating' });
    claimedId = claimed.id;

    const { data: content, error: contentError } = await db
      .from('leak_test_report_content')
      .select('key, body')
      .like('key', 'pillar:%');
    if (contentError) throw contentError;
    const basePlan = new Map<string, string[]>((content ?? []).map((row: { key: string; body: { plan?: string[] } }) => [row.key.replace('pillar:', ''), row.body?.plan ?? []]));

    const scores: Record<string, number> = {};
    LEAK_AREA_IDS.forEach((id, i) => (scores[id] = claimed.pillar_scores?.[i] ?? 0));
    const ranked = [...LEAK_AREA_IDS].sort((a, b) => scores[a] - scores[b]);
    const names = new Map(LEAK_QUESTIONS.map((q) => [q.areaId, q.areaName]));

    // The answers that most show where the leaks are: Never and Rarely, grouped by pillar.
    const weak = LEAK_QUESTIONS.map((q, i) => ({ ...q, points: claimed.answers?.[i] ?? 0 }))
      .filter((q) => q.points <= 1)
      .map((q) => `[${q.areaId}] ${q.text} -> ${LEAK_ANSWER_LABELS[q.points]}`);
    const strong = LEAK_QUESTIONS.map((q, i) => ({ ...q, points: claimed.answers?.[i] ?? 0 }))
      .filter((q) => q.points >= 4)
      .map((q) => `[${q.areaId}] ${q.text}`);

    const prompt = [
      `BUSINESS PROFILE (from the owner): ${JSON.stringify(claimed.profile)}`,
      `OWNER'S OWN WORDS:\n- What the business does: ${claimed.intake.about}\n- Biggest frustration: ${claimed.intake.frustration || '(not given)'}\n- What they have already tried: ${claimed.intake.tried || '(not given)'}`,
      `SCORES (0-100) overall ${claimed.total}, band ${claimed.band}, archetype ${claimed.archetype}. Pillars: ${ranked.map((id) => `${id} (${names.get(id)}) ${scores[id]}`).join('; ')}`,
      `Owner dependence ${claimed.owner_dependence}/16 (below 8 means the business leans heavily on the owner).`,
      `ANSWERS THAT SHOW GAPS (Never/Rarely):\n${weak.join('\n') || '(none)'}`,
      `STRENGTHS (answered Always):\n${strong.join('\n') || '(none)'}`,
      `BASE PLAN for the top two leaks, which you build on and make specific:\n${ranked
        .slice(0, 2)
        .map((id) => `${id}:\n${(basePlan.get(id) ?? []).map((a) => `  - ${a}`).join('\n')}`)
        .join('\n')}`,
      `Pillar ids, weakest first: ${ranked.join(', ')}.`,
      `BREADMAKER'S OWN OFFERS. When it genuinely helps, name the one for the owner's biggest leak and the program that builds it. Never mention any other product or tool as ours, and never claim a system is available if its status is testing:\n${LEAK_CATALOG.map((c) => `- ${c.name} (${c.kind}, ${c.status})${c.pillar ? `, fixes ${c.pillar}` : ''}: ${c.goal}`).join('\n')}`,
      `Return JSON in exactly this shape:\n${SHAPE}`,
    ].join('\n\n');

    const report = await generate(prompt);
    const released = claimed.paid_tier === 'report';
    const { error: saveError } = await db
      .from('leak_test_submissions')
      .update({ ai_report: report, ai_status: 'ready', ai_generated_at: new Date().toISOString(), ai_released: released })
      .eq('id', claimed.id);
    if (saveError) throw saveError;

    if (!released) {
      try {
        await pushReviewNeeded(claimed);
      } catch (error) {
        console.error('leak-test-generate: review webhook failed', error);
      }
    }
    return json({ status: released ? 'ready' : 'review' });
  } catch (error) {
    console.error('leak-test-generate failed', error);
    if (claimedId) await db.from('leak_test_submissions').update({ ai_status: 'failed' }).eq('id', claimedId);
    return json({ error: (error as Error).message ?? 'The report could not be written.' }, 500);
  }
});
