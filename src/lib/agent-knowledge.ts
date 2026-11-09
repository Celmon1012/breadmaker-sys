import { supabase } from './supabase';
import { AGENT_PLATFORM_URL, freshToken } from './agent-runs';

/**
 * Knowledge: documents an agent answers from. Sources are read from breadmaker.agent_knowledge_sources (the team reads,
 * owners and coaches can remove one). Adding or re-reading a source goes through the agent platform, which fetches the
 * page, splits it into passages and stores them.
 */

export interface KnowledgeSource {
  id: string;
  agentId: string;
  name: string;
  kind: 'text' | 'url';
  url: string | null;
  status: 'ready' | 'failed';
  error: string | null;
  chunkCount: number;
  chars: number;
  updatedAt: string;
}

const fromRow = (row: Record<string, any>): KnowledgeSource => ({
  id: row.id,
  agentId: row.agent_id,
  name: row.name,
  kind: row.kind,
  url: row.url ?? null,
  status: row.status,
  error: row.error ?? null,
  chunkCount: row.chunk_count ?? 0,
  chars: row.chars ?? 0,
  updatedAt: row.updated_at,
});

export async function listSources(agentId: string): Promise<KnowledgeSource[]> {
  const { data, error } = await supabase.from('agent_knowledge_sources').select('*').eq('agent_id', agentId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(fromRow);
}

export async function removeSource(id: string): Promise<void> {
  const { error } = await supabase.from('agent_knowledge_sources').delete().eq('id', id);
  if (error) throw new Error(error.code === '42501' ? 'You cannot remove that source.' : error.message);
}

async function post(path: string, body: unknown): Promise<{ chunks: number; chars: number }> {
  const token = await freshToken();
  if (!token) throw new Error('Sign in again to change knowledge.');
  const response = await fetch(`${AGENT_PLATFORM_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  const result = (await response.json().catch(() => ({}))) as { chunks?: number; chars?: number; error?: string };
  if (!response.ok) throw new Error(result.error || `The agent platform answered ${response.status}.`);
  return { chunks: result.chunks ?? 0, chars: result.chars ?? 0 };
}

export const addText = (agentId: string, name: string, text: string) => post('/knowledge/ingest', { agentId, name, text });
export const addPage = (agentId: string, name: string, url: string) => post('/knowledge/ingest', { agentId, name, url });
export const readAgain = (sourceId: string) => post('/knowledge/refresh', { sourceId });

/** A name for a page source, taken from its address, when the person has not typed one. */
export function nameFromUrl(address: string): string {
  try {
    const url = new URL(address);
    return `${url.hostname}${url.pathname === '/' ? '' : url.pathname}`.slice(0, 80);
  } catch {
    return '';
  }
}
