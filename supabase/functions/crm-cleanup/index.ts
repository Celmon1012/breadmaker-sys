// Daily sweep: deletes the empty contacts the CRM chat widget creates for visitors who never chatted.
//
//   POST (header x-cron-secret: <CRON_SECRET>)           -> deletes, returns { checked, deleted, kept }
//   POST ?dry=1                                          -> only reports what it would delete
//
// A contact is removed only when ALL of these hold:
//   - no email, no phone number and no identifier
//   - a name in the widget's random style (word-word-123)
//   - created more than 24 hours ago
//   - no conversation at all (if that cannot be read, it is kept)
// At most MAX_DELETES per run. Everything else, including people who started a chat, is left alone.
//
// Env: CRON_SECRET, CRM_API_URL, CRM_SERVICE_TOKEN.
import { serve } from 'https://deno.land/std@0.177.1/http/server.ts';
import { env, json } from '../_shared/flutterwave.ts';

const MAX_DELETES = 300;
const MAX_PAGES = 30;
const MIN_AGE_SECONDS = 24 * 3600;
const ANON_NAME = /^[a-z]+-[a-z]+-\d+$/;

async function crm(method: string, path: string) {
  const base = env('CRM_API_URL').replace(/\/$/, '');
  const response = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: { 'X-Service-Token': env('CRM_SERVICE_TOKEN') },
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let body: any = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }
  return { ok: response.ok, body };
}

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  const secret = env('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'Not authorised.' }, 401);
  if (!env('CRM_API_URL') || !env('CRM_SERVICE_TOKEN')) return json({ error: 'CRM_API_URL and CRM_SERVICE_TOKEN are not set.' }, 503);
  const dry = new URL(req.url).searchParams.get('dry') === '1';

  const cutoff = Date.now() / 1000 - MIN_AGE_SECONDS;
  const candidates: { id: string; name: string }[] = [];
  let checked = 0;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { ok, body } = await crm('GET', `/contacts?per_page=100&page=${page}`);
    if (!ok) return json({ error: 'Could not read the CRM contacts.', checked, deleted: 0 }, 502);
    const rows: any[] = body?.data?.contacts ?? body?.data ?? [];
    checked += rows.length;
    for (const c of rows) {
      if (c.email || c.phone_number || c.identifier) continue;
      if (!ANON_NAME.test(String(c.name ?? ''))) continue;
      if (typeof c.created_at === 'number' && c.created_at > cutoff) continue;
      candidates.push({ id: c.id, name: c.name });
    }
    if (rows.length < 100) break;
  }

  let deleted = 0;
  let kept = 0;
  const wouldDelete: string[] = [];
  for (const c of candidates) {
    if (deleted + wouldDelete.length >= MAX_DELETES) break;
    const { ok, body } = await crm('GET', `/contacts/${c.id}/conversations`);
    const list = body?.data?.payload ?? body?.data;
    // Unknown means keep: only a clearly empty list lets the contact go.
    if (!ok || !Array.isArray(list) || list.length > 0) {
      kept += 1;
      continue;
    }
    if (dry) {
      wouldDelete.push(c.name);
      continue;
    }
    const removed = await crm('DELETE', `/contacts/${c.id}`);
    if (removed.ok) deleted += 1;
    else kept += 1;
  }
  return json(dry ? { dry: true, checked, candidates: candidates.length, wouldDelete: wouldDelete.length, kept, sample: wouldDelete.slice(0, 5) } : { checked, candidates: candidates.length, deleted, kept });
});
