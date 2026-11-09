// Receives agent spend from the gateway for Prestige Partner members, then sends any warnings due.
//
//   POST  header  x-usage-secret: <USAGE_WEBHOOK_SECRET>
//   body  { "usage": [ { "email": "a@b.com", "spent_usd": 4.25 }, ... ] }       (a single object also works)
//
// Per item, send the spend either as spent_usd (dollars) or spent_minor (cents). By default the number is
// the member's TOTAL spend this period; add "mode": "add" to add it to what is already recorded.
// Members who are not Partners with services set up are skipped and listed in "unknown".
// A gateway such as LiteLLM can call this from a spend callback or a scheduled job.
//
// Env: USAGE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, and optionally
// WHATSAPP_NOTIFY_URL / WHATSAPP_NOTIFY_SECRET for WhatsApp warnings.
import { serve } from 'https://deno.land/std@0.177.1/http/server.ts';
import { admin, env, json } from '../_shared/flutterwave.ts';
import { rollBudgetPeriods, sendUsageAlerts } from '../_shared/usage.ts';

interface UsageItem {
  email?: string;
  spent_usd?: number;
  spent_minor?: number;
  mode?: 'total' | 'add';
}

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  const secret = env('USAGE_WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-usage-secret') !== secret) return json({ error: 'Not authorised.' }, 401);

  try {
    const body = await req.json();
    const items: UsageItem[] = Array.isArray(body?.usage) ? body.usage : body?.email ? [body] : [];
    if (items.length === 0) return json({ error: 'Send { "usage": [ { "email", "spent_usd" } ] }.' }, 400);

    // A new period starts first, so a report on the first day lands in the right period.
    const reset = await rollBudgetPeriods();

    const db = admin();
    let recorded = 0;
    const unknown: string[] = [];
    const rejected: string[] = [];
    for (const item of items) {
      const email = String(item.email ?? '').trim().toLowerCase();
      const minor = item.spent_minor !== undefined ? Math.round(Number(item.spent_minor)) : Math.round(Number(item.spent_usd) * 100);
      if (!email || !Number.isFinite(minor) || minor < 0) {
        rejected.push(email || '(no email)');
        continue;
      }
      const { data, error } = await db.rpc('record_agent_usage', { for_email: email, amount_minor: minor, usage_mode: item.mode === 'add' ? 'add' : 'total' });
      if (error) {
        console.error('agent-usage', email, error.message);
        rejected.push(email);
      } else if (data === null) {
        unknown.push(email);
      } else {
        recorded += 1;
      }
    }

    const warned = await sendUsageAlerts();
    console.log(`agent-usage: ${recorded} recorded, ${unknown.length} unknown, ${rejected.length} rejected, ${reset} reset, ${warned} warned`);
    return json({ recorded, unknown, rejected, reset, warned });
  } catch (error) {
    console.error('agent-usage failed', error);
    return json({ error: (error as Error).message }, 500);
  }
});
