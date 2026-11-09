// Coolify API access and the address rules for Launchpad sites.
//
// Env: COOLIFY_API_URL (the bare address, https://cp.restart.ng, shared with deploy-restart), COOLIFY_API_TOKEN
// (permissions: read, write, deploy), SITES_DOMAIN (breadmaker.site), optional SITES_SERVER_IP (the server the
// wildcard DNS record points at; default 185.239.208.31).
import { env } from './flutterwave.ts';

export const sitesDomain = () => env('SITES_DOMAIN', 'breadmaker.site');
export const sitesIp = () => env('SITES_SERVER_IP', '185.239.208.31');

export async function coolify(path: string, init: RequestInit = {}): Promise<{ status: number; data: any }> {
  const base = env('COOLIFY_API_URL').replace(/\/+$/, '').replace(/\/api\/v1$/, '') + '/api/v1';
  const token = env('COOLIFY_API_TOKEN');
  if (!env('COOLIFY_API_URL') || !token) throw new Error('Coolify is not set up: add COOLIFY_API_URL and COOLIFY_API_TOKEN to the edge-functions environment.');
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json', ...(init.headers ?? {}) },
  });
  return { status: response.status, data: await response.json().catch(() => null) };
}

/** Points the Coolify app at these hostnames (comma-separated https URLs) and redeploys it. */
export async function setSiteDomains(coolifyUuid: string, hosts: string[]): Promise<void> {
  const update = await coolify(`/applications/${coolifyUuid}`, { method: 'PATCH', body: JSON.stringify({ domains: hosts.map((host) => `https://${host}`).join(',') }) });
  if (update.status >= 300) throw new Error(`Coolify could not change the address (${update.status}): ${update.data?.message ?? 'unknown error'}`);
  const deploy = await deployApp(coolifyUuid);
  if (deploy.status >= 300) throw new Error(`Coolify could not redeploy (${deploy.status}).`);
}

/** Starts a deployment. Newer Coolify wants POST, older GET, so try POST and fall back when it is refused. */
export async function deployApp(coolifyUuid: string): Promise<{ status: number; data: any }> {
  const path = `/deploy?uuid=${coolifyUuid}`;
  const posted = await coolify(path, { method: 'POST' });
  if (posted.status !== 405 && posted.status !== 404) return posted;
  return coolify(path);
}

// Names that must never become a customer's address.
const RESERVED = new Set([
  'www', 'app', 'api', 'admin', 'mail', 'email', 'smtp', 'cp', 'db', 'console', 'hub', 'studio', 'dashboard', 'login', 'signin', 'billing', 'pay', 'payments',
  'support', 'help', 'status', 'blog', 'docs', 'cdn', 'static', 'assets', 'ftp', 'ns1', 'ns2', 'kumoda', 'launchpad', 'foundry', 'breadmaker', 'breadmakers',
  'agents', 'agent', 'restart', 'test', 'demo', 'staging', 'preview', 'sites', 'site', 'root', 'null', 'undefined',
]);

/** A single DNS label a customer can pick: 3 to 30 letters, numbers and hyphens, not starting or ending with a hyphen. */
export function checkSlug(value: string): { ok: true; slug: string } | { ok: false; reason: string } {
  const slug = value.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/.test(slug)) return { ok: false, reason: 'Use 3 to 30 letters, numbers or hyphens, starting and ending with a letter or number.' };
  if (slug.includes('--')) return { ok: false, reason: 'Please avoid double hyphens.' };
  if (RESERVED.has(slug)) return { ok: false, reason: 'That name is reserved. Please choose another.' };
  return { ok: true, slug };
}

/** Cleans what someone typed as their domain ("https://www.Example.com/page" -> "www.example.com"). */
export function checkDomain(value: string): { ok: true; domain: string } | { ok: false; reason: string } {
  const domain = value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/\.$/, '');
  if (!/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(domain)) return { ok: false, reason: 'That does not look like a domain name. Try something like yourbusiness.com.' };
  const ours = sitesDomain();
  if (domain === ours || domain.endsWith(`.${ours}`)) return { ok: false, reason: `Use a domain you own, not an address on ${ours}.` };
  if (/(^|\.)(breadmakersystems\.com|restart\.ng|kumoda\.io|yata\.network)$/.test(domain)) return { ok: false, reason: 'That domain belongs to us. Please use your own.' };
  return { ok: true, domain };
}

/** Looks the domain up over DNS-over-HTTPS. Verified when it already points at our server, directly or by CNAME. */
export async function domainPointsHere(domain: string): Promise<{ verified: boolean; found: string[] }> {
  const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A`, {
    headers: { Accept: 'application/dns-json' },
    signal: AbortSignal.timeout(8000),
  });
  const data = await response.json().catch(() => null);
  const answers: { type: number; data: string }[] = Array.isArray(data?.Answer) ? data.Answer : [];
  const found = answers.map((answer) => answer.data.replace(/\.$/, ''));
  const verified = answers.some((answer) => (answer.type === 1 && answer.data === sitesIp()) || (answer.type === 5 && answer.data.replace(/\.$/, '').endsWith(`.${sitesDomain()}`)));
  return { verified, found };
}
