// Adds paying members to the Breadmaker WhatsApp groups through Evolution API.
//
//   POST (header x-cron-secret: <CRON_SECRET>)  ->  { done, invited, failed, waiting }
//
// breadmaker.group_queue is filled by database triggers on payments and memberships. For each pending "add":
//   1. find the person's WhatsApp number (payment, then application),
//   2. add them to the group; if WhatsApp refuses (privacy settings) send them the invite link instead,
//   3. retry with a growing delay on errors (6 tries), keeping last_error on the row.
// Groups with no group_jid yet are skipped: their queued members wait. "remove" rows are never run here.
// The General group waits until the person's community add is done.
//
// Env: CRON_SECRET, EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { serve } from 'https://deno.land/std@0.177.1/http/server.ts';
import { admin, env, json } from '../_shared/flutterwave.ts';
import { normalisePhone } from '../_shared/crm.ts';

const MAX_TRIES = 6;
const BATCH = 10;

async function evolution(method: string, path: string, body?: unknown) {
  const base = env('EVOLUTION_API_URL').replace(/\/$/, '');
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', apikey: env('EVOLUTION_API_KEY') },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });
  const text = await response.text();
  let parsed: any = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }
  if (!response.ok) throw new Error(`Evolution ${method} ${path} -> ${response.status} ${text.slice(0, 200)}`);
  return parsed;
}

async function findPhone(db: ReturnType<typeof admin>, email: string): Promise<string | null> {
  const fromPayment = await db.from('payments').select('phone').ilike('email', email).not('phone', 'is', null).order('created_at', { ascending: false }).limit(5);
  for (const row of fromPayment.data ?? []) {
    const phone = normalisePhone(row.phone);
    if (phone) return phone;
  }
  const fromApplication = await db.from('applications').select('phone').ilike('email', email).not('phone', 'is', null).order('created_at', { ascending: false }).limit(5);
  for (const row of fromApplication.data ?? []) {
    const phone = normalisePhone(row.phone);
    if (phone) return phone;
  }
  return null;
}

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  const secret = env('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'Not authorised.' }, 401);
  if (!env('EVOLUTION_API_URL') || !env('EVOLUTION_API_KEY') || !env('EVOLUTION_INSTANCE')) {
    return json({ error: 'EVOLUTION_API_URL, EVOLUTION_API_KEY and EVOLUTION_INSTANCE are not set.' }, 503);
  }
  const instance = encodeURIComponent(env('EVOLUTION_INSTANCE'));

  // ?list=1 lists the groups this number is in, so their ids can be copied into whatsapp_groups.group_jid.
  if (new URL(req.url).searchParams.get('list') === '1') {
    const all = await evolution('GET', `/group/fetchAllGroups/${instance}?getParticipants=false`);
    return json((Array.isArray(all) ? all : []).map((g: any) => ({ id: g.id, name: g.subject, members: g.size })));
  }

  const db = admin();
  const { data: groups } = await db.from('whatsapp_groups').select('key, label, group_jid').eq('enabled', true).not('group_jid', 'is', null);
  const byKey = new Map((groups ?? []).map((g: any) => [g.key, g]));
  if (!byKey.size) return json({ done: 0, invited: 0, failed: 0, waiting: 0, note: 'No group ids set yet.' });

  const { data: rows, error } = await db
    .from('group_queue')
    .select('*')
    .eq('status', 'pending')
    .eq('action', 'add')
    .in('group_key', [...byKey.keys()])
    .lte('next_attempt_at', new Date().toISOString())
    .order('id')
    .limit(BATCH);
  if (error) return json({ error: error.message }, 500);

  // The General group needs the person to be in the community first: wait while their community add is still open.
  const generalEmails = (rows ?? []).filter((r: any) => r.group_key === 'community_general').map((r: any) => r.email);
  const { data: openCommunity } = generalEmails.length
    ? await db.from('group_queue').select('email').eq('group_key', 'community').eq('action', 'add').eq('status', 'pending').in('email', generalEmails)
    : { data: [] as { email: string }[] };
  const holdBack = new Set((openCommunity ?? []).map((r: any) => r.email));

  let done = 0;
  let invited = 0;
  let failed = 0;
  for (const row of rows ?? []) {
    if (row.group_key === 'community_general' && holdBack.has(row.email)) continue;
    const group = byKey.get(row.group_key) as { label: string; group_jid: string };
    const finish = (status: string, note = '', lastError = '') =>
      db.from('group_queue').update({ status, note, last_error: lastError, done_at: new Date().toISOString(), tries: row.tries + 1 }).eq('id', row.id);
    try {
      const phone = await findPhone(db, row.email);
      if (!phone) {
        await finish('failed', 'no phone number on file', 'no phone number on file');
        failed += 1;
        continue;
      }
      const number = phone.replace(/^\+/, '');
      let direct = false;
      try {
        const result = await evolution('POST', `/group/updateParticipant/${instance}?groupJid=${encodeURIComponent(group.group_jid)}`, {
          action: 'add',
          participants: [number],
        });
        const statuses = (Array.isArray(result?.updateParticipants) ? result.updateParticipants : Array.isArray(result) ? result : []).map((p: any) => String(p.status ?? ''));
        // 200 added, 409 already in the group.
        direct = statuses.length > 0 && statuses.every((s: string) => s === '200' || s === '409');
      } catch (error) {
        console.warn('group add refused, falling back to invite', (error as Error).message);
      }
      if (direct) {
        await finish('done', 'added');
        done += 1;
        continue;
      }
      // WhatsApp would not add them directly: send the invite link instead.
      const invite = await evolution('GET', `/group/inviteCode/${instance}?groupJid=${encodeURIComponent(group.group_jid)}`);
      const link = invite?.inviteUrl ?? (invite?.code ? `https://chat.whatsapp.com/${invite.code}` : null);
      if (!link) throw new Error('No invite link returned');
      await evolution('POST', `/message/sendText/${instance}`, {
        number,
        text: `Welcome to ${group.label}. Join on WhatsApp here: ${link}`,
      });
      await finish('invited', 'invite link sent');
      invited += 1;
    } catch (error) {
      const message = (error as Error).message.slice(0, 500);
      const tries = row.tries + 1;
      if (tries >= MAX_TRIES) {
        await db.from('group_queue').update({ status: 'failed', tries, last_error: message, done_at: new Date().toISOString() }).eq('id', row.id);
        failed += 1;
      } else {
        const delayMinutes = Math.min(120, 2 ** tries);
        await db.from('group_queue').update({ tries, last_error: message, next_attempt_at: new Date(Date.now() + delayMinutes * 60_000).toISOString() }).eq('id', row.id);
      }
    }
  }

  const { count } = await db.from('group_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('action', 'add');
  return json({ done, invited, failed, waiting: count ?? 0 });
});
