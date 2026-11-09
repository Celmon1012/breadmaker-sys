// Imports Kumoda customer accounts into Evo CRM: one contact per client, plus a card in a
// "Kumoda Customers" pipeline that shows where each account is (signed up, activated, paying, at risk).
// Safe to re-run: contacts are matched by email, cards by contact.
//
//   CRM_API_URL=https://api-crm.restart.ng CRM_SERVICE_TOKEN=... node scripts/crm-import-kumoda.mjs clients.json
//
// clients.json is the output of Kumoda's admin "list clients": [{ id, name, email, status, plan, users,
// workspaces, created_at, last_message_at }]. Keep that file out of git, it holds customer emails.
// Only account-level facts go in. Messages, contacts and conversations inside a customer's workspace
// belong to that customer and are never copied.
import { readFileSync } from 'node:fs';

const base = (process.env.CRM_API_URL ?? '').replace(/\/$/, '');
const token = process.env.CRM_SERVICE_TOKEN ?? '';
const file = process.argv[2];
const OWN_EMAILS = (process.env.KUMODA_OWN_EMAILS ?? 'adeusuf@restart.ng').split(',').map((s) => s.trim().toLowerCase());
if (!base || !token || !file) {
  console.error('Usage: CRM_API_URL=... CRM_SERVICE_TOKEN=... node scripts/crm-import-kumoda.mjs clients.json');
  process.exit(1);
}

const api = async (method, path, body) => {
  const response = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Service-Token': token },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${text.slice(0, 200)}`);
  return json;
};

const STAGES = [
  { name: 'Signed up', color: '#60A5FA', description: 'Created a Kumoda account, no plan, no messages yet' },
  { name: 'Activated', color: '#34D399', description: 'Sending messages on the free plan' },
  { name: 'Paying', color: '#10B981', description: 'On a paid plan and messaging in the last 14 days' },
  { name: 'At risk', color: '#F59E0B', description: 'On a paid plan but quiet for 14+ days, or never started' },
];

// Find or create the pipeline.
const pipelines = (await api('GET', '/pipelines')).data;
let pipeline = pipelines.find((p) => p.name === 'Kumoda Customers');
if (!pipeline) {
  try {
    pipeline = (await api('POST', '/pipelines', {
      name: 'Kumoda Customers',
      description: 'Kumoda accounts: sign-up, activation, paid plan and churn risk.',
      pipeline_type: 'sales',
      visibility: 'public',
      stages: STAGES,
    })).data;
    console.log('created pipeline Kumoda Customers');
  } catch (error) {
    // The service token cannot create pipelines (it has no user). Create "Kumoda Customers" once in the CRM
    // (Pipelines > New Pipeline, stages: ${STAGES.map((s) => s.name).join(', ')}) and re-run for the cards.
    console.log(`No Kumoda pipeline yet, importing contacts only. (${String(error.message).slice(0, 80)})`);
  }
}
const stageId = (name) => pipeline?.stages.find((s) => s.name === name)?.id;

const clients = JSON.parse(readFileSync(file, 'utf8'));
const dayMs = 86400000;
const day = (v) => (v ? String(v).slice(0, 10) : undefined);

for (const c of clients) {
  const email = String(c.email).trim().toLowerCase();
  const own = OWN_EMAILS.includes(email);
  const paying = !!c.plan && c.plan !== 'Free';
  const lastMessage = c.last_message_at ? new Date(c.last_message_at).getTime() : 0;
  const recent = lastMessage && Date.now() - lastMessage < 14 * dayMs;
  const stage = paying ? (recent ? 'Paying' : 'At risk') : lastMessage ? 'Activated' : 'Signed up';

  const attrs = {
    kumoda_client_id: c.id,
    kumoda_plan: c.plan ?? '',
    kumoda_status: c.status,
    kumoda_signed_up: day(c.created_at),
    kumoda_workspaces: c.workspaces,
    kumoda_last_message_at: day(c.last_message_at),
    lifecycle_stage: paying ? 'customer' : 'lead',
    lead_channel: 'kumoda',
    lead_source: 'kumoda-signup',
  };

  const search = (await api('GET', `/contacts/search?q=${encodeURIComponent(email)}`)).data ?? [];
  const existing = search.find((x) => String(x.email ?? '').toLowerCase() === email);
  let id;
  if (existing) {
    const merged = { ...(existing.custom_attributes ?? {}), ...attrs };
    // Never downgrade a lifecycle the site already set (for example a Breadmaker customer).
    const rank = { subscriber: 1, lead: 2, applicant: 3, customer: 4, partner: 5 };
    if ((rank[existing.custom_attributes?.lifecycle_stage] ?? 0) > (rank[attrs.lifecycle_stage] ?? 0)) merged.lifecycle_stage = existing.custom_attributes.lifecycle_stage;
    const labels = [...new Set([...(existing.labels ?? []).map((l) => l.name ?? l), 'kumoda', ...(own ? ['own-account'] : [])])];
    await api('PATCH', `/contacts/${existing.id}`, { custom_attributes: merged, labels });
    id = existing.id;
  } else {
    const created = await api('POST', '/contacts', {
      name: c.name,
      email,
      custom_attributes: attrs,
      labels: ['kumoda', ...(own ? ['own-account'] : [])],
    });
    id = created.data.contact.id;
  }

  // Your own account is a test bed, not a customer, so it gets no card.
  if (own) { console.log(`contact  ${email} (own account, no card)`); continue; }
  if (!pipeline) { console.log(`contact  ${email} (no pipeline yet)`); continue; }

  const found = await api('GET', `/pipelines/by_contact/${id}`);
  let item;
  for (const p of found.data ?? []) {
    if (p.id !== pipeline.id) continue;
    for (const s of p.stages ?? []) for (const i of s.items ?? []) if (i.contact_id === id) item = { id: i.id, stage: s.name };
  }
  if (!item) {
    await api('POST', `/pipelines/${pipeline.id}/pipeline_items`, { type: 'contact', item_id: id, pipeline_stage_id: stageId(stage), custom_fields: { entry_point: 'kumoda_signup', program: 'kumoda', tier: c.plan ?? '', source_record_id: String(c.id) } });
    console.log(`created  ${email} -> ${stage}`);
  } else if (item.stage !== stage) {
    await api('PATCH', `/pipelines/${pipeline.id}/pipeline_items/${item.id}/move_to_stage`, { new_stage_id: stageId(stage) });
    console.log(`moved    ${email} ${item.stage} -> ${stage}`);
  } else {
    console.log(`kept     ${email} (${stage})`);
  }
}
console.log(`Done: ${clients.length} Kumoda accounts.`);
