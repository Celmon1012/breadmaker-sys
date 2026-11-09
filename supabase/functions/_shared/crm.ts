// Evo CRM client for the Breadmaker site: find or create a contact, merge custom attributes and
// labels, and keep one deal card per contact per pipeline.
//
// Auth is the CRM's service token (its EVOAI_CRM_API_TOKEN), sent as X-Service-Token.
// Env: CRM_API_URL (https://api-crm.restart.ng), CRM_SERVICE_TOKEN.
//
// The CRM replaces custom_attributes and labels on update instead of merging them, so every update
// here reads the contact first and writes back the merged result.
import { env } from './flutterwave.ts';

type Json = Record<string, unknown>;

export type ContactPlan = {
  email: string;
  name: string;
  /** Raw phone as typed. Normalised here; kept in the `whatsapp` attribute by the caller. */
  phone?: string | null;
  attrs: Json;
  /** Attributes written only when the contact has no value yet (first touch). */
  firstTouch?: Json;
  labels?: string[];
  removeLabels?: string[];
};

export type ItemPlan = {
  pipeline: 'marketing' | 'sales';
  stage: string;
  fields: Json;
  /** Move an existing card to `stage` only if that is further along. Otherwise the card stays put. */
  advance?: boolean;
  /** Create a card when none exists. Default true. */
  create?: boolean;
};

// Higher = further along. Used so a later "subscriber" event never downgrades a customer.
const LIFECYCLE_RANK: Record<string, number> = { subscriber: 1, lead: 2, applicant: 3, customer: 4, partner: 5 };

async function call<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const base = env('CRM_API_URL').replace(/\/$/, '');
  const token = env('CRM_SERVICE_TOKEN');
  if (!base || !token) throw new Error('CRM_API_URL and CRM_SERVICE_TOKEN are not set.');
  const response = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Service-Token': token },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let parsed: any = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(`CRM ${method} ${path} -> ${response.status} ${text.slice(0, 300)}`) as Error & { status?: number; body?: any };
    error.status = response.status;
    error.body = parsed;
    throw error;
  }
  return parsed as T;
}

/** E.164 for the CRM. Nigerian local numbers (0801...) become +234801.... Anything unclear returns null. */
export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = String(raw).replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;
  if (digits.startsWith('+')) return /^\+[1-9]\d{7,14}$/.test(digits) ? digits : null;
  if (digits.startsWith('234') && digits.length === 13) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 11) return `+234${digits.slice(1)}`;
  return null;
}

async function findContact(email: string): Promise<any | null> {
  const result = await call<{ data: any[] }>('GET', `/contacts/search?q=${encodeURIComponent(email)}`);
  const wanted = email.toLowerCase();
  return (result.data ?? []).find((c) => String(c.email ?? '').toLowerCase() === wanted) ?? null;
}

const labelNames = (labels: any[] | undefined) => (labels ?? []).map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean) as string[];

export type UpsertResult = { id: string; before: Json; after: Json };

/** Keys that hold a running comma-separated list: a new value is added, never replaced. */
const LIST_KEYS = ['systems_interested', 'courses_enrolled'];

/** Creates or updates the contact. Returns its id plus the attributes before and after, so callers can see what changed. */
export async function upsertContact(plan: ContactPlan): Promise<UpsertResult> {
  const email = plan.email.trim();
  const phone = normalisePhone(plan.phone);
  const existing = await findContact(email);

  const wantLabels = (current: string[]) => {
    const merged = new Set(current);
    for (const l of plan.labels ?? []) merged.add(l);
    for (const l of plan.removeLabels ?? []) merged.delete(l);
    return [...merged];
  };

  if (!existing) {
    const attrs = { ...(plan.firstTouch ?? {}), ...plan.attrs };
    const body: Json = {
      name: plan.name || email.split('@')[0],
      email,
      custom_attributes: attrs,
      labels: wantLabels([]),
    };
    try {
      const created = await call('POST', '/contacts', { ...body, ...(phone ? { phone_number: phone } : {}) });
      return { id: created.data.contact.id as string, before: {}, after: attrs };
    } catch (error) {
      // A phone the CRM refuses (for example it already belongs to another contact) must not lose the lead.
      if (phone && (error as { status?: number }).status === 422) {
        const created = await call('POST', '/contacts', body);
        return { id: created.data.contact.id as string, before: {}, after: attrs };
      }
      throw error;
    }
  }

  const current: Json = existing.custom_attributes ?? {};
  const merged: Json = { ...current };
  for (const [key, value] of Object.entries(plan.firstTouch ?? {})) {
    if (current[key] === undefined || current[key] === null || current[key] === '') merged[key] = value;
  }
  for (const [key, value] of Object.entries(plan.attrs)) {
    if (value === undefined || value === null || value === '') continue;
    if (key === 'lifecycle_stage') {
      if ((LIFECYCLE_RANK[String(value)] ?? 0) >= (LIFECYCLE_RANK[String(current[key])] ?? 0)) merged[key] = value;
      continue;
    }
    if (key === 'first_paid_at' && current[key]) continue;
    if (LIST_KEYS.includes(key)) {
      // A running list: add this entry to the ones they already have.
      const items = new Set(String(current[key] ?? '').split(',').map((s) => s.trim()).filter(Boolean));
      items.add(String(value));
      merged[key] = [...items].join(', ');
      continue;
    }
    if (key === 'lead_score') {
      // A score only goes up: a later, weaker signal never cools a hot lead.
      merged[key] = Math.max(Number(current[key] ?? 0), Number(value));
      continue;
    }
    merged[key] = value;
  }

  const body: Json = { custom_attributes: merged, labels: wantLabels(labelNames(existing.labels)) };
  if (plan.name && (!existing.name || existing.name === String(existing.email ?? '').split('@')[0])) body.name = plan.name;
  const update = async (withPhone: boolean) =>
    call('PATCH', `/contacts/${existing.id}`, { ...body, ...(withPhone && phone && !existing.phone_number ? { phone_number: phone } : {}) });
  try {
    await update(true);
  } catch (error) {
    if (phone && (error as { status?: number }).status === 422) await update(false);
    else throw error;
  }
  return { id: existing.id as string, before: current, after: merged };
}

type Pipelines = Map<string, { id: string; stages: Map<string, { id: string; position: number }> }>;
let pipelineCache: { at: number; value: Pipelines } | null = null;

async function pipelines(): Promise<Pipelines> {
  if (pipelineCache && Date.now() - pipelineCache.at < 5 * 60_000) return pipelineCache.value;
  const result = await call<{ data: any[] }>('GET', '/pipelines');
  const map: Pipelines = new Map();
  for (const p of result.data ?? []) {
    if (!p.is_active || map.has(p.pipeline_type)) continue;
    map.set(p.pipeline_type, {
      id: p.id,
      stages: new Map((p.stages ?? []).map((s: any) => [String(s.name).toLowerCase(), { id: s.id, position: s.position }])),
    });
  }
  pipelineCache = { at: Date.now(), value: map };
  return map;
}

export type ItemRef = { pipelineId: string; itemId: string };

/** Puts the contact on a deal card in the pipeline, creating, updating fields and moving forward as asked. Returns the card. */
export async function ensureItem(contactId: string, plan: ItemPlan): Promise<ItemRef | null> {
  const map = await pipelines();
  const pipeline = map.get(plan.pipeline);
  const stage = pipeline?.stages.get(plan.stage.toLowerCase());
  // A renamed pipeline or stage must not make the sync fail forever; the contact is already saved.
  if (!pipeline || !stage) {
    console.warn(`crm: no ${plan.pipeline} pipeline stage "${plan.stage}", skipped the deal card`);
    return null;
  }

  const found = await call<{ data: any[] }>('GET', `/pipelines/by_contact/${contactId}`);
  let item: { id: string; stageId: string; stagePosition: number; fields: Json } | null = null;
  for (const p of found.data ?? []) {
    if (p.id !== pipeline.id) continue;
    for (const s of p.stages ?? []) {
      for (const i of s.items ?? []) {
        if (i.contact_id === contactId && !i.completed_at) item = { id: i.id, stageId: s.id, stagePosition: s.position, fields: i.custom_fields ?? {} };
      }
    }
  }

  if (!item) {
    if (plan.create === false) return null;
    const created = await call('POST', `/pipelines/${pipeline.id}/pipeline_items`, {
      type: 'contact',
      item_id: contactId,
      pipeline_stage_id: stage.id,
      custom_fields: plan.fields,
    });
    return { pipelineId: pipeline.id, itemId: created.data.id as string };
  }

  const fields = { ...item.fields, ...Object.fromEntries(Object.entries(plan.fields).filter(([, v]) => v !== undefined && v !== null && v !== '')) };
  await call('PATCH', `/pipelines/${pipeline.id}/pipeline_items/${item.id}/update_custom_fields`, { custom_fields: fields });
  if (plan.advance && stage.position > item.stagePosition) {
    await call('PATCH', `/pipelines/${pipeline.id}/pipeline_items/${item.id}/move_to_stage`, { new_stage_id: stage.id });
  }
  return { pipelineId: pipeline.id, itemId: item.id };
}
