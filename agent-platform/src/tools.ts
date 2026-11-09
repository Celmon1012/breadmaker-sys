// The Ops agent's tools. Every one is read-only: none changes a server, a record or a message. Anything that would
// change something belongs in Phase 2, behind an approval. Output is redacted and clipped before the model sees it.
import dns from 'node:dns/promises';
import net from 'node:net';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { config } from './config.ts';
import { clip, redact } from './redact.ts';
import { funnelJobs } from './store.ts';
import { writeTools } from './approvals.ts';

async function coolify<T>(path: string): Promise<T> {
  if (!config.coolifyUrl || !config.coolifyToken) throw new Error('Coolify is not connected to the agent platform (COOLIFY_API_URL, COOLIFY_API_TOKEN).');
  const response = await fetch(`${config.coolifyUrl}/api/v1${path}`, {
    headers: { Authorization: `Bearer ${config.coolifyToken}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Coolify ${response.status}: ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export const listResources = createTool({
  id: 'list_resources',
  description: 'List the applications and services on the server with their status (running, exited, unhealthy), address and git source. Start here to find a uuid.',
  inputSchema: z.object({ filter: z.string().optional().describe('Only items whose name or address contains this text') }),
  execute: async ({ filter }) => {
    const [apps, services] = await Promise.all([
      coolify<{ uuid: string; name: string; status: string; fqdn?: string; git_repository?: string }[]>('/applications'),
      coolify<{ uuid: string; name: string; status: string }[]>('/services'),
    ]);
    const match = (text: string) => !filter || text.toLowerCase().includes(filter.toLowerCase());
    return {
      applications: apps.filter((a) => match(`${a.name} ${a.fqdn ?? ''}`)).map((a) => ({ uuid: a.uuid, name: a.name, status: a.status, address: a.fqdn ?? null, repo: a.git_repository ?? null })),
      services: services.filter((s) => match(s.name)).map((s) => ({ uuid: s.uuid, name: s.name, status: s.status })),
    };
  },
});

export const appLogs = createTool({
  id: 'app_logs',
  description: 'Read the latest runtime log lines of one application (by uuid). Secrets are removed.',
  inputSchema: z.object({ uuid: z.string(), lines: z.number().int().min(10).max(200).default(80) }),
  execute: async ({ uuid, lines }) => {
    const data = await coolify<{ logs?: string } | string>(`/applications/${encodeURIComponent(uuid)}/logs?lines=${lines}`);
    const text = typeof data === 'string' ? data : data.logs ?? JSON.stringify(data);
    return { logs: clip(redact(text), 6000) };
  },
});

export const appDeployments = createTool({
  id: 'app_deployments',
  description: 'Recent deployments of one application (by uuid): status, commit and time. Use it to see whether the latest push built and went live.',
  inputSchema: z.object({ uuid: z.string() }),
  execute: async ({ uuid }) => {
    const data = await coolify<{ deployments?: unknown[] } | unknown[]>(`/deployments/applications/${encodeURIComponent(uuid)}?take=5`);
    const rows = (Array.isArray(data) ? data : data.deployments ?? []) as { status?: string; commit?: string; created_at?: string; finished_at?: string }[];
    return { deployments: rows.slice(0, 5).map((d) => ({ status: d.status, commit: d.commit?.slice(0, 8), created_at: d.created_at, finished_at: d.finished_at ?? null })) };
  },
});

// Only public addresses can be checked: an agent must not be a way to probe the internal network.
export const isPrivateAddress = (ip: string) => {
  if (net.isIPv6(ip)) return ip === '::1' || /^f[cd]/i.test(ip) || /^fe80/i.test(ip) || ip.startsWith('::ffff:');
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
};

export const httpCheck = createTool({
  id: 'http_check',
  description: 'Fetch a public web address and report the status code, time taken, redirect target and page title. Does not follow redirects.',
  inputSchema: z.object({ url: z.string().url() }),
  execute: async ({ url }) => {
    const target = new URL(url);
    if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Only http and https addresses can be checked.');
    const addresses = await dns.lookup(target.hostname, { all: true }).catch(() => []);
    if (!addresses.length) return { ok: false, error: `${target.hostname} does not resolve.` };
    if (addresses.some((a) => isPrivateAddress(a.address))) throw new Error('That address is internal and cannot be checked.');
    const started = Date.now();
    try {
      const response = await fetch(target, { redirect: 'manual', signal: AbortSignal.timeout(15_000), headers: { 'User-Agent': 'breadmaker-ops-agent/0.1' } });
      const body = (await response.text()).slice(0, 20_000);
      return {
        ok: response.status < 400,
        status: response.status,
        ms: Date.now() - started,
        redirectsTo: response.headers.get('location'),
        title: /<title[^>]*>([^<]*)<\/title>/i.exec(body)?.[1]?.trim() ?? null,
        server: response.headers.get('server'),
      };
    } catch (error) {
      return { ok: false, ms: Date.now() - started, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
    }
  },
});

export const dnsLookup = createTool({
  id: 'dns_lookup',
  description: 'Look up the DNS records (A, AAAA, CNAME, NS, MX, TXT) of a domain, to check where it points.',
  inputSchema: z.object({ domain: z.string().regex(/^[a-z0-9.-]+$/i) }),
  execute: async ({ domain }) => {
    const attempt = async <T>(run: () => Promise<T>) => run().catch(() => null);
    const [a, aaaa, cname, ns, mx, txt] = await Promise.all([
      attempt(() => dns.resolve4(domain)),
      attempt(() => dns.resolve6(domain)),
      attempt(() => dns.resolveCname(domain)),
      attempt(() => dns.resolveNs(domain)),
      attempt(() => dns.resolveMx(domain)),
      attempt(() => dns.resolveTxt(domain)),
    ]);
    return { a, aaaa, cname, ns, mx, txt: txt?.map((parts) => redact(parts.join('')).slice(0, 200)) ?? null };
  },
});

export const funnelStatus = createTool({
  id: 'funnel_status',
  description: 'Where Launchpad funnels are in the build: status, site address, custom domain and its status, and the last build log steps. Pass a site slug for one funnel, or nothing for the 15 most recently updated. Holds no customer details.',
  inputSchema: z.object({ slug: z.string().optional() }),
  execute: async ({ slug }) => {
    const jobs = await funnelJobs(slug);
    return {
      funnels: jobs.map((job) => ({
        slug: job.site_slug,
        status: job.status,
        site_url: (job.outputs as { site_url?: string }).site_url ?? null,
        custom_domain: job.custom_domain,
        domain_status: job.domain_status || null,
        updated_at: job.updated_at,
        last_steps: (job.log ?? []).slice(-4).map((entry) => ({ at: entry.at, step: entry.step, ok: entry.ok, detail: redact(String(entry.detail ?? '')).slice(0, 200) })),
      })),
    };
  },
});

// The write tools never act on their own: each one files a request that a person approves (see approvals.ts).
export const opsTools = { list_resources: listResources, app_logs: appLogs, app_deployments: appDeployments, http_check: httpCheck, dns_lookup: dnsLookup, funnel_status: funnelStatus, ...writeTools };

/** What the console's tools grid shows: each tool, its risk tier, and what it can touch. A write tool only files a request for approval. */
export const toolCatalog = [
  { id: 'list_resources', system: 'Coolify', risk: 'read', summary: 'Applications and services with their status' },
  { id: 'app_logs', system: 'Coolify', risk: 'read', summary: 'Latest runtime log lines of an application, secrets removed' },
  { id: 'app_deployments', system: 'Coolify', risk: 'read', summary: 'Recent deployments: did the last push build and go live' },
  { id: 'http_check', system: 'Web', risk: 'read', summary: 'Status, time and redirect of a public address' },
  { id: 'dns_lookup', system: 'DNS', risk: 'read', summary: 'Where a domain points' },
  { id: 'funnel_status', system: 'Supabase', risk: 'read', summary: 'Launchpad build status, site address and domain state' },
  { id: 'restart_app', system: 'Coolify', risk: 'write', summary: 'Ask for an app to be restarted. A person approves first' },
  { id: 'redeploy_app', system: 'Coolify', risk: 'write', summary: 'Ask for an app to be rebuilt and redeployed. A person approves first' },
] as const;
