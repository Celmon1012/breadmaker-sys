// MCP servers as connections. An MCP server publishes its own tools; the platform connects, lists them, and offers each
// to agents under "<server>_<tool>". The platform does not know what a server's tools do, so it is cautious by default:
//   - a tool runs on its own only if the person who added the server marked it as read-only;
//   - every other tool can only file a request that a person approves first (the same queue as a restart);
//   - the server's address is https, a fixed public host; its key is named ({{secret:NAME}}), never stored;
//   - whatever a server returns is data: it is trimmed and redacted before an agent sees it.
import dns from 'node:dns/promises';
import { MCPClient } from '@mastra/mcp';
import { createTool } from '@mastra/core/tools';
import { addActionResolver, approvalTool, type Action } from './approvals.ts';
import { InvalidConnection, fill } from './connections.ts';
import { safe } from './redact.ts';
import { listConnections } from './store.ts';
import { isPrivateAddress } from './tools.ts';

export interface McpConfig {
  url: string;
  headers: Record<string, string>;
  /** Raw tool names (as the server calls them) that only read, and so may run without approval. */
  readOnly: string[];
}

const PLACEHOLDER = /\{\{\s*secret:([A-Z][A-Z0-9_]*)\s*\}\}/g;
const FORBIDDEN_HEADERS = new Set(['host', 'content-length', 'connection', 'transfer-encoding', 'cookie']);

/** Check an MCP server's setup and return it cleaned. Throws InvalidConnection with a message a person can act on. */
export function validateMcpConfig(input: unknown): McpConfig {
  const config = (input ?? {}) as Partial<McpConfig>;
  const url = String(config.url ?? '').trim();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new InvalidConnection('The server address is not a valid web address.');
  }
  if (parsed.protocol !== 'https:') throw new InvalidConnection('The server address must start with https://.');
  if (isPrivateAddress(parsed.hostname) || parsed.hostname === 'localhost') throw new InvalidConnection('That address is internal. Only public servers can be connected.');
  if (/\{\{/.test(parsed.host)) throw new InvalidConnection('The host name cannot contain a placeholder.');
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(config.headers ?? {}).slice(0, 12)) {
    if (!/^[A-Za-z0-9-]{1,40}$/.test(name) || FORBIDDEN_HEADERS.has(name.toLowerCase())) throw new InvalidConnection(`The header "${name}" cannot be set.`);
    const text = String(value).slice(0, 300);
    if (/\{\{/.test(text.replace(PLACEHOLDER, ''))) throw new InvalidConnection('A header can only contain {{secret:NAME}} markers.');
    headers[name] = text;
  }
  const readOnly = [...new Set((Array.isArray(config.readOnly) ? config.readOnly : []).map(String))].slice(0, 100);
  if (readOnly.some((name) => !/^[A-Za-z0-9_.:-]{1,100}$/.test(name))) throw new InvalidConnection('A tool name has characters it cannot have.');
  return { url, headers, readOnly };
}

export interface McpProblem {
  id: string;
  reason: string;
}
interface CatalogEntry {
  id: string;
  system: string;
  risk: 'read' | 'write';
  summary: string;
}
interface Loaded {
  tools: Record<string, unknown>;
  catalog: CatalogEntry[];
  problems: McpProblem[];
  actions: Map<string, Action>;
}

interface ClientLike {
  listToolsWithErrors: (options?: { perServerTimeoutMs?: number }) => Promise<{ tools: Record<string, any>; errors: Record<string, string> }>;
  disconnect: () => Promise<void>;
}

/** A seam for tests: when set, this builds the client instead of connecting to a real server. */
export const testing: { client?: (id: string, server: string, config: McpConfig) => ClientLike } = {};

async function assertPublic(url: string) {
  const host = new URL(url).hostname;
  const addresses = await dns.lookup(host, { all: true }).catch(() => []);
  if (!addresses.length) throw new Error(`${host} does not resolve.`);
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new Error('That server address is internal and cannot be connected.');
}

function makeClient(id: string, server: string, config: McpConfig): ClientLike {
  if (testing.client) return testing.client(id, server, config);
  const headers = Object.fromEntries(Object.entries(config.headers).map(([name, value]) => [name, fill(value, {}, false)]));
  return new MCPClient({
    id,
    servers: { [server]: { url: new URL(config.url), requestInit: { headers } } },
    timeout: 15_000,
    registerProcessHooks: false,
  }) as unknown as ClientLike;
}

const trim = (value: unknown) => ({ result: safe(value, 6000) });

let cache: { at: number; loaded: Loaded; clients: ClientLike[] } | null = null;

async function load(): Promise<Loaded> {
  if (cache && Date.now() - cache.at < 60_000) return cache.loaded;
  // Let go of the connections from the last load before making new ones.
  for (const old of cache?.clients ?? []) await old.disconnect().catch(() => undefined);
  const loaded: Loaded = { tools: {}, catalog: [], problems: [], actions: new Map() };
  const clients: ClientLike[] = [];
  const rows = (await listConnections().catch(() => [])).filter((row) => row.enabled && row.kind === 'mcp');
  for (const row of rows) {
    try {
      const config = validateMcpConfig(row.config);
      await assertPublic(config.url);
      const client = makeClient(`conn-${row.id}`, row.tool_id, config);
      clients.push(client);
      const { tools, errors } = await client.listToolsWithErrors({ perServerTimeoutMs: 10_000 });
      if (errors?.[row.tool_id]) throw new Error(errors[row.tool_id]);
      for (const [key, tool] of Object.entries(tools)) {
        const raw = key.startsWith(`${row.tool_id}_`) ? key.slice(row.tool_id.length + 1) : key;
        const readOnly = config.readOnly.includes(raw) || config.readOnly.includes(key);
        const description = String(tool.description ?? raw).slice(0, 300);
        if (readOnly) {
          loaded.tools[key] = createTool({
            id: key,
            description: `${description} (via ${row.name})`,
            inputSchema: tool.inputSchema,
            execute: async (input: unknown, context: unknown) => trim(await tool.execute(input, context)),
          } as never);
        } else {
          const action: Action = {
            description: `${description} (via ${row.name}). This may change something, so it does not run now: a person must approve it first.`,
            input: tool.inputSchema,
            summary: (input) => `Use "${raw}" on ${row.name} with ${safe(input, 300)}`,
            run: async (input) => safe(await tool.execute(input, {}), 400),
          };
          loaded.actions.set(key, action);
          loaded.tools[key] = approvalTool(key, action);
        }
        loaded.catalog.push({ id: key, system: row.name, risk: readOnly ? 'read' : 'write', summary: description });
      }
    } catch (error) {
      loaded.problems.push({ id: row.tool_id, reason: safe(error instanceof Error ? error.message : String(error), 200) });
    }
  }
  cache = { at: Date.now(), loaded, clients };
  return loaded;
}

export const mcpTools = async () => (await load()).tools;
export const mcpCatalog = async () => (await load()).catalog;
export const mcpProblems = async () => (await load()).problems;
export const forgetMcp = () => {
  cache = null;
};

/** For the setup screen: connect to a server, list what it offers, and let go. Nothing is saved. */
export async function discoverMcp(input: unknown): Promise<{ name: string; description: string }[]> {
  const config = validateMcpConfig(input);
  await assertPublic(config.url);
  const client = makeClient('conn-discover', 'server', config);
  try {
    const { tools, errors } = await client.listToolsWithErrors({ perServerTimeoutMs: 10_000 });
    if (errors?.server) throw new Error(errors.server);
    return Object.entries(tools).map(([key, tool]) => ({ name: key.startsWith('server_') ? key.slice(7) : key, description: String(tool.description ?? '').slice(0, 200) }));
  } finally {
    await client.disconnect().catch(() => undefined);
  }
}

// An approved request for an MCP tool is carried out here, by its namespaced id.
addActionResolver(async (toolId) => (await load()).actions.get(toolId));
