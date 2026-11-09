// GitHub access for the Launchpad site builder.
//
// Two ways to authenticate, tried in this order:
//   1. A GitHub App installed on the organisation (preferred; not tied to a person's account):
//      GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID, GITHUB_APP_PRIVATE_KEY (the PEM, newlines may be written as \n).
//      Needs repository permissions Administration (read and write), Contents (read and write), Metadata (read).
//   2. A fine-grained personal access token for the organisation: GITHUB_TOKEN, with the same permissions.
//
// Optional: GITHUB_ORG (default Restart-inc), GITHUB_TEMPLATE_REPO (default launchpad-funnel-template).
import { env } from './flutterwave.ts';

export const githubOrg = () => env('GITHUB_ORG', 'Restart-inc');
export const templateRepo = () => env('GITHUB_TEMPLATE_REPO', 'launchpad-funnel-template');

const b64url = (bytes: Uint8Array | string) => {
  const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  let binary = '';
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const derLength = (length: number) => {
  if (length < 0x80) return new Uint8Array([length]);
  const bytes: number[] = [];
  for (let n = length; n > 0; n >>= 8) bytes.unshift(n & 0xff);
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
};

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

/** GitHub issues "BEGIN RSA PRIVATE KEY" (PKCS#1); Web Crypto only imports PKCS#8, so wrap it. */
function pemToPkcs8(pem: string): Uint8Array {
  const text = pem.replace(/\\n/g, '\n');
  const body = text.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  if (!/BEGIN RSA PRIVATE KEY/.test(text)) return der; // already PKCS#8
  const rsaOid = new Uint8Array([0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]);
  const octet = concat(new Uint8Array([0x04]), derLength(der.length), der);
  const inner = concat(new Uint8Array([0x02, 0x01, 0x00]), rsaOid, octet);
  return concat(new Uint8Array([0x30]), derLength(inner.length), inner);
}

/**
 * The app's private key, as a PEM. Multi-line values are often cut to their first line on the way from the
 * Coolify environment into the container, so the key is best stored as ONE line: the base64 of the .pem file.
 * A plain PEM (real newlines, or \n written out) still works.
 */
function readPem(): string {
  let raw = env('GITHUB_APP_PRIVATE_KEY').trim();
  if (!raw.includes('BEGIN')) {
    try {
      raw = atob(raw.replace(/\s+/g, ''));
    } catch {
      /* not base64: fall through to the check below */
    }
  }
  raw = raw.replace(/\\n/g, '\n');
  const body = raw.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  if (!/BEGIN [A-Z ]*PRIVATE KEY/.test(raw) || body.length < 400) {
    throw new Error(
      `GITHUB_APP_PRIVATE_KEY looks incomplete (${env('GITHUB_APP_PRIVATE_KEY').length} characters). Store it as one line: the base64 of the .pem file.`,
    );
  }
  return raw;
}

async function appToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: env('GITHUB_APP_ID') }));
  const key = await crypto.subtle.importKey('pkcs8', pemToPkcs8(readPem()), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${payload}`)));
  const jwt = `${header}.${payload}.${b64url(signature)}`;
  const response = await fetch(`https://api.github.com/app/installations/${env('GITHUB_APP_INSTALLATION_ID')}/access_tokens`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/vnd.github+json', 'User-Agent': 'breadmaker-build-deploy' },
  });
  if (!response.ok) throw new Error(`GitHub App sign-in failed (${response.status}). Check GITHUB_APP_ID, the installation id and the private key.`);
  return (await response.json()).token as string;
}

let cached: { token: string; until: number } | null = null;

export async function githubToken(): Promise<string> {
  if (cached && cached.until > Date.now()) return cached.token;
  if (env('GITHUB_APP_ID') && env('GITHUB_APP_INSTALLATION_ID') && env('GITHUB_APP_PRIVATE_KEY')) {
    const token = await appToken();
    cached = { token, until: Date.now() + 50 * 60 * 1000 };
    return token;
  }
  const token = env('GITHUB_TOKEN');
  if (!token) throw new Error('GitHub is not set up: add the GitHub App settings or GITHUB_TOKEN to the edge-functions environment.');
  return token;
}

/** A call to the GitHub REST API. Returns the parsed JSON body (or null for 204) and the status. */
export async function github(path: string, init: RequestInit = {}): Promise<{ status: number; data: any }> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${await githubToken()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'breadmaker-build-deploy',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  return { status: response.status, data };
}

const toBase64 = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

/** Creates a private repo from the funnel template, and waits until its files exist. */
export async function createFromTemplate(name: string, description: string): Promise<void> {
  const { status, data } = await github(`/repos/${githubOrg()}/${templateRepo()}/generate`, {
    method: 'POST',
    body: JSON.stringify({ owner: githubOrg(), name, description, private: true, include_all_branches: false }),
  });
  if (status !== 201) throw new Error(`Could not create the repository (${status}): ${data?.message ?? 'unknown error'}`);
  for (let attempt = 0; attempt < 15; attempt++) {
    const probe = await github(`/repos/${githubOrg()}/${name}/contents/funnel.json`);
    if (probe.status === 200) return;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error('The new repository did not finish copying from the template in time.');
}

/** Writes (creates or replaces) a text file on the default branch. */
export async function putFile(repo: string, path: string, content: string, message: string): Promise<void> {
  const existing = await github(`/repos/${githubOrg()}/${repo}/contents/${path}`);
  const { status, data } = await github(`/repos/${githubOrg()}/${repo}/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content: toBase64(content), ...(existing.status === 200 ? { sha: existing.data.sha } : {}) }),
  });
  if (status !== 200 && status !== 201) throw new Error(`Could not write ${path} (${status}): ${data?.message ?? 'unknown error'}`);
}

/** Reads a text file from a repo's default branch, or null if it is not there. */
export async function getFile(repo: string, path: string): Promise<string | null> {
  const { status, data } = await github(`/repos/${githubOrg()}/${repo}/contents/${path}`);
  if (status === 404) return null;
  if (status !== 200 || typeof data?.content !== 'string') throw new Error(`Could not read ${path} (${status}).`);
  const binary = atob(data.content.replace(/\n/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

/**
 * Brings a site's page builder up to date with the template. A site is a copy of the template made when it was
 * first built, so template improvements (new blocks, new styles) never reach it on their own: without this, a page
 * edited with newer blocks would be saved in funnel.json and ignored by the site's old builder. Only changed files
 * are written. Returns the files it updated.
 */
export async function syncBuilder(repo: string): Promise<string[]> {
  const changed: string[] = [];
  for (const path of ['scripts/build.mjs', 'scripts/page.css']) {
    const wanted = await getFile(templateRepo(), path);
    if (wanted === null) continue;
    if ((await getFile(repo, path)) === wanted) continue;
    await putFile(repo, path, wanted, 'Update the page builder from the template');
    changed.push(path);
  }
  return changed;
}
