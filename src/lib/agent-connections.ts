import { supabase } from './supabase';
import { AGENT_PLATFORM_URL, freshToken } from './agent-runs';

/**
 * Connections: web tools an agent can use, defined as data. Rows live in breadmaker.agent_connections (the team reads,
 * owners and coaches write). A secret is only ever named here ({{secret:SHOP}}); its value is a platform setting called
 * CONN_SECRET_SHOP, set in Coolify, never stored in the database.
 */

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type ParamType = 'string' | 'number' | 'boolean';

export interface ConnParam {
  name: string;
  type: ParamType;
  description: string;
}

export interface HttpToolConfig {
  method: Method;
  url: string;
  headers: Record<string, string>;
  params: ConnParam[];
  body: 'none' | 'json';
  risk: 'read' | 'write';
}

export interface McpServerConfig {
  url: string;
  headers: Record<string, string>;
  /** Tool names the server calls them, that only read and may run without approval. */
  readOnly: string[];
}

export interface Connection {
  id: string;
  kind: 'http_tool' | 'mcp';
  name: string;
  toolId: string;
  description: string;
  config: HttpToolConfig & McpServerConfig;
  enabled: boolean;
  createdAt: string;
}

export interface ConnectionDraft {
  name: string;
  toolId: string;
  description: string;
  method: Method;
  url: string;
  headers: { name: string; value: string }[];
  params: ConnParam[];
  /** For a GET: ask for approval even though it only reads. */
  alwaysAsk: boolean;
  sendBody: boolean;
}

export const emptyDraft = (): ConnectionDraft => ({ name: '', toolId: '', description: '', method: 'GET', url: 'https://', headers: [], params: [], alwaysAsk: false, sendBody: true });

/** "Find order" becomes "find_order". */
export const toolIdFrom = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[^a-z]+/, '').slice(0, 40);

export const toConfig = (draft: ConnectionDraft): HttpToolConfig => ({
  method: draft.method,
  url: draft.url.trim(),
  headers: Object.fromEntries(draft.headers.filter((h) => h.name.trim()).map((h) => [h.name.trim(), h.value])),
  params: draft.params.filter((p) => p.name.trim()).map((p) => ({ ...p, name: p.name.trim() })),
  body: draft.method !== 'GET' && draft.sendBody ? 'json' : 'none',
  risk: draft.method === 'GET' && !draft.alwaysAsk ? 'read' : 'write',
});

/** The settings an agent's tool will look for, from the {{secret:NAME}} markers in its headers and address. */
export function secretsUsed(config: Pick<HttpToolConfig, 'url' | 'headers'>): string[] {
  const text = [config.url, ...Object.values(config.headers)].join(' ');
  return [...new Set([...text.matchAll(/\{\{\s*secret:([A-Z][A-Z0-9_]*)\s*\}\}/g)].map((m) => `CONN_SECRET_${m[1]}`))];
}

const fromRow = (row: Record<string, any>): Connection => ({
  id: row.id,
  kind: row.kind ?? 'http_tool',
  name: row.name,
  toolId: row.tool_id,
  description: row.description,
  config: row.config,
  enabled: row.enabled,
  createdAt: row.created_at,
});

const fail = (error: { message: string; code?: string }): never => {
  throw new Error(
    error.code === '42501' ? 'Only owners and coaches can change connections.' : error.code === '23505' ? 'A tool with that id already exists. Choose another name or id.' : error.code === '23514' ? 'Check the name, the id (lower-case words and underscores) and the description (10 or more characters).' : error.message,
  );
};

export async function listConnections(): Promise<Connection[]> {
  const { data, error } = await supabase.from('agent_connections').select('*').order('created_at', { ascending: true });
  if (error) fail(error);
  return (data ?? []).map(fromRow);
}

export async function addConnection(draft: ConnectionDraft): Promise<Connection> {
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('agent_connections')
    .insert({ kind: 'http_tool', name: draft.name.trim(), tool_id: draft.toolId.trim() || toolIdFrom(draft.name), description: draft.description.trim(), config: toConfig(draft), created_by: auth.user?.id ?? null })
    .select('*')
    .single();
  if (error) fail(error);
  return fromRow(data);
}

export async function setConnectionEnabled(id: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.from('agent_connections').update({ enabled, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) fail(error);
}

export async function deleteConnection(id: string): Promise<void> {
  const { error } = await supabase.from('agent_connections').delete().eq('id', id);
  if (error) fail(error);
}

export interface TryResult {
  ok: boolean;
  status: number;
  body: string;
}

/** Try a read tool with sample inputs, through the platform, before saving it. */
export async function tryConnection(draft: ConnectionDraft, sample: Record<string, string>): Promise<TryResult> {
  const token = await freshToken();
  if (!token) throw new Error('Sign in again to try it.');
  const params = Object.fromEntries(draft.params.map((p) => [p.name, p.type === 'number' ? Number(sample[p.name]) : p.type === 'boolean' ? sample[p.name] === 'true' : (sample[p.name] ?? '')]));
  const response = await fetch(`${AGENT_PLATFORM_URL}/connections/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ config: toConfig(draft), sample: params }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await response.json().catch(() => ({}))) as Partial<TryResult> & { error?: string };
  if (!response.ok) throw new Error(body.error || `The agent platform answered ${response.status}.`);
  return { ok: Boolean(body.ok), status: body.status ?? 0, body: body.body ?? '' };
}

/** The form as it was when the web tool was saved, so it can be edited. The id stays: agents refer to it. */
export function draftFromHttp(connection: Connection): ConnectionDraft {
  const c = connection.config;
  return {
    name: connection.name,
    toolId: connection.toolId,
    description: connection.description,
    method: c.method ?? 'GET',
    url: c.url ?? 'https://',
    headers: Object.entries(c.headers ?? {}).map(([name, value]) => ({ name, value })),
    params: c.params ?? [],
    alwaysAsk: (c.method ?? 'GET') === 'GET' && c.risk === 'write',
    sendBody: c.body === 'json',
  };
}

export async function updateConnection(id: string, draft: ConnectionDraft): Promise<void> {
  const { error } = await supabase
    .from('agent_connections')
    .update({ name: draft.name.trim(), description: draft.description.trim(), config: toConfig(draft), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) fail(error);
}

export interface McpDraft {
  name: string;
  toolId: string;
  description: string;
  url: string;
  headers: { name: string; value: string }[];
  /** Tool names marked as only reading. */
  readOnly: string[];
}

export const emptyMcpDraft = (): McpDraft => ({ name: '', toolId: '', description: '', url: 'https://', headers: [], readOnly: [] });

export const toMcpConfig = (draft: McpDraft): McpServerConfig => ({
  url: draft.url.trim(),
  headers: Object.fromEntries(draft.headers.filter((h) => h.name.trim()).map((h) => [h.name.trim(), h.value])),
  readOnly: draft.readOnly,
});

export interface DiscoveredTool {
  name: string;
  description: string;
}

/** Connect to the server through the platform and list what it offers. Nothing is saved. */
export async function discoverServer(draft: McpDraft): Promise<{ tools: DiscoveredTool[]; error: string | null }> {
  const token = await freshToken();
  if (!token) throw new Error('Sign in again to check the server.');
  const response = await fetch(`${AGENT_PLATFORM_URL}/connections/discover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ config: toMcpConfig(draft) }),
    signal: AbortSignal.timeout(40_000),
  });
  const body = (await response.json().catch(() => ({}))) as { tools?: DiscoveredTool[]; error?: string };
  if (!response.ok) throw new Error(body.error || `The agent platform answered ${response.status}.`);
  return { tools: body.tools ?? [], error: body.error ?? null };
}

export function draftFromMcp(connection: Connection): McpDraft {
  const c = connection.config;
  return {
    name: connection.name,
    toolId: connection.toolId,
    description: connection.description,
    url: c.url ?? 'https://',
    headers: Object.entries(c.headers ?? {}).map(([name, value]) => ({ name, value })),
    readOnly: c.readOnly ?? [],
  };
}

export async function updateMcpServer(id: string, draft: McpDraft): Promise<void> {
  const { error } = await supabase
    .from('agent_connections')
    .update({ name: draft.name.trim(), description: draft.description.trim(), config: toMcpConfig(draft), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) fail(error);
}

export async function addMcpServer(draft: McpDraft): Promise<Connection> {
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('agent_connections')
    .insert({ kind: 'mcp', name: draft.name.trim(), tool_id: draft.toolId.trim() || toolIdFrom(draft.name), description: draft.description.trim(), config: toMcpConfig(draft), created_by: auth.user?.id ?? null })
    .select('*')
    .single();
  if (error) fail(error);
  return fromRow(data);
}
