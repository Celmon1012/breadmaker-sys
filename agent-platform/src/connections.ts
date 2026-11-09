// Connections: tools defined as data. A web tool is one HTTP call with a name and a description the agent reads.
// Reads run when the agent calls them; anything that changes something goes through the approval queue. The platform
// is careful here because the address and headers are written by people, not by us:
//   - https only, a fixed host (parameters can fill the path and query, never the host), public addresses only;
//   - no redirects followed, a 15 second limit, and a 6,000 character cap on what comes back;
//   - secrets are named ({{secret:KUMODA}}), never stored: they are read from CONN_SECRET_KUMODA in the platform's
//     settings, and only settings with that prefix can be asked for;
//   - everything that comes back is redacted before an agent or a person sees it.
import dns from 'node:dns/promises';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { approvalTool, addActionResolver, type Action } from './approvals.ts';
import { redact, safe } from './redact.ts';
import { listConnections, type ConnectionRow } from './store.ts';
import { isPrivateAddress } from './tools.ts';

export class InvalidConnection extends Error {}

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export interface Param {
  name: string;
  type: 'string' | 'number' | 'boolean';
  description: string;
}
export interface HttpConfig {
  method: Method;
  url: string;
  headers: Record<string, string>;
  params: Param[];
  body: 'none' | 'json';
  risk: 'read' | 'write';
}

const METHODS: Method[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const FORBIDDEN_HEADERS = new Set(['host', 'content-length', 'connection', 'transfer-encoding', 'cookie']);
const PLACEHOLDER = /\{\{\s*([a-z][a-z0-9_]*|secret:[A-Z][A-Z0-9_]*)\s*\}\}/g;

/** Check a web tool's definition and return it cleaned. Throws InvalidConnection with a message a person can act on. */
export function validateHttpConfig(input: unknown): HttpConfig {
  const config = (input ?? {}) as Partial<HttpConfig>;
  const method = String(config.method ?? 'GET').toUpperCase() as Method;
  if (!METHODS.includes(method)) throw new InvalidConnection('Choose GET, POST, PUT, PATCH or DELETE.');
  const url = String(config.url ?? '').trim();
  let parsed: URL;
  try {
    parsed = new URL(url.replace(PLACEHOLDER, 'x'));
  } catch {
    throw new InvalidConnection('The address is not a valid web address.');
  }
  if (parsed.protocol !== 'https:') throw new InvalidConnection('The address must start with https://.');
  const hostPart = url.replace(/^https:\/\//, '').split(/[/?#]/)[0];
  if (hostPart.includes('{{')) {
    throw new InvalidConnection('The host name cannot contain a placeholder. Parameters can fill the path or the query, not where the call goes.');
  }
  if (isPrivateAddress(parsed.hostname) || parsed.hostname === 'localhost') throw new InvalidConnection('That address is internal. Only public addresses can be called.');

  const params: Param[] = (Array.isArray(config.params) ? config.params : []).slice(0, 12).map((p) => {
    const name = String(p?.name ?? '');
    if (!/^[a-z][a-z0-9_]{0,30}$/.test(name)) throw new InvalidConnection(`"${name}" is not a valid input name: use lower-case words and underscores.`);
    const type = p?.type === 'number' || p?.type === 'boolean' ? p.type : 'string';
    return { name, type, description: String(p?.description ?? '').slice(0, 200) };
  });
  const declared = new Set(params.map((p) => p.name));
  if (declared.size !== params.length) throw new InvalidConnection('Two inputs have the same name.');

  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(config.headers ?? {}).slice(0, 12)) {
    if (!/^[A-Za-z0-9-]{1,40}$/.test(name) || FORBIDDEN_HEADERS.has(name.toLowerCase())) throw new InvalidConnection(`The header "${name}" cannot be set.`);
    headers[name] = String(value).slice(0, 300);
  }
  for (const text of [url, ...Object.values(headers)]) {
    for (const match of text.matchAll(PLACEHOLDER)) {
      const key = match[1];
      if (!key.startsWith('secret:') && !declared.has(key)) throw new InvalidConnection(`{{${key}}} is not one of the inputs. Add it as an input, or use {{secret:NAME}} for a secret.`);
    }
  }
  // Only a GET can be a read. Anything else changes something, so it always needs approval.
  const risk: 'read' | 'write' = method === 'GET' && config.risk !== 'write' ? 'read' : 'write';
  return { method, url, headers, params, body: config.body === 'json' && method !== 'GET' ? 'json' : 'none', risk };
}

/** The setting a secret name reads from. Only CONN_SECRET_ settings can be asked for. */
export const secretSetting = (name: string) => `CONN_SECRET_${name}`;

export function fill(text: string, input: Record<string, unknown>, encode: boolean): string {
  return text.replace(PLACEHOLDER, (_all, key: string) => {
    if (key.startsWith('secret:')) {
      const setting = secretSetting(key.slice(7));
      const value = process.env[setting];
      if (!value) throw new Error(`The secret is not set: add ${setting} to the platform settings in Coolify.`);
      return value;
    }
    const value = String(input[key] ?? '');
    return encode ? encodeURIComponent(value) : value;
  });
}

/** Make the call. Returns what came back, trimmed and redacted. Throws a plain message when it cannot be made. */
export async function runHttp(config: HttpConfig, input: Record<string, unknown>): Promise<{ ok: boolean; status: number; body: string }> {
  const url = new URL(fill(config.url, input, true));
  if (url.protocol !== 'https:') throw new Error('Only https addresses can be called.');
  const addresses = await dns.lookup(url.hostname, { all: true }).catch(() => []);
  if (!addresses.length) throw new Error(`${url.hostname} does not resolve.`);
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new Error('That address is internal and cannot be called.');

  const headers: Record<string, string> = { Accept: 'application/json, text/plain;q=0.9, */*;q=0.5', 'User-Agent': 'breadmaker-agent/0.1' };
  for (const [name, value] of Object.entries(config.headers)) headers[name] = fill(value, input, false);
  let body: string | undefined;
  if (config.body === 'json') {
    const inUrl = new Set([...config.url.matchAll(PLACEHOLDER)].map((m) => m[1]));
    body = JSON.stringify(Object.fromEntries(config.params.filter((p) => !inUrl.has(p.name)).map((p) => [p.name, input[p.name]])));
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(url, { method: config.method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(15_000) });
  const text = (await response.text()).slice(0, 6000);
  return { ok: response.status < 400, status: response.status, body: redact(text) };
}

const zodFor = (params: Param[]) =>
  z.object(
    Object.fromEntries(
      params.map((p) => {
        const base = p.type === 'number' ? z.number() : p.type === 'boolean' ? z.boolean() : z.string().max(500);
        return [p.name, base.describe(p.description || p.name)];
      }),
    ),
  );

const hostOf = (config: HttpConfig) => new URL(config.url.replace(PLACEHOLDER, 'x')).host;

function actionFor(row: ConnectionRow, config: HttpConfig): Action {
  return {
    description: `${row.description} This changes something outside, so it does not run now: a person must approve it first.`,
    input: zodFor(config.params) as never,
    // What the approver reads: the real address with the real inputs filled in, and any secret hidden.
    summary: (input) => {
      const shown = new URL(config.url.replace(PLACEHOLDER, (_m, key: string) => (key.startsWith('secret:') ? 'secret' : encodeURIComponent(String(input[key] ?? '')))));
      return `Call "${row.name}": ${config.method} ${shown.host}${shown.pathname}${shown.search} with ${safe(input, 300)}`;
    },
    run: async (input) => {
      const result = await runHttp(config, input);
      return safe(`HTTP ${result.status}: ${result.body}`, 400);
    },
  };
}

let cache: { at: number; rows: ConnectionRow[] } | null = null;
/** The enabled web tools. Cached for a short while so a run does not read the table twice; changes show within seconds. */
async function rows(): Promise<ConnectionRow[]> {
  if (!cache || Date.now() - cache.at > 15_000) cache = { at: Date.now(), rows: (await listConnections().catch(() => [])).filter((row) => row.enabled && row.kind === 'http_tool') };
  return cache.rows;
}
export const forgetConnections = () => {
  cache = null;
};

/** The tools the enabled web tools provide, ready for an agent to use. A bad definition is skipped, not fatal. */
export async function connectionTools(): Promise<Record<string, unknown>> {
  const tools: Record<string, unknown> = {};
  for (const row of await rows()) {
    try {
      const config = validateHttpConfig(row.config);
      tools[row.tool_id] =
        config.risk === 'read'
          ? createTool({
              id: row.tool_id,
              description: row.description,
              inputSchema: zodFor(config.params),
              execute: async (input: Record<string, unknown>) => {
                try {
                  return await runHttp(config, input);
                } catch (error) {
                  return { ok: false, status: 0, body: safe(error instanceof Error ? error.message : String(error), 300) };
                }
              },
            })
          : approvalTool(row.tool_id, actionFor(row, config));
    } catch {
      // A definition that no longer validates is left out; the studio shows it as broken.
    }
  }
  return tools;
}

/** For the tools list in the studio: each enabled web tool, with where it goes and whether it needs approval. */
export async function connectionCatalog() {
  const out: { id: string; system: string; risk: 'read' | 'write'; summary: string }[] = [];
  for (const row of await rows()) {
    try {
      const config = validateHttpConfig(row.config);
      out.push({ id: row.tool_id, system: hostOf(config), risk: config.risk, summary: row.description });
    } catch {
      /* skipped, as above */
    }
  }
  return out;
}

/** Enabled web tools whose definition no longer passes the checks: they are not offered to agents, and the studio says why. */
export async function connectionProblems(): Promise<{ id: string; reason: string }[]> {
  const out: { id: string; reason: string }[] = [];
  for (const row of await rows()) {
    try {
      validateHttpConfig(row.config);
    } catch (error) {
      out.push({ id: row.tool_id, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return out;
}

// An approved request for a web tool is carried out here, by tool id.
addActionResolver(async (toolId) => {
  const row = (await rows()).find((r) => r.tool_id === toolId);
  if (!row) return undefined;
  const config = validateHttpConfig(row.config);
  return config.risk === 'write' ? actionFor(row, config) : undefined;
});
