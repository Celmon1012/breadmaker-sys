// The agent platform's HTTP face. Small on purpose: health, what exists, and "start a run". Everything else
// (the list of runs, metrics) is read straight from the database by the studio, under row level security.
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { agentCatalog } from './agents.ts';
import { config, status } from './config.ts';
import { InvalidConnection, connectionCatalog, connectionProblems, runHttp, validateHttpConfig } from './connections.ts';
import { startEvals } from './evals.ts';
import { ingest, refresh as refreshSource } from './knowledge.ts';
import { discoverMcp, mcpCatalog, mcpProblems } from './mcp.ts';
import { InvalidDefinition, fromSnapshot, registry, validateDef, validateMemberDef } from './defs.ts';
import { ChatMessage, Refused, defRunnable, opsRunnable, previewChat, startRun } from './runner.ts';
import { ApprovalError, decide } from './approvals.ts';
import { modelList } from './models.ts';
import { tick } from './schedule.ts';
import { canEdit, whyDenied, failStaleRuns, getAgentDef, getLatestVersion, getRun, getSource, memberFor, teamMemberFor } from './store.ts';
import { toolCatalog } from './tools.ts';

const json = (res: http.ServerResponse, code: number, body: unknown, origin?: string) => {
  const data = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
    ...(origin && config.allowedOrigins.includes(origin)
      ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }
      : {}),
  });
  res.end(data);
};

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

async function readBody(req: http.IncomingMessage, limit = 16_000): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > limit) throw new Refused('That request is too large.');
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

// A person cannot start more than a few runs a minute: every run costs money.
const recent = new Map<string, number[]>();
/** For tests: forget who has been asking. */
export const resetLimits = () => recent.clear();
const limited = (who: string) => {
  const now = Date.now();
  const hits = (recent.get(who) ?? []).filter((t) => now - t < 60_000);
  hits.push(now);
  recent.set(who, hits);
  return hits.length > 10;
};

export const handle: http.RequestListener = async (req, res) => {
  const origin = req.headers.origin;
  const url = (req.url ?? '/').split('?')[0];
  try {
    if (req.method === 'OPTIONS') return json(res, 204, {}, origin);
    if (url === '/healthz') return json(res, 200, { ok: true }, origin);
    if (url === '/status') return json(res, 200, { ...status(), agents: agentCatalog, tools: [...toolCatalog, ...(await connectionCatalog()), ...(await mcpCatalog())], models: modelList(), problems: [...(await connectionProblems()), ...(await mcpProblems())] }, origin);

    // Who is calling: a team member's own sign-in token, the platform token (a schedule, n8n, a check), or a member who may
    // build agents of their own (`member`: they can reach only their own agents, with no tools, within their allowance).
    const who = async () => {
      const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
      if (config.platformToken && bearer && same(bearer, config.platformToken)) return { requestedBy: null as string | null, trigger: 'api' as const, member: false };
      const requestedBy = bearer ? await teamMemberFor(bearer) : null;
      if (requestedBy) return { requestedBy, trigger: 'console' as const, member: false };
      const memberId = bearer ? await memberFor(bearer) : null;
      return memberId ? { requestedBy: memberId, trigger: 'console' as const, member: true } : null;
    };

    // Read one run. The studio reads runs straight from the database; this is for other systems and for checks.
    const one = /^\/run\/([0-9a-f-]{36})$/.exec(url);
    if (one && req.method === 'GET') {
      const reader = await who();
      if (!reader) return json(res, 401, { error: 'Sign in with a Breadmaker team account.' }, origin);
      if (reader.member) return json(res, 403, { error: 'Read your runs from your agent page.' }, origin);
      const run = await getRun(one[1]);
      return run ? json(res, 200, run, origin) : json(res, 404, { error: 'No such run.' }, origin);
    }

    // Try a web tool before saving it. Only a read can be tried: trying something that changes things would defeat
    // approval. An owner or coach only, with their own sign-in.
    if (url === '/connections/test' && req.method === 'POST') {
      const jwt = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
      const userId = jwt && !(config.platformToken && same(jwt, config.platformToken)) ? await teamMemberFor(jwt) : null;
      if (!userId) return json(res, 401, { error: await whyDenied(jwt) }, origin);
      if (!(await canEdit(jwt))) return json(res, 403, { error: 'Only owners and coaches can try a web tool.' }, origin);
      if (limited(userId)) return json(res, 429, { error: 'Too many tries in a minute. Wait a little.' }, origin);
      const body = (await readBody(req)) as { config?: unknown; sample?: Record<string, unknown> };
      const cfg = validateHttpConfig(body.config);
      if (cfg.risk !== 'read') return json(res, 400, { error: 'Only a tool that reads can be tried here. One that changes something runs only after approval.' }, origin);
      try {
        return json(res, 200, await runHttp(cfg, body.sample ?? {}), origin);
      } catch (error) {
        return json(res, 200, { ok: false, status: 0, body: error instanceof Error ? error.message : String(error) }, origin);
      }
    }

    // Run an agent's test questions. Owners and coaches only; the cases run in the background and the page follows along.
    if (url === '/evals/run' && req.method === 'POST') {
      const jwt = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
      const userId = jwt && !(config.platformToken && same(jwt, config.platformToken)) ? await teamMemberFor(jwt) : null;
      if (!userId) return json(res, 401, { error: await whyDenied(jwt) }, origin);
      if (!(await canEdit(jwt))) return json(res, 403, { error: 'Only owners and coaches can run tests.' }, origin);
      const body = (await readBody(req)) as { agentId?: string };
      if (!body.agentId || !/^[0-9a-f-]{36}$/.test(body.agentId) || !(await getAgentDef(body.agentId))) return json(res, 404, { error: 'No such agent.' }, origin);
      if (limited(userId)) return json(res, 429, { error: 'Too many requests in a minute. Wait a little.' }, origin);
      try {
        return json(res, 202, await startEvals(body.agentId, userId), origin);
      } catch (error) {
        // "Add a question first" and "already running" are the person's to fix, not a platform fault.
        if (error instanceof Refused) return json(res, 409, { error: error.message }, origin);
        throw error;
      }
    }

    // Add a source to an agent's knowledge (pasted text or a public page), or read a page again. Owners and coaches only.
    if ((url === '/knowledge/ingest' || url === '/knowledge/refresh') && req.method === 'POST') {
      const jwt = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
      const platformCaller = Boolean(jwt && config.platformToken && same(jwt, config.platformToken));
      const teamId = jwt && !platformCaller ? await teamMemberFor(jwt) : null;
      // A member who builds their own agents may add knowledge to those agents only, within smaller limits.
      const memberId = jwt && !platformCaller && !teamId ? await memberFor(jwt) : null;
      const userId = teamId ?? memberId;
      if (!userId) return json(res, 401, { error: await whyDenied(jwt) }, origin);
      if (teamId && !(await canEdit(jwt))) return json(res, 403, { error: 'Only owners and coaches can change an agent\'s knowledge.' }, origin);
      const member = Boolean(memberId);
      const body = (await readBody(req, 400_000)) as { agentId?: string; sourceId?: string; name?: string; text?: string; url?: string };
      if (url === '/knowledge/refresh') {
        if (!body.sourceId || !/^[0-9a-f-]{36}$/.test(body.sourceId)) return json(res, 400, { error: 'Say which source.' }, origin);
        if (member) {
          const source = await getSource(body.sourceId);
          const owner = source ? await getAgentDef(source.agent_id) : null;
          if (!owner || owner.owner_id !== userId) return json(res, 404, { error: 'No such source.' }, origin);
        }
        if (limited(userId)) return json(res, 429, { error: 'Too many requests in a minute. Wait a little.' }, origin);
        return json(res, 200, await refreshSource(body.sourceId, member), origin);
      }
      const target = body.agentId && /^[0-9a-f-]{36}$/.test(body.agentId) ? await getAgentDef(body.agentId) : null;
      if (!target || (member && target.owner_id !== userId)) return json(res, 404, { error: 'No such agent.' }, origin);
      if (!body.url && !String(body.text ?? '').trim()) return json(res, 400, { error: 'Paste some text, or give a web address.' }, origin);
      if (body.url && body.text) return json(res, 400, { error: 'Add either text or a web address, not both.' }, origin);
      if (String(body.name ?? '').trim().length < 2) return json(res, 400, { error: 'Give the source a name.' }, origin);
      if (limited(userId)) return json(res, 429, { error: 'Too many requests in a minute. Wait a little.' }, origin);
      return json(res, 200, await ingest({ agentId: target.id, name: String(body.name ?? ''), userId, member, text: body.text, url: body.url }), origin);
    }

    // See what an MCP server offers before adding it, so the person can mark which of its tools only read.
    if (url === '/connections/discover' && req.method === 'POST') {
      const jwt = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
      const userId = jwt && !(config.platformToken && same(jwt, config.platformToken)) ? await teamMemberFor(jwt) : null;
      if (!userId) return json(res, 401, { error: await whyDenied(jwt) }, origin);
      if (!(await canEdit(jwt))) return json(res, 403, { error: 'Only owners and coaches can connect a server.' }, origin);
      if (limited(userId)) return json(res, 429, { error: 'Too many tries in a minute. Wait a little.' }, origin);
      const body = (await readBody(req)) as { config?: unknown };
      try {
        return json(res, 200, { tools: await discoverMcp(body.config) }, origin);
      } catch (error) {
        if (error instanceof InvalidConnection) throw error;
        return json(res, 200, { tools: [], error: error instanceof Error ? error.message : String(error) }, origin);
      }
    }

    // A person decides on an agent's request. Only a signed-in owner or coach can; the platform token cannot, because
    // an approval is exactly the thing that must not be automated.
    const decision = /^\/approvals\/([0-9a-f-]{36})\/decide$/.exec(url);
    if (decision && req.method === 'POST') {
      const jwt = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
      const userId = jwt && !(config.platformToken && same(jwt, config.platformToken)) ? await teamMemberFor(jwt) : null;
      if (!userId) return json(res, 401, { error: await whyDenied(jwt) }, origin);
      if (!(await canEdit(jwt))) return json(res, 403, { error: 'Only owners and coaches can approve.' }, origin);
      const body = (await readBody(req)) as { decision?: string };
      if (body.decision !== 'approve' && body.decision !== 'reject') return json(res, 400, { error: 'Say approve or reject.' }, origin);
      const row = await decide(decision[1], body.decision, userId);
      return json(res, 200, { id: row.id, status: row.status, result: row.result }, origin);
    }

    if (url === '/run' && req.method === 'POST') {
      const caller = await who();
      if (!caller) return json(res, 401, { error: 'Sign in with a Breadmaker team account.' }, origin);
      const { requestedBy, trigger, member } = caller;
      const body = (await readBody(req)) as { agent?: string; agentId?: string; input?: string };
      const text = String(body.input ?? '').trim();
      if (!text || text.length > 2000) return json(res, 400, { error: 'Ask something in 1 to 2000 characters.' }, origin);
      if (member && !body.agentId) return json(res, 403, { error: 'You can run your own agents only.' }, origin);
      let target;
      if (body.agentId) {
        // An agent from a stored definition. Another system may only call one that has been published ("live").
        const stored = /^[0-9a-f-]{36}$/.test(body.agentId) ? await getAgentDef(body.agentId) : null;
        // A member reaches their own agents only, and cannot tell another member's agent exists.
        if (!stored || (member && stored.owner_id !== requestedBy)) return json(res, 404, { error: 'No such agent.' }, origin);
        if (trigger === 'api' && stored.status !== 'live') return json(res, 409, { error: 'That agent is not live.' }, origin);
        // The team tries the working copy; another system runs the last published version, so editing a live agent
        // changes nothing for callers until it is published again.
        let source: unknown = stored;
        if (trigger === 'api') {
          const published = await getLatestVersion(stored.id);
          if (!published) return json(res, 409, { error: 'That agent has no published version.' }, origin);
          source = fromSnapshot(published.snapshot);
        }
        // An agent with an owner is a member's: it never gets tools, whoever runs it.
        const checked = stored.owner_id ? validateMemberDef(source) : validateDef(source, await registry());
        target = await defRunnable({ ...checked, id: stored.id, status: stored.status });
      } else if (body.agent === 'ops') {
        target = opsRunnable();
      } else {
        return json(res, 400, { error: 'Unknown agent.' }, origin);
      }
      // Only a request that will really start a run counts against the allowance; a mistake does not.
      if (limited(requestedBy ?? 'api')) return json(res, 429, { error: 'Too many runs in a minute. Wait a little.' }, origin);
      const runId = await startRun({ target, text, trigger, requestedBy, ownerId: member ? requestedBy : null });
      return json(res, 202, { runId }, origin);
    }

    // The wizard's live preview: an unsaved definition answers a conversation, and the reply comes back at once.
    if (url === '/preview' && req.method === 'POST') {
      const caller = await who();
      if (!caller) return json(res, 401, { error: 'Sign in with a Breadmaker team account.' }, origin);
      const body = (await readBody(req, 64_000)) as { definition?: unknown; messages?: { role?: string; content?: string }[] };
      const def = caller.member ? validateMemberDef(body.definition) : validateDef(body.definition, await registry());
      // A member can try only an agent of their own: the id decides whose documents it can search.
      if (caller.member && def.id) {
        const stored = /^[0-9a-f-]{36}$/.test(def.id) ? await getAgentDef(def.id) : null;
        if (!stored || stored.owner_id !== caller.requestedBy) return json(res, 404, { error: 'No such agent.' }, origin);
      }
      const messages: ChatMessage[] = (Array.isArray(body.messages) ? body.messages : [])
        .slice(-12)
        .map((m) => ({ role: (m.role === 'assistant' ? 'assistant' : 'user') as ChatMessage['role'], content: String(m.content ?? '').slice(0, 2000) }))
        .filter((m) => m.content.trim());
      if (!messages.length || messages[messages.length - 1].role !== 'user') return json(res, 400, { error: 'Send a message to try it with.' }, origin);
      if (limited(caller.requestedBy ?? 'api')) return json(res, 429, { error: 'Too many runs in a minute. Wait a little.' }, origin);
      const outcome = await previewChat(def, messages, caller.requestedBy, caller.member ? caller.requestedBy : null);
      return json(res, 200, { reply: outcome.text, toolCalls: outcome.toolCalls, costUsd: outcome.costUsd, failed: outcome.failed, error: outcome.error, runId: outcome.runId }, origin);
    }
    return json(res, 404, { error: 'Not found.' }, origin);
  } catch (error) {
    if (error instanceof Refused) return json(res, 503, { error: error.message }, origin);
    if (error instanceof InvalidDefinition || error instanceof InvalidConnection) return json(res, 400, { error: error.message }, origin);
    if (error instanceof ApprovalError) return json(res, error.status, { error: error.message }, origin);
    console.error(error);
    return json(res, 500, { error: 'The agent platform hit a problem.' }, origin);
  }
};

export const server = http.createServer(handle);

if (process.argv[1]?.endsWith('server.ts')) {
  server.listen(config.port, '0.0.0.0', () => console.log(`agent-platform on :${config.port}`, status()));
  const sweep = () => failStaleRuns().catch(() => undefined);
  void sweep();
  setInterval(sweep, 5 * 60_000).unref();
  // Start whatever schedule is due, once a minute. A failure is logged and the next minute tries again.
  const schedules = () => tick().catch((error) => console.error('scheduler', error));
  void schedules();
  setInterval(schedules, 60_000).unref();
}
