import { supabase } from './supabase';
import { AGENT_PLATFORM_URL, freshToken } from './agent-runs';

/**
 * Agent definitions: an agent is data (name, model, instructions, rules, tools). The studio creates and edits them
 * here, straight in breadmaker.agent_defs under row level security (the team reads, owners and coaches write);
 * the agent platform builds a real agent from the row each time it runs. Publishing writes a numbered snapshot, and
 * any snapshot can be restored. The platform does the live preview, because that is a real model call.
 */

export type AgentStatus = 'draft' | 'live' | 'paused';

export interface ModelChoice {
  id: string;
  name: string;
  blurb: string;
  /** 1 to 5, relative: more speed is better, more quality is better, more cost is pricier. */
  speed: number;
  quality: number;
  cost: number;
  recommended?: boolean;
}

export const MODEL_CHOICES: ModelChoice[] = [
  { id: 'anthropic/claude-haiku-5-5', name: 'Haiku 5.5', blurb: 'Fast and light. Good for simple, repeated questions.', speed: 5, quality: 3, cost: 1 },
  { id: 'anthropic/claude-sonnet-5-5', name: 'Sonnet 5.5', blurb: 'The all-round choice for most agents.', speed: 4, quality: 4, cost: 3, recommended: true },
  { id: 'anthropic/claude-opus-5-5', name: 'Opus 5.5', blurb: 'The strongest. For hard judgement, and the priciest.', speed: 2, quality: 5, cost: 5 },
];

export interface AgentDefinition {
  id?: string;
  name: string;
  publicName: string;
  openingMessage: string;
  purpose: string;
  template: string | null;
  model: string;
  instructions: string;
  rules: string[];
  tools: string[];
}

export interface StoredAgent extends AgentDefinition {
  id: string;
  status: AgentStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentVersion {
  id: string;
  version: number;
  note: string;
  createdAt: string;
  snapshot: Partial<AgentDefinition> & { name: string };
}

export interface Template {
  id: string;
  name: string;
  summary: string;
  definition: Omit<AgentDefinition, 'id' | 'template'>;
}

const READ_ONLY_NOTE = 'You can only look; you cannot change anything. If a fix is needed, say exactly what to do and who can do it.';

/** Starting points. Each is only instructions and a tool choice: nothing here is special to the platform. */
export const TEMPLATES: Template[] = [
  {
    id: 'ops',
    name: 'Platform checker',
    summary: 'Is everything running? Checks apps, deployments, logs, sites and domains.',
    definition: {
      name: 'Platform checker',
      publicName: '',
      openingMessage: '',
      purpose: 'Check how the platform is doing and explain it in plain words.',
      model: 'anthropic/claude-sonnet-5-5',
      instructions: `You look into how the platform is doing and explain it plainly to a small team that is not full of engineers. Check before you claim: use the tools, then say what you found. Start narrow, and lead with the answer. ${READ_ONLY_NOTE}`,
      rules: ['Never guess a status, an address or a cause.', 'Say "I could not check" when a tool failed, and name the tool.'],
      tools: ['list_resources', 'app_logs', 'app_deployments', 'http_check', 'dns_lookup'],
    },
  },
  {
    id: 'site',
    name: 'Site and domain checker',
    summary: 'Is this website up, and where does its domain point?',
    definition: {
      name: 'Site checker',
      publicName: '',
      openingMessage: '',
      purpose: 'Tell someone whether a website is up and where its domain points.',
      model: 'anthropic/claude-haiku-5-5',
      instructions: `You check public websites and domains. When asked about an address, fetch it and look up its DNS, then say in two or three sentences whether it works and what to do if it does not. ${READ_ONLY_NOTE}`,
      rules: ['Report the status code and the time it took.', 'If DNS and the site disagree, say which one looks wrong.'],
      tools: ['http_check', 'dns_lookup'],
    },
  },
  {
    id: 'funnel',
    name: 'Funnel build helper',
    summary: 'Where is a Launchpad funnel in the build, and why is it not live?',
    definition: {
      name: 'Funnel build helper',
      publicName: '',
      openingMessage: '',
      purpose: 'Explain where a funnel is in the build and what is holding it up.',
      model: 'anthropic/claude-sonnet-5-5',
      instructions: `You explain where Launchpad funnels are in the build. Look up the funnel by its site name, read the last build steps, check that the site address responds, and say plainly what is done and what is holding it up. ${READ_ONLY_NOTE}`,
      rules: ['Never share customer details.', 'If the build log shows a failed step, quote the step name, not the raw log.'],
      tools: ['funnel_status', 'http_check', 'dns_lookup'],
    },
  },
  {
    id: 'support',
    name: 'Support reply drafter',
    summary: 'Drafts a reply to a customer message. Nothing is sent: a person reads it first.',
    definition: {
      name: 'Support reply drafter',
      publicName: 'Support',
      openingMessage: 'Paste a customer message and I will draft a reply for you to review.',
      purpose: 'Draft clear, kind replies to customer messages for a person to review.',
      model: 'anthropic/claude-sonnet-5-5',
      instructions: 'You draft replies to customer support messages for a person to review before anything is sent. Be warm, brief and specific. If the message needs account details you do not have, say what the person should check, and draft a holding reply.',
      rules: ['Never promise a refund, a date or an outcome you cannot see.', 'Never ask for passwords or card numbers.', 'End with a clear next step for the customer.'],
      tools: [],
    },
  },
  {
    id: 'blank',
    name: 'Start from blank',
    summary: 'Write your own instructions and pick the tools.',
    definition: {
      name: 'New agent',
      publicName: '',
      openingMessage: '',
      purpose: '',
      model: 'anthropic/claude-sonnet-5-5',
      instructions: '',
      rules: [],
      tools: [],
    },
  },
];

const fromRow = (row: Record<string, any>): StoredAgent => ({
  id: row.id,
  name: row.name,
  publicName: row.public_name ?? '',
  openingMessage: row.opening_message ?? '',
  purpose: row.purpose ?? '',
  template: row.template ?? null,
  model: row.model,
  instructions: row.instructions ?? '',
  rules: row.rules ?? [],
  tools: row.tools ?? [],
  status: row.status,
  version: row.version,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toRow = (def: AgentDefinition) => ({
  name: def.name.trim(),
  public_name: def.publicName.trim(),
  opening_message: def.openingMessage.trim(),
  purpose: def.purpose.trim(),
  template: def.template,
  model: def.model,
  instructions: def.instructions.trim(),
  rules: def.rules.map((rule) => rule.trim()).filter(Boolean),
  tools: def.tools,
  updated_at: new Date().toISOString(),
});

const fail = (error: { message: string; code?: string }): never => {
  throw new Error(error.code === '42501' ? 'Only owners and coaches can change agents.' : error.message);
};

export async function listAgents(): Promise<StoredAgent[]> {
  // The team's agents. A member's own agents (owner_id set) are theirs, and have their own page.
  let { data, error } = await supabase.from('agent_defs').select('*').is('owner_id', null).order('updated_at', { ascending: false });
  // Before migration 67 the column does not exist yet: carry on without the filter rather than break the page.
  if (error && error.code === '42703') ({ data, error } = await supabase.from('agent_defs').select('*').order('updated_at', { ascending: false }));
  if (error) fail(error);
  return (data ?? []).map(fromRow);
}

export async function getAgent(id: string): Promise<StoredAgent | null> {
  const { data, error } = await supabase.from('agent_defs').select('*').eq('id', id).maybeSingle();
  if (error) fail(error);
  return data ? fromRow(data) : null;
}

/** Save the working copy (create or update). The team tests the working copy; other systems run the last published version. */
export async function saveAgent(def: AgentDefinition): Promise<StoredAgent> {
  if (def.id) {
    const { data, error } = await supabase.from('agent_defs').update(toRow(def)).eq('id', def.id).select('*').single();
    if (error) fail(error);
    return fromRow(data);
  }
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase.from('agent_defs').insert({ ...toRow(def), created_by: auth.user?.id ?? null }).select('*').single();
  if (error) fail(error);
  return fromRow(data);
}

/** Publish the saved working copy as the next numbered version, and make the agent live. */
export async function publishAgent(def: AgentDefinition, note: string): Promise<StoredAgent> {
  const saved = await saveAgent(def);
  const version = saved.version + 1;
  const { data: auth } = await supabase.auth.getUser();
  const { error: versionError } = await supabase.from('agent_def_versions').insert({
    agent_id: saved.id,
    version,
    note: note.trim(),
    created_by: auth.user?.id ?? null,
    snapshot: {
      name: saved.name,
      publicName: saved.publicName,
      openingMessage: saved.openingMessage,
      purpose: saved.purpose,
      model: saved.model,
      instructions: saved.instructions,
      rules: saved.rules,
      tools: saved.tools,
    },
  });
  if (versionError) fail(versionError);
  const { data, error } = await supabase.from('agent_defs').update({ version, status: 'live', updated_at: new Date().toISOString() }).eq('id', saved.id).select('*').single();
  if (error) fail(error);
  return fromRow(data);
}

export async function setAgentStatus(id: string, status: AgentStatus): Promise<StoredAgent> {
  const { data, error } = await supabase.from('agent_defs').update({ status, updated_at: new Date().toISOString() }).eq('id', id).select('*').single();
  if (error) fail(error);
  return fromRow(data);
}

export async function deleteAgent(id: string): Promise<void> {
  const { error } = await supabase.from('agent_defs').delete().eq('id', id);
  if (error) fail(error);
}

// ---------------------------------------------------------------------------
// A member's own agents (Prestige Partners). Same table, with owner_id set: the database lets a member see and change
// only their own, refuses any tool, and allows the lighter models only. The platform enforces the same and the allowance.

const memberFail = (error: { message: string; code?: string }): never => {
  throw new Error(error.code === '42501' ? 'Building your own agents is part of Prestige Partner.' : error.message);
};

/** May this person build agents of their own? Decided by the database. */
export async function canBuildAgents(): Promise<boolean> {
  const { data, error } = await supabase.rpc('can_build_agents');
  return !error && data === true;
}

export async function listMyAgents(): Promise<StoredAgent[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  const { data, error } = await supabase.from('agent_defs').select('*').eq('owner_id', auth.user.id).order('updated_at', { ascending: false });
  if (error) memberFail(error);
  return (data ?? []).map(fromRow);
}

export async function saveMyAgent(def: AgentDefinition): Promise<StoredAgent> {
  const row = { ...toRow({ ...def, tools: [] }), status: 'draft' };
  if (def.id) {
    const { data, error } = await supabase.from('agent_defs').update(row).eq('id', def.id).select('*').single();
    if (error) memberFail(error);
    return fromRow(data);
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Sign in again to save.');
  const { data, error } = await supabase.from('agent_defs').insert({ ...row, owner_id: auth.user.id, created_by: auth.user.id }).select('*').single();
  if (error) memberFail(error);
  return fromRow(data);
}

export async function listVersions(agentId: string): Promise<AgentVersion[]> {
  const { data, error } = await supabase.from('agent_def_versions').select('*').eq('agent_id', agentId).order('version', { ascending: false });
  if (error) fail(error);
  return (data ?? []).map((row: Record<string, any>) => ({ id: row.id, version: row.version, note: row.note ?? '', createdAt: row.created_at, snapshot: row.snapshot }));
}

/** Put a published version back as the working copy and publish it again as a new version. */
export async function restoreVersion(agent: StoredAgent, version: AgentVersion): Promise<StoredAgent> {
  const s = version.snapshot;
  return publishAgent(
    {
      ...agent,
      name: s.name,
      publicName: s.publicName ?? '',
      openingMessage: s.openingMessage ?? '',
      purpose: s.purpose ?? '',
      model: s.model ?? agent.model,
      instructions: s.instructions ?? '',
      rules: s.rules ?? [],
      tools: s.tools ?? [],
    },
    `Restored version ${version.version}`,
  );
}

export interface PreviewMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface PreviewResult {
  reply: string;
  toolCalls: { name: string; input: string; output: string | null; error: boolean }[];
  costUsd: number;
  failed: boolean;
  error: string | null;
}

/** Try the unsaved definition with a conversation. A real model call, run by the platform, and recorded like any run. */
export async function previewAgent(def: AgentDefinition, messages: PreviewMessage[]): Promise<PreviewResult> {
  const token = await freshToken();
  if (!token) throw new Error('Sign in again to test the agent.');
  const response = await fetch(`${AGENT_PLATFORM_URL}/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      definition: { id: def.id, name: def.name, model: def.model, instructions: def.instructions, rules: def.rules, tools: def.tools, public_name: def.publicName, opening_message: def.openingMessage, purpose: def.purpose },
      messages,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = (await response.json().catch(() => ({}))) as Partial<PreviewResult> & { error?: string };
  if (!response.ok) throw new Error(body.error || `The agent platform answered ${response.status}.`);
  return { reply: body.reply ?? '', toolCalls: body.toolCalls ?? [], costUsd: body.costUsd ?? 0, failed: Boolean(body.failed), error: body.error ?? null };
}

export const emptyDefinition = (template?: Template): AgentDefinition => ({
  ...(template?.definition ?? TEMPLATES[TEMPLATES.length - 1].definition),
  template: template?.id ?? 'blank',
});
