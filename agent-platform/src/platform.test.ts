// Runs without a model key or a network: a scripted model, a fake Supabase and a fake Coolify on local ports.
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';

const listen = (handler: http.RequestListener) =>
  new Promise<{ server: http.Server; url: string }>((resolve) => {
    const server = http.createServer(handler).listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }));
  });

const readJson = async (req: http.IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req as AsyncIterable<Buffer>) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null;
};

const storedDef = (id: string, status: string) => ({
  id,
  name: 'Order helper',
  public_name: 'Northwind Help',
  opening_message: 'Hi!',
  purpose: 'Answers order questions',
  model: 'anthropic/claude-haiku-5-5',
  instructions: 'You answer questions about orders, politely and briefly.',
  rules: ['Never state a refund amount.'],
  tools: ['http_check'],
  status,
});
const DEF_LIVE = storedDef('11111111-1111-1111-1111-111111111111', 'live');
const DEF_DRAFT = storedDef('22222222-2222-2222-2222-222222222222', 'draft');
// A member's own agent. Even if its row somehow carried a tool, the platform must not give it one.
const DEF_MEMBER = { ...storedDef('44444444-4444-4444-4444-444444444444', 'draft'), name: 'My helper', owner_id: 'user-m1', tools: ['restart_app'] };

const approvals = new Map<string, Record<string, any>>();
const coolifyWrites: { method: string; url: string; auth: string }[] = [];

// What the fake Supabase saw.
const runs = new Map<string, Record<string, unknown>>();
const schedules = new Map<string, Record<string, any>>();
const connections: Record<string, unknown>[] = [];
const evalCases: Record<string, any>[] = [];
const evalRuns = new Map<string, Record<string, any>>();
const sources = new Map<string, Record<string, any>>();
const chunks: Record<string, any>[] = [];
let supabase: { server: http.Server; url: string };
let coolify: { server: http.Server; url: string };

before(async () => {
  supabase = await listen(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const send = (code: number, body: unknown) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    const bearer = req.headers.authorization ?? '';
    const people: Record<string, string> = { 'Bearer team-jwt': 'user-1', 'Bearer support-jwt': 'user-2', 'Bearer member-jwt': 'user-m1', 'Bearer other-member-jwt': 'user-m2', 'Bearer plain-jwt': 'user-p1' };
    if (url.pathname === '/auth/v1/user') return send(people[bearer] ? 200 : 401, { id: people[bearer] });
    if (url.pathname === '/rest/v1/rpc/can_build_agents') return send(200, bearer === 'Bearer member-jwt' || bearer === 'Bearer other-member-jwt');
    if (url.pathname === '/rest/v1/rpc/is_team_member') return send(200, bearer === 'Bearer team-jwt' || bearer === 'Bearer support-jwt');
    if (url.pathname === '/rest/v1/rpc/can_edit_content') return send(200, bearer === 'Bearer team-jwt');
    if (url.pathname === '/rest/v1/agent_eval_cases') return send(200, evalCases.filter((c) => url.search.includes(String(c.agent_id))));
    if (url.pathname === '/rest/v1/agent_eval_runs') {
      if (req.method === 'POST') {
        const row = { id: `cccccccc-0000-0000-0000-${String(evalRuns.size + 1).padStart(12, '0')}`, status: 'running', results: [], passed: 0, failed: 0, cost_usd: 0, ...(await readJson(req)) };
        evalRuns.set(row.id, row);
        return send(201, [row]);
      }
      if (req.method === 'PATCH') {
        const id = /(?:^|[?&])id=eq\.([0-9a-f-]+)/.exec(url.search)?.[1];
        if (id && evalRuns.has(id)) Object.assign(evalRuns.get(id)!, await readJson(req));
        return send(204, null);
      }
      return send(200, [...evalRuns.values()].filter((r) => r.status === 'running').map((r) => ({ id: r.id })));
    }
    if (url.pathname === '/rest/v1/agent_knowledge_sources') {
      const id = /(?:^|[?&])id=eq\.([0-9a-f-]+)/.exec(url.search)?.[1];
      if (req.method === 'POST') {
        const row = { id: `bbbbbbbb-0000-0000-0000-${String(sources.size + 1).padStart(12, '0')}`, status: 'ready', error: null, chunk_count: 0, chars: 0, ...(await readJson(req)) };
        sources.set(row.id, row);
        return send(201, [row]);
      }
      if (req.method === 'PATCH') {
        if (id && sources.has(id)) Object.assign(sources.get(id)!, await readJson(req));
        return send(204, null);
      }
      const agent = /agent_id=eq\.([0-9a-f-]+)/.exec(url.search)?.[1];
      const list = [...sources.values()].filter((s) => (id ? s.id === id : agent ? s.agent_id === agent : true));
      return send(200, list);
    }
    if (url.pathname === '/rest/v1/agent_knowledge_chunks') {
      if (req.method === 'POST') {
        for (const row of (await readJson(req)) as Record<string, any>[]) chunks.push(row);
        return send(201, null);
      }
      if (req.method === 'DELETE') {
        const source = /source_id=eq\.([0-9a-f-]+)/.exec(url.search)?.[1];
        for (let i = chunks.length - 1; i >= 0; i--) if (chunks[i].source_id === source) chunks.splice(i, 1);
        return send(204, null);
      }
      const agent = /agent_id=eq\.([0-9a-f-]+)/.exec(url.search)?.[1];
      return send(200, chunks.filter((c) => c.agent_id === agent).slice(0, 1).map((c) => ({ id: 'x' })));
    }
    if (url.pathname === '/rest/v1/rpc/search_knowledge') {
      // A stand-in for the full-text search: passages that share a word with the question, best first.
      const body = (await readJson(req)) as { p_agent: string; p_query: string };
      const words = body.p_query.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
      const scored = chunks
        .filter((c) => c.agent_id === body.p_agent)
        .map((c) => ({ source_name: sources.get(c.source_id)?.name ?? '?', content: c.content, rank: words.filter((w) => String(c.content).toLowerCase().includes(w)).length }))
        .filter((c) => c.rank > 0)
        .sort((a, b) => b.rank - a.rank);
      return send(200, scored);
    }
    if (url.pathname === '/rest/v1/agent_connections') return send(200, connections);
    if (url.pathname === '/rest/v1/agent_schedules') {
      if (req.method === 'GET') return send(200, [...schedules.values()].filter((s) => s.enabled));
      if (req.method === 'PATCH') {
        const id = /id=eq\.([0-9a-f-]+)/.exec(url.search)?.[1];
        const row = id ? schedules.get(id) : undefined;
        const wantsNull = url.search.includes('next_run_at=is.null');
        const seen = /next_run_at=eq\.([^&]+)/.exec(url.search)?.[1];
        const matches = row && (wantsNull ? row.next_run_at == null : seen ? row.next_run_at != null && new Date(row.next_run_at).getTime() === new Date(decodeURIComponent(seen)).getTime() : true);
        if (!matches) return send(200, []);
        Object.assign(row, await readJson(req));
        return send(200, [row]);
      }
    }
    if (url.pathname === '/rest/v1/agent_approvals') {
      if (req.method === 'POST') {
        const row = { id: `aaaaaaaa-0000-0000-0000-${String(approvals.size + 1).padStart(12, '0')}`, status: 'pending', result: null, ...(await readJson(req)) };
        approvals.set(row.id, row);
        return send(201, [row]);
      }
      const id = /id=eq\.([0-9a-f-]+)/.exec(url.search)?.[1];
      const row = id ? approvals.get(id) : undefined;
      if (req.method === 'GET') return send(200, row ? [row] : []);
      if (req.method === 'PATCH') {
        if (!row || (url.search.includes('status=eq.pending') && row.status !== 'pending')) return send(200, []);
        Object.assign(row, await readJson(req));
        return send(200, [row]);
      }
    }
    if (url.pathname === '/rest/v1/agent_runs') {
      if (req.method === 'POST') {
        const row = { id: `run-${runs.size + 1}`, status: 'running', ...(await readJson(req)) };
        runs.set(row.id, row);
        return send(201, [row]);
      }
      if (req.method === 'PATCH') {
        const id = /id=eq\.(.+)/.exec(url.search)?.[1];
        if (id && runs.has(id)) Object.assign(runs.get(id)!, await readJson(req));
        return send(204, null);
      }
      if (req.method === 'GET') {
        const owner = /(?:^|[?&])owner_id=eq\.([^&]+)/.exec(url.search)?.[1];
        return send(200, [...runs.values()].filter((r) => !owner || r.owner_id === owner).map((r) => ({ cost_usd: r.cost_usd ?? 0 })));
      }
    }
    if (url.pathname === '/rest/v1/agent_def_versions') {
      // The live agent has a published version whose instructions differ from its working copy.
      const id = /agent_id=eq\.(.+?)(&|$)/.exec(url.search)?.[1];
      return send(200, id === DEF_LIVE.id ? [{ version: 2, snapshot: { name: 'Order helper', model: 'anthropic/claude-haiku-5-5', instructions: 'PUBLISHED instructions: answer order questions.', rules: [], tools: [] } }] : []);
    }
    if (url.pathname === '/rest/v1/agent_defs') {
      const id = /id=eq\.(.+?)(&|$)/.exec(url.search)?.[1];
      return send(200, id === DEF_LIVE.id ? [DEF_LIVE] : id === DEF_DRAFT.id ? [DEF_DRAFT] : id === DEF_MEMBER.id ? [DEF_MEMBER] : []);
    }
    return send(404, { message: 'unexpected ' + url.pathname });
  });
  coolify = await listen((req, res) => {
    if (/\/(restart|deploy)/.test(req.url ?? '')) {
      coolifyWrites.push({ method: req.method ?? '', url: req.url ?? '', auth: String(req.headers.authorization ?? '') });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ message: 'ok' }));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (req.url?.startsWith('/api/v1/applications')) return res.end(JSON.stringify([{ uuid: 'app-1', name: 'breadmaker-systems', status: 'running:healthy', fqdn: 'https://breadmakersystems.com' }]));
    if (req.url?.startsWith('/api/v1/services')) return res.end(JSON.stringify([{ uuid: 'svc-1', name: 'restart-backend', status: 'running:healthy' }]));
    res.end('[]');
  });
  Object.assign(process.env, {
    SUPABASE_URL: supabase.url,
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'svc-role-secret-value',
    COOLIFY_API_URL: coolify.url,
    COOLIFY_API_TOKEN: 'coolify-token',
    COOLIFY_WRITE_TOKEN: 'coolify-write-token',
    ANTHROPIC_API_KEY: 'test-key',
    PLATFORM_TOKEN: 'platform-secret',
  });
});

after(() => {
  supabase?.server.close();
  coolify?.server.close();
});

describe('redact', () => {
  it('removes keys, tokens, bearer headers and database passwords', async () => {
    const { redact } = await import('./redact.ts');
    const text = [
      'ANTHROPIC_API_KEY=sk-ant-abcdefghijklmnopqrstuvwx',
      'Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456',
      'postgres://user:hunter2@db:5432/postgres',
      'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop',
      'COOLIFY_TOKEN: 12|abcdefghijklmnopqrstuvwxyz0123456789',
    ].join('\n');
    const out = redact(text);
    for (const secret of ['sk-ant-abcdef', 'abcdefghijklmnopqrstuvwxyz123456', 'hunter2', 'eyJhbGci', 'abcdefghijklmnopqrstuvwxyz0123456789']) assert.ok(!out.includes(secret), `still contains ${secret}`);
  });
});

describe('http_check guard', () => {
  it('treats internal addresses as private and public ones as not', async () => {
    const { isPrivateAddress } = await import('./tools.ts');
    for (const ip of ['127.0.0.1', '10.0.0.5', '172.20.1.1', '192.168.1.9', '169.254.169.254', '100.64.0.1', '::1', 'fd00::1']) assert.equal(isPrivateAddress(ip), true, ip);
    for (const ip of ['8.8.8.8', '185.239.208.31', '172.32.0.1']) assert.equal(isPrivateAddress(ip), false, ip);
  });
});

describe('a run', () => {
  it('calls a tool, answers, and records the whole run', async () => {
    const { opsAgent } = await import('./agents.ts');
    const { execute, opsRunnable } = await import('./runner.ts');
    let turn = 0;
    const usage = { inputTokens: 1000, outputTokens: 200, totalTokens: 1200 };
    const parts = (items: unknown[]) => new ReadableStream({ start: (c) => { for (const i of items) c.enqueue(i); c.close(); } });
    const fake = {
      specificationVersion: 'v2' as const,
      provider: 'fake',
      modelId: 'scripted',
      supportedUrls: {},
      doGenerate: async () => {
        turn += 1;
        if (turn === 1) return { content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'list_resources', input: JSON.stringify({ filter: 'breadmaker' }) }], finishReason: 'tool-calls', usage, warnings: [] };
        return { content: [{ type: 'text', text: 'breadmaker-systems is running and healthy.' }], finishReason: 'stop', usage, warnings: [] };
      },
      doStream: async () => {
        turn += 1;
        const meta = [{ type: 'stream-start', warnings: [] }, { type: 'response-metadata', id: `r${turn}`, modelId: 'scripted', timestamp: new Date() }];
        if (turn === 1) {
          return { stream: parts([...meta, { type: 'tool-call', toolCallId: 'c1', toolName: 'list_resources', input: JSON.stringify({ filter: 'breadmaker' }) }, { type: 'finish', finishReason: 'tool-calls', usage }]) };
        }
        return { stream: parts([...meta, { type: 'text-start', id: 't1' }, { type: 'text-delta', id: 't1', delta: 'breadmaker-systems is running and healthy.' }, { type: 'text-end', id: 't1' }, { type: 'finish', finishReason: 'stop', usage }]) };
      },
    };
    opsAgent.__updateModel({ model: fake as never });

    runs.set('run-test', { id: 'run-test', status: 'running' });
    await execute('run-test', opsRunnable(), 'Is breadmaker up?');
    const row = runs.get('run-test')!;
    assert.equal(row.status, 'completed', JSON.stringify(row));
    assert.match(String(row.output), /running and healthy/);
    const calls = row.tool_calls as { name: string; input: string; output: string }[];
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'list_resources');
    assert.match(calls[0].output, /breadmakersystems\.com/);
    assert.equal(row.tokens_in, 2000);
    assert.equal(row.tokens_out, 400);
    assert.ok(Number(row.cost_usd) > 0);
    assert.ok(typeof row.duration_ms === 'number');
  });
});

describe('the server', () => {
  it('refuses callers who are not on the team, and starts a run for one who is', async () => {
    const { handle } = await import('./server.ts');
    const app = await listen(handle);
    try {
      const post = (token: string | null, body: unknown) =>
        fetch(`${app.url}/run`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
      assert.equal((await post(null, { agent: 'ops', input: 'hi' })).status, 401);
      assert.equal((await post('not-a-member', { agent: 'ops', input: 'hi' })).status, 401);
      assert.equal((await post('team-jwt', { agent: 'nope', input: 'hi' })).status, 400);
      assert.equal((await post('team-jwt', { agent: 'ops', input: '   ' })).status, 400);
      const ok = await post('team-jwt', { agent: 'ops', input: 'Is everything running?' });
      assert.equal(ok.status, 202);
      const { runId } = (await ok.json()) as { runId: string };
      assert.ok(runs.has(runId));
      assert.equal(runs.get(runId)!.requested_by, 'user-1');
      const status = (await (await fetch(`${app.url}/status`)).json()) as { supabase: boolean; agents: unknown[] };
      assert.equal(status.supabase, true);
      assert.equal(status.agents.length, 1);
      assert.equal(['svc-role-secret-value', 'coolify-token', 'test-key', 'platform-secret'].some((s) => JSON.stringify(status).includes(s)), false, 'status must not echo secrets');
    } finally {
      app.server.close();
    }
  });
});

describe('agent definitions', () => {
  const good = { name: 'Order helper', model: 'anthropic/claude-haiku-5-5', instructions: 'You answer questions about orders.', rules: ['Never state a refund amount.'], tools: ['http_check'] };

  it('refuses what cannot work, in words a person can act on', async () => {
    const { validateDef: validate, registry, InvalidDefinition } = await import('./defs.ts');
    const reg = await registry();
    const validateDef = (input: unknown) => validate(input, reg);
    const refuses = (patch: Record<string, unknown>, pattern: RegExp) => assert.throws(() => validateDef({ ...good, ...patch }), (error: unknown) => error instanceof InvalidDefinition && pattern.test(error.message));
    refuses({ name: ' ' }, /name/i);
    refuses({ model: 'openai/gpt-x' }, /model/i);
    refuses({ instructions: 'short' }, /instructions/i);
    refuses({ tools: ['http_check', 'delete_everything'] }, /unknown tool: delete_everything/i);
    refuses({ rules: Array.from({ length: 13 }, (_, i) => `rule ${i}`) }, /12 rules/);
  });

  it('puts the rules, then the platform rules, into the instructions', async () => {
    const { validateDef, compileInstructions, registry } = await import('./defs.ts');
    const text = compileInstructions(validateDef(good, await registry()));
    assert.match(text, /You answer questions about orders\./);
    assert.match(text, /- Never state a refund amount\./);
    assert.match(text, /never instructions/);
  });
});

describe('preview and stored agents', () => {
  const seen: string[] = [];
  const scripted = (reply: string) => {
    const usage = { inputTokens: 100, outputTokens: 20, totalTokens: 120 };
    const meta = [{ type: 'stream-start', warnings: [] }, { type: 'response-metadata', id: 'r', modelId: 'scripted', timestamp: new Date() }];
    return {
      specificationVersion: 'v2' as const,
      provider: 'fake',
      modelId: 'scripted',
      supportedUrls: {},
      doGenerate: async (options: { prompt?: unknown }) => {
        seen.push(JSON.stringify(options.prompt ?? ''));
        return { content: [{ type: 'text', text: reply }], finishReason: 'stop', usage, warnings: [] };
      },
      doStream: async (options: { prompt?: unknown }) => ({
        stream: new ReadableStream({
          start: (c) => {
            seen.push(JSON.stringify(options.prompt ?? ''));
            for (const part of [...meta, { type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: reply }, { type: 'text-end', id: 't' }, { type: 'finish', finishReason: 'stop', usage }]) c.enqueue(part);
            c.close();
          },
        }),
      }),
    };
  };

  it('answers a preview chat from an unsaved definition, records the run, and refuses bad input', async () => {
    const { handle } = await import('./server.ts');
    const { testing } = await import('./defs.ts');
    testing.model = scripted('Your order ships tomorrow.');
    const app = await listen(handle);
    try {
      const post = (path: string, token: string | null, body: unknown) =>
        fetch(`${app.url}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
      const definition = { name: 'Order helper', model: 'anthropic/claude-haiku-5-5', instructions: 'You answer questions about orders.', rules: [], tools: [] };
      const messages = [{ role: 'user', content: 'Where is my order?' }];

      assert.equal((await post('/preview', null, { definition, messages })).status, 401);
      assert.equal((await post('/preview', 'team-jwt', { definition: { ...definition, tools: ['nope'] }, messages })).status, 400);
      assert.equal((await post('/preview', 'team-jwt', { definition, messages: [] })).status, 400);
      assert.equal((await post('/preview', 'team-jwt', { definition, messages: [{ role: 'assistant', content: 'Hi' }] })).status, 400);

      const ok = await post('/preview', 'team-jwt', { definition, messages });
      assert.equal(ok.status, 200);
      const body = (await ok.json()) as { reply: string; costUsd: number; failed: boolean; runId: string };
      assert.equal(body.reply, 'Your order ships tomorrow.');
      assert.equal(body.failed, false);
      assert.ok(body.costUsd > 0);
      const row = runs.get(body.runId)!;
      assert.equal(row.agent, 'preview: Order helper');
      assert.equal(row.status, 'completed');
      assert.equal(row.input, 'Where is my order?');
    } finally {
      app.server.close();
      testing.model = undefined;
    }
  });

  it('runs a stored agent for the team, and lets another system call only a live one', async () => {
    const { handle } = await import('./server.ts');
    const { testing } = await import('./defs.ts');
    testing.model = scripted('It is on its way.');
    const app = await listen(handle);
    try {
      const run = (token: string, agentId: string) =>
        fetch(`${app.url}/run`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ agentId, input: 'Status of order 5?' }) });
      assert.equal((await run('team-jwt', '33333333-3333-3333-3333-333333333333')).status, 404);
      assert.equal((await run('platform-secret', DEF_DRAFT.id)).status, 409, 'a draft is not live');
      // A live agent with no published version cannot be called by another system.
      const unpublished = { ...DEF_LIVE, id: '44444444-4444-4444-4444-444444444444' };
      Object.assign(DEF_DRAFT, { id: unpublished.id, status: 'live' });
      assert.equal((await run('platform-secret', unpublished.id)).status, 409, 'live but never published');
      Object.assign(DEF_DRAFT, { id: '22222222-2222-2222-2222-222222222222', status: 'draft' });

      const live = await run('platform-secret', DEF_LIVE.id);
      assert.equal(live.status, 202);
      const { runId } = (await live.json()) as { runId: string };
      assert.equal(runs.get(runId)!.agent, 'Order helper');
      assert.equal(runs.get(runId)!.agent_id, DEF_LIVE.id);
      for (let i = 0; i < 50 && runs.get(runId)!.status === 'running'; i++) await new Promise((r) => setTimeout(r, 50));
      assert.match(seen[seen.length - 1], /PUBLISHED instructions/, 'another system runs the published version');
      assert.doesNotMatch(seen[seen.length - 1], /politely and briefly/, 'not the working copy');

      assert.equal((await run('team-jwt', DEF_DRAFT.id)).status, 202, 'the team can try a draft');
    } finally {
      app.server.close();
      testing.model = undefined;
    }
  });
});

describe('approval-gated actions', () => {
  // A model that first calls restart_app, then answers once the tool result is back.
  const callsRestart = () => {
    let turn = 0;
    const usage = { inputTokens: 100, outputTokens: 20, totalTokens: 120 };
    return {
      specificationVersion: 'v2' as const,
      provider: 'fake',
      modelId: 'scripted',
      supportedUrls: {},
      doStream: async () => { throw new Error('stream is not used'); },
      doGenerate: async () => {
        turn += 1;
        if (turn === 1) return { content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'restart_app', input: JSON.stringify({ uuid: 'abcdefghij0123456789abcd', reason: 'It is hung.' }) }], finishReason: 'tool-calls', usage, warnings: [] };
        return { content: [{ type: 'text', text: 'I asked for a restart. It is waiting for approval and has not been done.' }], finishReason: 'stop', usage, warnings: [] };
      },
    };
  };

  const decideCall = (base: string, id: string, token: string | null, decision: string) =>
    fetch(`${base}/approvals/${id}/decide`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ decision }) });

  it('files a request instead of acting, and does nothing until a person approves', async () => {
    const { defRunnable, execute } = await import('./runner.ts');
    const { testing, validateDef } = await import('./defs.ts');
    const { handle } = await import('./server.ts');
    testing.model = callsRestart();
    coolifyWrites.length = 0;
    approvals.clear();
    runs.set('run-approval', { id: 'run-approval', status: 'running' });
    const { registry } = await import('./defs.ts');
    const def = validateDef({ name: 'Fixer', model: 'anthropic/claude-haiku-5-5', instructions: 'You look after the platform and ask for fixes.', rules: [], tools: ['restart_app'] }, await registry());
    const outcome = await execute('run-approval', await defRunnable({ ...def, id: '11111111-1111-1111-1111-111111111111' }), 'It looks hung, restart it.');
    testing.model = undefined;

    assert.equal(outcome.failed, false, JSON.stringify(outcome));
    assert.equal(coolifyWrites.length, 0, 'the agent calling the tool must not touch Coolify');
    assert.equal(approvals.size, 1);
    const [row] = [...approvals.values()];
    assert.equal(row.status, 'pending');
    assert.equal(row.tool, 'restart_app');
    assert.equal(row.run_id, 'run-approval');
    assert.equal(row.agent_name, 'Fixer');
    assert.match(row.summary, /Restart the application abcdefghij0123456789abcd\. Reason: It is hung\./);

    const app = await listen(handle);
    try {
      assert.equal((await decideCall(app.url, row.id, null, 'approve')).status, 401, 'no sign-in');
      assert.equal((await decideCall(app.url, row.id, 'platform-secret', 'approve')).status, 401, 'the platform token can never approve');
      assert.equal((await decideCall(app.url, row.id, 'support-jwt', 'approve')).status, 403, 'a team member who cannot edit');
      assert.equal((await decideCall(app.url, row.id, 'team-jwt', 'maybe')).status, 400);
      assert.equal(coolifyWrites.length, 0, 'still nothing has happened');

      const ok = await decideCall(app.url, row.id, 'team-jwt', 'approve');
      assert.equal(ok.status, 200);
      assert.equal(((await ok.json()) as { status: string }).status, 'executed');
      assert.equal(coolifyWrites.length, 1);
      assert.match(coolifyWrites[0].url, /\/api\/v1\/applications\/abcdefghij0123456789abcd\/restart/);
      assert.equal(coolifyWrites[0].auth, 'Bearer coolify-write-token', 'uses the write token, not the read token');
      assert.equal(row.decided_by, 'user-1');

      assert.equal((await decideCall(app.url, row.id, 'team-jwt', 'approve')).status, 409, 'a second approval is refused');
      assert.equal(coolifyWrites.length, 1, 'and does not run it twice');
    } finally {
      app.server.close();
    }
  });

  it('does nothing on reject, and records a failure plainly when the action cannot run', async () => {
    const { handle } = await import('./server.ts');
    const { config } = await import('./config.ts');
    const app = await listen(handle);
    try {
      coolifyWrites.length = 0;
      approvals.set('aaaaaaaa-1111-1111-1111-000000000001', { id: 'aaaaaaaa-1111-1111-1111-000000000001', status: 'pending', tool: 'redeploy_app', input: { uuid: 'abcdefghij0123456789abcd', reason: 'Stale.' }, summary: 's', result: null });
      const rejected = await decideCall(app.url, 'aaaaaaaa-1111-1111-1111-000000000001', 'team-jwt', 'reject');
      assert.equal(((await rejected.json()) as { status: string }).status, 'rejected');
      assert.equal(coolifyWrites.length, 0);

      approvals.set('aaaaaaaa-1111-1111-1111-000000000002', { id: 'aaaaaaaa-1111-1111-1111-000000000002', status: 'pending', tool: 'redeploy_app', input: { uuid: 'abcdefghij0123456789abcd', reason: 'Stale.' }, summary: 's', result: null });
      const saved = config.coolifyWriteToken;
      (config as { coolifyWriteToken: string }).coolifyWriteToken = '';
      const failed = await decideCall(app.url, 'aaaaaaaa-1111-1111-1111-000000000002', 'team-jwt', 'approve');
      (config as { coolifyWriteToken: string }).coolifyWriteToken = saved;
      const body = (await failed.json()) as { status: string; result: string };
      assert.equal(body.status, 'failed');
      assert.match(body.result, /COOLIFY_WRITE_TOKEN/);
      assert.equal(coolifyWrites.length, 0);

      assert.equal((await decideCall(app.url, 'aaaaaaaa-1111-1111-1111-000000000099', 'team-jwt', 'approve')).status, 404);
    } finally {
      app.server.close();
    }
  });
});

describe('schedules', () => {
  const at = (iso: string) => new Date(iso);
  it('works out the next run: hourly, daily, weekdays and weekly, in UTC', async () => {
    const { nextRun } = await import('./schedule.ts');
    // 2026-11-05 is a Thursday.
    assert.equal(nextRun({ frequency: 'hourly', hour: 0, minute: 15 }, at('2026-11-05T10:10:00Z')).toISOString(), '2026-11-05T10:15:00.000Z');
    assert.equal(nextRun({ frequency: 'hourly', hour: 0, minute: 15 }, at('2026-11-05T10:15:00Z')).toISOString(), '2026-11-05T11:15:00.000Z', 'never the same minute again');
    assert.equal(nextRun({ frequency: 'daily', hour: 7, minute: 0 }, at('2026-11-05T06:00:00Z')).toISOString(), '2026-11-05T07:00:00.000Z');
    assert.equal(nextRun({ frequency: 'daily', hour: 7, minute: 0 }, at('2026-11-05T07:00:00Z')).toISOString(), '2026-11-06T07:00:00.000Z');
    assert.equal(nextRun({ frequency: 'weekdays', hour: 7, minute: 30 }, at('2026-11-06T08:00:00Z')).toISOString(), '2026-11-09T07:30:00.000Z', 'Friday evening goes to Monday');
    assert.equal(nextRun({ frequency: 'weekly', hour: 9, minute: 0 }, at('2026-11-05T12:00:00Z')).toISOString(), '2026-11-09T09:00:00.000Z', 'Mondays');
  });

  it('starts what is due once, fills in new schedules, leaves the rest, and never double-runs', async () => {
    const { tick } = await import('./schedule.ts');
    const { opsAgent } = await import('./agents.ts');
    const usage = { inputTokens: 50, outputTokens: 10, totalTokens: 60 };
    opsAgent.__updateModel({ model: { specificationVersion: 'v2', provider: 'fake', modelId: 's', supportedUrls: {}, doStream: async () => { throw new Error('x'); }, doGenerate: async () => ({ content: [{ type: 'text', text: 'All good.' }], finishReason: 'stop', usage, warnings: [] }) } as never });
    runs.clear();
    schedules.clear();
    const now = new Date('2026-11-05T07:00:30Z');
    const base = { builtin: 'ops', agent_id: null, input: 'Is everything running?', frequency: 'daily', hour: 7, minute: 0, enabled: true, last_run_at: null };
    schedules.set('aaaaaaaa-2222-2222-2222-000000000001', { id: 'aaaaaaaa-2222-2222-2222-000000000001', name: 'Due', next_run_at: '2026-11-05T07:00:00+00:00', ...base });
    schedules.set('aaaaaaaa-2222-2222-2222-000000000002', { id: 'aaaaaaaa-2222-2222-2222-000000000002', name: 'New', next_run_at: null, ...base });
    schedules.set('aaaaaaaa-2222-2222-2222-000000000003', { id: 'aaaaaaaa-2222-2222-2222-000000000003', name: 'Later', next_run_at: '2026-11-06T07:00:00+00:00', ...base });
    schedules.set('aaaaaaaa-2222-2222-2222-000000000004', { id: 'aaaaaaaa-2222-2222-2222-000000000004', name: 'Gone', next_run_at: '2026-11-05T07:00:00+00:00', ...base, builtin: null, agent_id: '99999999-9999-9999-9999-999999999999' });

    // Two passes at once: the claim means only one of them can start the due run.
    const [a, b] = await Promise.all([tick(now), tick(now)]);
    assert.equal(a + b, 1, 'the due ops schedule started exactly once');
    const due = schedules.get('aaaaaaaa-2222-2222-2222-000000000001')!;
    assert.equal(new Date(due.next_run_at).toISOString(), '2026-11-06T07:00:00.000Z', 'moved to tomorrow');
    assert.ok(due.last_run_id, 'linked to its run');
    assert.equal(runs.size, 1);
    assert.equal([...runs.values()][0].trigger, 'schedule');
    assert.equal([...runs.values()][0].requested_by, null);

    const fresh = schedules.get('aaaaaaaa-2222-2222-2222-000000000002')!;
    assert.equal(new Date(fresh.next_run_at).toISOString(), '2026-11-06T07:00:00.000Z', 'a new schedule only gets its first time, no run');
    assert.equal(fresh.last_run_at, null);

    assert.equal(schedules.get('aaaaaaaa-2222-2222-2222-000000000003')!.last_run_at, null, 'not due yet');
    const gone = schedules.get('aaaaaaaa-2222-2222-2222-000000000004')!;
    assert.match(String(gone.last_error), /no longer exists/, 'a schedule whose agent is gone says why');
    assert.equal(runs.size, 1, 'and started nothing');
  });
});

describe('models and providers', () => {
  const base = { name: 'Cheap helper', instructions: 'You answer short questions briefly.', rules: [], tools: [] };

  it('offers a provider only once its key is set, and says which key is missing', async () => {
    const { validateDef: validate, registry, InvalidDefinition } = await import('./defs.ts');
    const reg = await registry();
    const validateDef = (input: unknown) => validate(input, reg);
    const { config } = await import('./config.ts');
    const mutable = config as unknown as { openaiKey: string };
    const saved = mutable.openaiKey;
    mutable.openaiKey = '';
    assert.throws(() => validateDef({ ...base, model: 'openai/gpt-6-luna' }), (error: unknown) => error instanceof InvalidDefinition && /OPENAI_API_KEY/.test(error.message));
    mutable.openaiKey = 'sk-test-openai';
    assert.equal(validateDef({ ...base, model: 'openai/gpt-6-luna' }).model, 'openai/gpt-6-luna');
    mutable.openaiKey = saved;
  });

  it('lists every model with whether it can be used, without ever exposing a key', async () => {
    const { modelList } = await import('./models.ts');
    const { handle } = await import('./server.ts');
    const list = modelList();
    assert.ok(list.some((m) => m.id === 'anthropic/claude-haiku-5-5' && m.available));
    assert.ok(list.some((m) => m.id === 'google/gemini-3.8-flash' && !m.available && m.needs === 'GOOGLE_GENERATIVE_AI_API_KEY'));
    const app = await listen(handle);
    try {
      const status = await (await fetch(`${app.url}/status`)).json() as { models: unknown[] };
      assert.ok(status.models.length >= 6);
      assert.equal(JSON.stringify(status).includes('sk-test-openai'), false);
    } finally {
      app.server.close();
    }
  });

  it('refuses to run a model whose provider is not connected, and prices a model by its own price when one is set', async () => {
    const { admit, costOf } = await import('./runner.ts');
    const { config } = await import('./config.ts');
    const mutable = config as unknown as { googleKey: string; modelPrices: Record<string, [number, number]> };
    mutable.googleKey = '';
    await assert.rejects(() => admit('google/gemini-3.8-flash'), /GOOGLE_GENERATIVE_AI_API_KEY/);
    const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000 };
    const estimate = costOf(usage, 'google/gemini-3.8-flash').usd;
    mutable.modelPrices['google/gemini-3.8-flash'] = [0.1, 0.4];
    assert.equal(costOf(usage, 'google/gemini-3.8-flash').usd, 0.5, 'a set price is used');
    assert.ok(estimate > 0.5, 'without one, the global estimate is used');
    delete mutable.modelPrices['google/gemini-3.8-flash'];
  });
});

describe('web tools (connections)', () => {
  const lookup = { name: 'Find order', tool_id: 'find_order', description: 'Look up one order by its number.', kind: 'http_tool', enabled: true };
  const readConfig = { method: 'GET', url: 'https://93.184.216.34/orders/{{order_id}}?full=1', headers: { Authorization: 'Bearer {{secret:SHOP}}' }, params: [{ name: 'order_id', type: 'string', description: 'The order number' }] };
  const writeConfig = { method: 'POST', url: 'https://93.184.216.34/orders/{{order_id}}/cancel', headers: { 'X-Key': '{{secret:SHOP}}' }, params: [{ name: 'order_id', type: 'string', description: 'The order number' }, { name: 'reason', type: 'string', description: 'Why' }], body: 'json' };

  // Calls to the test address are answered here; everything else (the fake Supabase and Coolify) goes through.
  const seen: { url: string; method: string; headers: Record<string, string>; body: string | null }[] = [];
  const realFetch = globalThis.fetch;
  const intercept = () => {
    seen.length = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof URL ? input.href : input);
      if (!url.startsWith('https://93.184.216.34')) return realFetch(input, init);
      seen.push({ url, method: init?.method ?? 'GET', headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)), body: (init?.body as string | undefined) ?? null });
      return new Response(JSON.stringify({ order: 'A-1', status: 'shipped' }), { status: 200 });
    }) as typeof fetch;
  };
  const restore = () => {
    globalThis.fetch = realFetch;
  };

  it('refuses an address or setup that is unsafe, and decides read or write itself', async () => {
    const { validateHttpConfig, InvalidConnection } = await import('./connections.ts');
    const refuses = (patch: Record<string, unknown>, pattern: RegExp) => assert.throws(() => validateHttpConfig({ ...readConfig, ...patch }), (error: unknown) => error instanceof InvalidConnection && pattern.test(error.message));
    refuses({ url: 'http://93.184.216.34/x' }, /https/);
    refuses({ url: 'https://10.0.0.5/x' }, /internal/);
    refuses({ url: 'https://localhost/x' }, /internal/);
    refuses({ url: 'https://{{order_id}}.example.com/x' }, /host name/i);
    refuses({ url: 'https://93.184.216.34/{{nope}}' }, /not one of the inputs/);
    refuses({ headers: { Host: 'evil.example' } }, /cannot be set/);
    refuses({ params: [{ name: 'Bad Name', type: 'string' }] }, /valid input name/);
    refuses({ method: 'TRACE' }, /GET, POST/);
    assert.equal(validateHttpConfig(readConfig).risk, 'read');
    assert.equal(validateHttpConfig({ ...readConfig, risk: 'write' }).risk, 'write', 'a GET can be marked as needing approval');
    assert.equal(validateHttpConfig({ ...writeConfig, risk: 'read' }).risk, 'write', 'a POST can never be a read');
  });

  it('fills the path safely, reads secrets from CONN_SECRET_ settings only, and sends the rest as JSON', async () => {
    const { runHttp, validateHttpConfig, secretSetting } = await import('./connections.ts');
    process.env.CONN_SECRET_SHOP = 'shop-secret-token';
    intercept();
    try {
      const result = await runHttp(validateHttpConfig(readConfig), { order_id: 'A 1/../x' });
      assert.equal(result.status, 200);
      assert.match(result.body, /shipped/);
      assert.equal(seen[0].url, 'https://93.184.216.34/orders/A%201%2F..%2Fx?full=1', 'an input cannot change the path');
      assert.equal(seen[0].headers.Authorization, 'Bearer shop-secret-token');

      await runHttp(validateHttpConfig(writeConfig), { order_id: '7', reason: 'Customer asked' });
      assert.equal(seen[1].method, 'POST');
      assert.deepEqual(JSON.parse(seen[1].body ?? '{}'), { reason: 'Customer asked' }, 'only inputs not used in the address go in the body');

      delete process.env.CONN_SECRET_SHOP;
      await assert.rejects(() => runHttp(validateHttpConfig(readConfig), { order_id: '1' }), /CONN_SECRET_SHOP/);
    } finally {
      restore();
    }
    // Asking for the model key reads CONN_SECRET_ANTHROPIC_API_KEY, which does not exist: nothing leaks.
    assert.equal(secretSetting('ANTHROPIC_API_KEY'), 'CONN_SECRET_ANTHROPIC_API_KEY');
    assert.equal(process.env.CONN_SECRET_ANTHROPIC_API_KEY, undefined);
  });

  it('gives agents the enabled tools: a read runs, a write waits for approval, and a bad definition is skipped', async () => {
    const { registry, validateDef, testing } = await import('./defs.ts');
    const { forgetConnections, connectionCatalog } = await import('./connections.ts');
    const { defRunnable, execute } = await import('./runner.ts');
    const { decide } = await import('./approvals.ts');
    process.env.CONN_SECRET_SHOP = 'shop-secret-token';
    connections.length = 0;
    connections.push(
      { id: 'c1', ...lookup, config: readConfig },
      { id: 'c2', name: 'Cancel order', tool_id: 'cancel_order', description: 'Cancel an order for a customer.', kind: 'http_tool', enabled: true, config: writeConfig },
      { id: 'c3', name: 'Broken', tool_id: 'broken_tool', description: 'A definition that no longer validates.', kind: 'http_tool', enabled: true, config: { method: 'GET', url: 'http://insecure.example/x' } },
      { id: 'c4', name: 'Off', tool_id: 'switched_off', description: 'Disabled, so not offered to agents.', kind: 'http_tool', enabled: false, config: readConfig },
    );
    forgetConnections();
    const reg = await registry();
    assert.ok('find_order' in reg && 'cancel_order' in reg);
    assert.ok(!('broken_tool' in reg) && !('switched_off' in reg));
    const catalog = await connectionCatalog();
    assert.deepEqual(catalog.map((c) => [c.id, c.risk]).sort(), [['cancel_order', 'write'], ['find_order', 'read']]);

    const def = validateDef({ name: 'Order desk', model: 'anthropic/claude-haiku-5-5', instructions: 'You help with orders using your tools.', rules: [], tools: ['find_order', 'cancel_order'] }, reg);
    assert.throws(() => validateDef({ ...def, tools: ['broken_tool'] }, reg), /Unknown tool/);

    // The model finds the order (a read, runs now), then asks to cancel it (a write, queued).
    let turn = 0;
    const usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };
    const call = (toolName: string, input: unknown) => ({ content: [{ type: 'tool-call', toolCallId: `c${turn}`, toolName, input: JSON.stringify(input) }], finishReason: 'tool-calls', usage, warnings: [] });
    testing.model = {
      specificationVersion: 'v2', provider: 'fake', modelId: 'scripted', supportedUrls: {},
      doStream: async () => { throw new Error('stream is not used'); },
      doGenerate: async () => {
        turn += 1;
        if (turn === 1) return call('find_order', { order_id: 'A-1' });
        if (turn === 2) return call('cancel_order', { order_id: 'A-1', reason: 'Customer asked' });
        return { content: [{ type: 'text', text: 'Found it and asked for the cancellation; it is waiting for approval.' }], finishReason: 'stop', usage, warnings: [] };
      },
    };
    intercept();
    approvals.clear();
    runs.set('run-conn', { id: 'run-conn', status: 'running' });
    try {
      const outcome = await execute('run-conn', await defRunnable({ ...def, id: '55555555-5555-5555-5555-555555555555' }), 'Cancel order A-1 for me.');
      assert.equal(outcome.failed, false, JSON.stringify(outcome));
      assert.equal(seen.length, 1, 'only the read went out');
      assert.match(seen[0].url, /orders\/A-1\?full=1/);
      assert.equal(approvals.size, 1);
      const [row] = [...approvals.values()];
      assert.equal(row.tool, 'cancel_order');
      assert.match(row.summary, /Call "Cancel order": POST 93\.184\.216\.34\/orders\/A-1\/cancel with/, 'the approver sees the real address');
      assert.equal(JSON.stringify(row).includes('shop-secret-token'), false, 'no secret in the request');

      const done = await decide(row.id, 'approve', 'user-1');
      assert.equal(done.status, 'executed', JSON.stringify(done));
      assert.equal(seen.length, 2, 'approving sends the call, once');
      assert.equal(seen[1].method, 'POST');
      assert.match(seen[1].url, /orders\/A-1\/cancel$/);
      assert.equal(seen[1].headers['X-Key'], 'shop-secret-token');
    } finally {
      restore();
      testing.model = undefined;
      delete process.env.CONN_SECRET_SHOP;
      connections.length = 0;
      forgetConnections();
    }
  });

  it('connects an MCP server: only tools marked read-only run on their own, the rest wait for approval, and a down server is reported', async () => {
    const { validateMcpConfig, testing: mcpTesting, forgetMcp, mcpCatalog, mcpProblems } = await import('./mcp.ts');
    const { InvalidConnection } = await import('./connections.ts');
    const { registry, validateDef, testing } = await import('./defs.ts');
    const { defRunnable, execute } = await import('./runner.ts');
    const { decide } = await import('./approvals.ts');
    const { forgetConnections } = await import('./connections.ts');
    const { z } = await import('zod');

    // The setup is checked the same careful way as a web tool.
    const bad = (patch: Record<string, unknown>, pattern: RegExp) => assert.throws(() => validateMcpConfig({ url: 'https://93.184.216.34/mcp', headers: {}, readOnly: [], ...patch }), (e: unknown) => e instanceof InvalidConnection && pattern.test(e.message));
    bad({ url: 'http://93.184.216.34/mcp' }, /https/);
    bad({ url: 'https://127.0.0.1/mcp' }, /internal/);
    bad({ headers: { Authorization: 'Bearer {{order_id}}' } }, /secret/);
    bad({ headers: { Cookie: 'x' } }, /cannot be set/);
    bad({ readOnly: ['no spaces allowed'] }, /characters/);

    const calls: string[] = [];
    const tools = {
      ops_list_projects: { description: 'List projects.', inputSchema: z.object({ status: z.string().describe('Filter') }), execute: async (input: { status: string }) => { calls.push(`list:${input.status}`); return { projects: ['Alpha'] }; } },
      ops_create_task: { description: 'Create a task.', inputSchema: z.object({ title: z.string().describe('Title') }), execute: async (input: { title: string }) => { calls.push(`create:${input.title}`); return { created: input.title }; } },
    };
    mcpTesting.client = (_id, server) => ({
      listToolsWithErrors: async () => (server === 'ops' ? { tools, errors: {} } : { tools: {}, errors: { [server]: 'connection refused' } }),
      disconnect: async () => undefined,
    });
    connections.length = 0;
    connections.push(
      { id: 'm1', kind: 'mcp', name: 'Restart ops', tool_id: 'ops', description: 'Restart console projects and tasks.', enabled: true, config: { url: 'https://93.184.216.34/mcp', headers: {}, readOnly: ['list_projects'] } },
      { id: 'm2', kind: 'mcp', name: 'Down server', tool_id: 'broken', description: 'A server that is not reachable.', enabled: true, config: { url: 'https://93.184.216.34/other', headers: {}, readOnly: [] } },
    );
    forgetMcp();
    forgetConnections();
    approvals.clear();
    runs.set('run-mcp', { id: 'run-mcp', status: 'running' });
    try {
      const catalog = await mcpCatalog();
      assert.deepEqual(catalog.map((t) => [t.id, t.risk]).sort(), [['ops_create_task', 'write'], ['ops_list_projects', 'read']]);
      assert.deepEqual((await mcpProblems()).map((p) => p.id), ['broken'], 'the unreachable server is reported, not hidden');

      const reg = await registry();
      const def = validateDef({ name: 'Project desk', model: 'anthropic/claude-haiku-5-5', instructions: 'You help with projects and tasks using your tools.', rules: [], tools: ['ops_list_projects', 'ops_create_task'] }, reg);

      let turn = 0;
      const usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };
      const call = (toolName: string, input: unknown) => ({ content: [{ type: 'tool-call', toolCallId: `m${turn}`, toolName, input: JSON.stringify(input) }], finishReason: 'tool-calls', usage, warnings: [] });
      testing.model = {
        specificationVersion: 'v2', provider: 'fake', modelId: 'scripted', supportedUrls: {},
        doStream: async () => { throw new Error('stream is not used'); },
        doGenerate: async () => {
          turn += 1;
          if (turn === 1) return call('ops_list_projects', { status: 'open' });
          if (turn === 2) return call('ops_create_task', { title: 'Follow up with Alpha' });
          return { content: [{ type: 'text', text: 'Listed the projects and asked for the task; it is waiting for approval.' }], finishReason: 'stop', usage, warnings: [] };
        },
      };
      const outcome = await execute('run-mcp', await defRunnable({ ...def, id: '66666666-6666-6666-6666-666666666666' }), 'Add a follow-up task for Alpha.');
      assert.equal(outcome.failed, false, JSON.stringify(outcome));
      assert.deepEqual(calls, ['list:open'], 'the read-only tool ran; the other did not');
      assert.equal(approvals.size, 1);
      const [row] = [...approvals.values()];
      assert.equal(row.tool, 'ops_create_task');
      assert.match(row.summary, /Use "create_task" on Restart ops with/);

      const done = await decide(row.id, 'approve', 'user-1');
      assert.equal(done.status, 'executed', JSON.stringify(done));
      assert.deepEqual(calls, ['list:open', 'create:Follow up with Alpha'], 'approving runs it, once');
    } finally {
      testing.model = undefined;
      mcpTesting.client = undefined;
      connections.length = 0;
      forgetMcp();
      forgetConnections();
    }
  });

  it('lets an owner or coach see what an MCP server offers before adding it, and refuses anyone else', async () => {
    const { handle, resetLimits } = await import('./server.ts');
    const { testing: mcpTesting } = await import('./mcp.ts');
    const { z } = await import('zod');
    resetLimits();
    mcpTesting.client = (_id, server) => ({
      listToolsWithErrors: async () => ({
        tools: { [`${server}_list_projects`]: { description: 'List projects.', inputSchema: z.object({}) }, [`${server}_create_task`]: { description: 'Create a task.', inputSchema: z.object({}) } },
        errors: {},
      }),
      disconnect: async () => undefined,
    });
    const app = await listen(handle);
    const post = (token: string | null, body: unknown) =>
      fetch(`${app.url}/connections/discover`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    const config = { url: 'https://93.184.216.34/mcp', headers: {}, readOnly: [] };
    try {
      assert.equal((await post(null, { config })).status, 401);
      assert.equal((await post('platform-secret', { config })).status, 401, 'the platform token is not a person');
      assert.equal((await post('support-jwt', { config })).status, 403, 'support cannot connect a server');
      assert.equal((await post('team-jwt', { config: { ...config, url: 'http://93.184.216.34/mcp' } })).status, 400);
      const ok = await post('team-jwt', { config });
      assert.equal(ok.status, 200, 'a signed-in owner or coach is let in (the bearer token is read correctly)');
      const body = (await ok.json()) as { tools: { name: string }[] };
      assert.deepEqual(body.tools.map((t) => t.name).sort(), ['create_task', 'list_projects']);
    } finally {
      mcpTesting.client = undefined;
      app.server.close();
    }
  });

  it('lets an owner or coach try a read before saving it, and nothing else', async () => {
    const { handle } = await import('./server.ts');
    const app = await listen(handle);
    process.env.CONN_SECRET_SHOP = 'shop-secret-token';
    const post = (token: string | null, body: unknown) =>
      fetch(`${app.url}/connections/test`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    const server = globalThis.fetch;
    try {
      assert.equal((await post(null, { config: readConfig })).status, 401);
      assert.equal((await post('platform-secret', { config: readConfig })).status, 401, 'the platform token is not a person');
      assert.equal((await post('support-jwt', { config: readConfig })).status, 403, 'support cannot try');
      assert.equal((await post('team-jwt', { config: { ...readConfig, url: 'http://insecure.example/x' } })).status, 400);
      const write = await post('team-jwt', { config: writeConfig, sample: { order_id: '1', reason: 'x' } });
      assert.equal(write.status, 400, 'a write cannot be tried');
      assert.match(((await write.json()) as { error: string }).error, /after approval/);

      intercept();
      const ok = await post('team-jwt', { config: readConfig, sample: { order_id: 'A-1' } });
      globalThis.fetch = server;
      assert.equal(ok.status, 200);
      const body = (await ok.json()) as { ok: boolean; status: number; body: string };
      assert.equal(body.ok, true);
      assert.match(body.body, /shipped/);

      delete process.env.CONN_SECRET_SHOP;
      const missing = await post('team-jwt', { config: readConfig, sample: { order_id: 'A-1' } });
      assert.match(((await missing.json()) as { body: string }).body, /CONN_SECRET_SHOP/, 'a missing secret is explained, not hidden');
    } finally {
      restore();
      app.server.close();
    }
  });
});

describe('knowledge', () => {
  const AGENT = '11111111-1111-1111-1111-111111111111'; // DEF_LIVE in the fake database
  const realFetch = globalThis.fetch;
  const pages: Record<string, { status?: number; type?: string; body?: string; location?: string }> = {};
  const serve = () => {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof URL ? input.href : input);
      if (!url.startsWith('https://93.184.216.34')) return realFetch(input, init);
      const page = pages[url];
      if (!page) return new Response('not found', { status: 404 });
      return new Response(page.body ?? '', { status: page.status ?? 200, headers: { 'content-type': page.type ?? 'text/html', ...(page.location ? { location: page.location } : {}) } });
    }) as typeof fetch;
  };
  const stop = () => {
    globalThis.fetch = realFetch;
  };
  const reset = () => {
    sources.clear();
    chunks.length = 0;
    for (const key of Object.keys(pages)) delete pages[key];
  };

  it('splits text into passages and turns a page into readable text', async () => {
    const { chunkText, htmlToText } = await import('./knowledge.ts');
    assert.deepEqual(chunkText(''), []);
    assert.equal(chunkText('Short but long enough to keep as one passage.').length, 1);
    const long = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} says something useful about returns.`).join(' ');
    const parts = chunkText(long);
    assert.ok(parts.length > 1 && parts.every((p) => p.length <= 1500), 'long text is split into bounded passages');
    assert.ok(parts.join(' ').includes('Sentence number 39'), 'nothing is lost at the end');
    const text = htmlToText('<html><head><style>p{color:red}</style><script>alert(1)</script></head><body><h1>Returns</h1><p>You can return items within 14&nbsp;days &amp; get a refund.</p><!-- hidden --></body></html>');
    assert.match(text, /Returns/);
    assert.match(text, /within 14 days & get a refund/);
    assert.doesNotMatch(text, /alert|color:red|hidden|<p>/);
  });

  it('stores pasted text, lets the agent search it, and tells the agent to use it and to admit when nothing matches', async () => {
    const { ingest } = await import('./knowledge.ts');
    const { defRunnable, execute } = await import('./runner.ts');
    const { validateDef, registry, testing } = await import('./defs.ts');
    reset();
    const stored = await ingest({ agentId: AGENT, name: 'Returns policy', userId: 'user-1', text: 'Refunds: you may return any item within 14 days of delivery for a full refund. Sale items cannot be returned.\n\nShipping: orders over 50 dollars ship free within the country.' });
    assert.equal(stored.chunks >= 1, true);
    assert.equal(sources.get(stored.sourceId)!.status, 'ready');
    assert.equal(sources.get(stored.sourceId)!.chunk_count, stored.chunks);

    const def = validateDef({ name: 'Order helper', model: 'anthropic/claude-haiku-5-5', instructions: 'You answer customer questions politely.', rules: [], tools: [] }, await registry());
    const runnable = await defRunnable({ ...def, id: AGENT });

    // The model asks the knowledge tool, then answers from what came back.
    let turn = 0;
    const seenPrompts: string[] = [];
    const usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };
    testing.model = {
      specificationVersion: 'v2', provider: 'fake', modelId: 'scripted', supportedUrls: {},
      doStream: async () => { throw new Error('stream is not used'); },
      doGenerate: async (options: { prompt?: unknown }) => {
        turn += 1;
        seenPrompts.push(JSON.stringify(options.prompt ?? ''));
        if (turn === 1) return { content: [{ type: 'tool-call', toolCallId: 'k1', toolName: 'search_knowledge', input: JSON.stringify({ query: 'refund days return' }) }], finishReason: 'tool-calls', usage, warnings: [] };
        return { content: [{ type: 'text', text: 'You can return items within 14 days (source: Returns policy).' }], finishReason: 'stop', usage, warnings: [] };
      },
    };
    runs.set('run-knowledge', { id: 'run-knowledge', status: 'running' });
    try {
      const withDocs = await defRunnable({ ...def, id: AGENT });
      const outcome = await execute('run-knowledge', withDocs, 'How long do I have to return something?');
      assert.equal(outcome.failed, false, JSON.stringify(outcome));
      assert.deepEqual(outcome.toolCalls.map((c) => c.name), ['search_knowledge']);
      assert.match(String(outcome.toolCalls[0].output), /Returns policy/);
      assert.match(String(outcome.toolCalls[0].output), /14 days/);
      assert.match(seenPrompts[0], /search_knowledge tool holding this business/, 'the agent is told to use its documents');
      assert.match(seenPrompts[0], /never fill the gap with a guess/);
    } finally {
      testing.model = undefined;
    }
    assert.ok(runnable, 'an agent with documents builds');

    // An agent with no documents gets neither the tool nor the note.
    const empty = await defRunnable({ ...def, id: '22222222-2222-2222-2222-222222222222' });
    const tools = Object.keys(((empty.agent as unknown as { listTools?: () => Record<string, unknown> }).listTools?.() ?? {}));
    assert.ok(!tools.includes('search_knowledge'));
  });

  it('reads a public page, refuses anything unsafe, and records a failed source with its reason', async () => {
    const { ingest, refresh, fetchPage } = await import('./knowledge.ts');
    const { InvalidConnection } = await import('./connections.ts');
    reset();
    serve();
    try {
      pages['https://93.184.216.34/help'] = { body: '<html><body><h1>Delivery</h1><p>We deliver in 2 to 4 working days across Lagos and Abuja.</p><script>steal()</script></body></html>' };
      const added = await ingest({ agentId: AGENT, name: 'Help page', userId: 'user-1', url: 'https://93.184.216.34/help' });
      assert.equal(added.chunks, 1);
      assert.match(String(chunks[0].content), /2 to 4 working days/);
      assert.doesNotMatch(String(chunks[0].content), /steal/);

      // Reading it again replaces the passages instead of adding to them.
      pages['https://93.184.216.34/help'].body = '<p>We now deliver in 1 to 2 working days across Nigeria.</p>';
      await refresh(added.sourceId);
      assert.equal(chunks.filter((c) => c.source_id === added.sourceId).length, 1);
      assert.match(String(chunks[0].content), /1 to 2 working days/);

      await assert.rejects(() => fetchPage('http://93.184.216.34/help'), (e: unknown) => e instanceof InvalidConnection && /https/.test(e.message));
      await assert.rejects(() => fetchPage('https://10.0.0.5/x'), /internal/);
      await assert.rejects(() => fetchPage('https://localhost/x'), /internal/);
      pages['https://93.184.216.34/jump'] = { status: 302, location: 'https://10.0.0.5/admin' };
      await assert.rejects(() => fetchPage('https://93.184.216.34/jump'), /internal/, 'a redirect to an internal address is refused');
      pages['https://93.184.216.34/file'] = { type: 'application/pdf', body: '%PDF' };
      await assert.rejects(() => fetchPage('https://93.184.216.34/file'), /PDF/);

      await assert.rejects(() => ingest({ agentId: AGENT, name: 'Missing page', userId: 'user-1', url: 'https://93.184.216.34/nope' }), /404/);
      const failed = [...sources.values()].find((s) => s.name === 'Missing page')!;
      assert.equal(failed.status, 'failed');
      assert.match(String(failed.error), /404/, 'the reason is kept for the person to see');
    } finally {
      stop();
    }
  });

  it('is limited to owners and coaches, bounded per agent, and refuses odd requests', async () => {
    const { handle, resetLimits } = await import('./server.ts');
    const { LIMITS, ingest } = await import('./knowledge.ts');
    reset();
    resetLimits();
    const app = await listen(handle);
    const post = (path: string, token: string | null, body: unknown) =>
      fetch(`${app.url}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    try {
      const text = 'Our opening hours are nine to five on weekdays, and closed on public holidays.';
      assert.equal((await post('/knowledge/ingest', null, { agentId: AGENT, name: 'Hours', text })).status, 401);
      assert.equal((await post('/knowledge/ingest', 'platform-secret', { agentId: AGENT, name: 'Hours', text })).status, 401);
      assert.equal((await post('/knowledge/ingest', 'support-jwt', { agentId: AGENT, name: 'Hours', text })).status, 403);
      assert.equal((await post('/knowledge/ingest', 'team-jwt', { agentId: '33333333-3333-3333-3333-333333333333', name: 'Hours', text })).status, 404);
      assert.equal((await post('/knowledge/ingest', 'team-jwt', { agentId: AGENT, name: 'Hours' })).status, 400);
      assert.equal((await post('/knowledge/ingest', 'team-jwt', { agentId: AGENT, name: 'Both', text, url: 'https://93.184.216.34/x' })).status, 400);
      assert.equal((await post('/knowledge/ingest', 'team-jwt', { agentId: AGENT, name: 'H', text })).status, 400, 'a source needs a name');

      const ok = await post('/knowledge/ingest', 'team-jwt', { agentId: AGENT, name: 'Opening hours', text });
      assert.equal(ok.status, 200);
      assert.equal(((await ok.json()) as { chunks: number }).chunks, 1);

      // An agent can only hold so many sources.
      for (let i = sources.size; i < LIMITS.sourcesPerAgent; i++) sources.set(`bbbbbbbb-9999-0000-0000-${String(i).padStart(12, '0')}`, { id: `s${i}`, agent_id: AGENT, chunk_count: 1, status: 'ready' });
      await assert.rejects(() => ingest({ agentId: AGENT, name: 'One too many', userId: 'user-1', text }), /20 sources/);
    } finally {
      app.server.close();
      reset();
    }
  });
});

describe('evals', () => {
  const AGENT = '11111111-1111-1111-1111-111111111111';

  it('checks an answer against what was expected, and says why when it falls short', async () => {
    const { checkOutput, normalizeExpect } = await import('./evals.ts');
    const expect = normalizeExpect({ contains: ['14 days'], notContains: ['guarantee'], tools: ['search_knowledge'], noTools: ['restart_app'], judge: '  Be kind.  ' });
    assert.equal(expect.judge, 'Be kind.');
    assert.deepEqual(checkOutput(expect, 'You can return it within 14 days.', ['search_knowledge']), []);
    const reasons = checkOutput(expect, 'We guarantee it.', ['restart_app']);
    assert.equal(reasons.length, 4);
    assert.match(reasons.join(' '), /does not mention "14 days"/);
    assert.match(reasons.join(' '), /mentions "guarantee"/);
    assert.match(reasons.join(' '), /did not use the tool search_knowledge/);
    assert.match(reasons.join(' '), /used the tool restart_app/);
    assert.equal(normalizeExpect({ contains: Array.from({ length: 30 }, (_, i) => `w${i}`) }).contains.length, 10, 'bounded');
  });

  it('runs every question against the working copy in the background, records each result, and stops a second run starting on top', async () => {
    const { startEvals, testing: evalTesting } = await import('./evals.ts');
    const { testing } = await import('./defs.ts');
    evalCases.length = 0;
    evalRuns.clear();
    runs.clear();
    evalCases.push(
      { id: 'e1', agent_id: AGENT, name: 'Return window', input: 'How long do I have to return it?', expect: { contains: ['14 days'] } },
      { id: 'e2', agent_id: AGENT, name: 'No refund word', input: 'Can I get my money back?', expect: { notContains: ['14 days'] } },
      { id: 'e3', agent_id: AGENT, name: 'Judged', input: 'Tell me about returns.', expect: { contains: ['returned'], judge: 'Must be warm and friendly.' } },
      { id: 'e4', agent_id: AGENT, name: 'Needs a tool', input: 'Check the site.', expect: { tools: ['http_check'] } },
    );
    const usage = { inputTokens: 100, outputTokens: 20, totalTokens: 120 };
    testing.model = {
      specificationVersion: 'v2', provider: 'fake', modelId: 'scripted', supportedUrls: {},
      doStream: async () => { throw new Error('stream is not used'); },
      doGenerate: async () => ({ content: [{ type: 'text', text: 'Items can be returned within 14 days.' }], finishReason: 'stop', usage, warnings: [] }),
    };
    evalTesting.judge = async () => ({ pass: false, reason: 'It is curt, not warm.', costUsd: 0.001 });
    try {
      const started = await startEvals(AGENT, 'user-1');
      assert.equal(started.total, 4);
      await assert.rejects(() => startEvals(AGENT, 'user-1'), /already going/, 'one run at a time per agent');
      const record = evalRuns.get(started.runId)!;
      for (let i = 0; i < 100 && record.status === 'running'; i++) await new Promise((r) => setTimeout(r, 50));
      assert.equal(record.status, 'completed', JSON.stringify(record));
      assert.equal(record.passed, 1);
      assert.equal(record.failed, 3);
      assert.ok(Number(record.cost_usd) > 0, 'what the tests cost is recorded');
      const byName = Object.fromEntries((record.results as { name: string; passed: boolean; reasons: string[] }[]).map((r) => [r.name, r]));
      assert.equal(byName['Return window'].passed, true);
      assert.match(byName['No refund word'].reasons.join(' '), /mentions "14 days"/);
      assert.match(byName['Judged'].reasons.join(' '), /Judged: It is curt, not warm/);
      assert.match(byName['Needs a tool'].reasons.join(' '), /did not use the tool http_check/);
      assert.equal([...runs.values()].filter((r) => String(r.agent).startsWith('eval: ')).length, 4, 'each question is also a recorded run');
    } finally {
      testing.model = undefined;
      evalTesting.judge = undefined;
      evalCases.length = 0;
    }
  });

  it('is for owners and coaches, needs at least one question, and refuses odd requests', async () => {
    const { handle, resetLimits } = await import('./server.ts');
    resetLimits();
    evalCases.length = 0;
    evalRuns.clear();
    const app = await listen(handle);
    const post = (token: string | null, body: unknown) =>
      fetch(`${app.url}/evals/run`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    try {
      assert.equal((await post(null, { agentId: AGENT })).status, 401);
      assert.equal((await post('platform-secret', { agentId: AGENT })).status, 401);
      assert.equal((await post('support-jwt', { agentId: AGENT })).status, 403);
      assert.equal((await post('team-jwt', { agentId: '33333333-3333-3333-3333-333333333333' })).status, 404);
      const none = await post('team-jwt', { agentId: AGENT });
      assert.equal(none.status, 409);
      assert.match(((await none.json()) as { error: string }).error, /at least one test question/);
    } finally {
      app.server.close();
    }
  });
});

describe('agents for members', () => {
  const MINE = '44444444-4444-4444-4444-444444444444'; // DEF_MEMBER: owned by user-m1, its row even lists a tool
  const THEIRS = '11111111-1111-1111-1111-111111111111'; // a team agent
  const offered: string[][] = [];
  const scripted = () => {
    const usage = { inputTokens: 100, outputTokens: 20, totalTokens: 120 };
    return {
      specificationVersion: 'v2' as const, provider: 'fake', modelId: 'scripted', supportedUrls: {},
      doStream: async () => { throw new Error('stream is not used'); },
      doGenerate: async (options: { tools?: { name?: string }[] }) => {
        offered.push((options.tools ?? []).map((tool) => String(tool.name)));
        return { content: [{ type: 'text', text: 'Hello from my helper.' }], finishReason: 'stop', usage, warnings: [] };
      },
    };
  };
  const call = (app: { url: string }, path: string, token: string | null, body: unknown, method = 'POST') =>
    fetch(`${app.url}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });
  const settle = async (id: string) => {
    for (let i = 0; i < 100 && runs.get(id)?.status === 'running'; i++) await new Promise((r) => setTimeout(r, 50));
  };

  it('lets a member run only their own agent, with no tools, and records the run against them', async () => {
    const { handle, resetLimits } = await import('./server.ts');
    const { testing } = await import('./defs.ts');
    resetLimits();
    runs.clear();
    offered.length = 0;
    testing.model = scripted();
    const app = await listen(handle);
    try {
      assert.equal((await call(app, '/run', 'plain-jwt', { agentId: MINE, input: 'hi' })).status, 401, 'not a partner');
      assert.equal((await call(app, '/run', 'member-jwt', { agent: 'ops', input: 'restart everything' })).status, 403, 'the built-in ops agent is the team\'s');
      assert.equal((await call(app, '/run', 'member-jwt', { agentId: THEIRS, input: 'hi' })).status, 404, 'a team agent');
      assert.equal((await call(app, '/run', 'other-member-jwt', { agentId: MINE, input: 'hi' })).status, 404, 'another member\'s agent looks like it does not exist');

      const started = await call(app, '/run', 'member-jwt', { agentId: MINE, input: 'Say hello' });
      assert.equal(started.status, 202);
      const { runId } = (await started.json()) as { runId: string };
      await settle(runId);
      const row = runs.get(runId)!;
      assert.equal(row.status, 'completed', JSON.stringify(row));
      assert.equal(row.owner_id, 'user-m1', 'the cost is charged to the member');
      assert.deepEqual(offered[0], [], 'the model was offered no tools, though the stored row listed restart_app');
    } finally {
      testing.model = undefined;
      app.server.close();
    }
  });

  it('stops a member at their monthly allowance, and a member cannot read runs through the platform', async () => {
    const { handle, resetLimits } = await import('./server.ts');
    resetLimits();
    runs.clear();
    runs.set('spent', { id: 'spent', status: 'completed', owner_id: 'user-m1', cost_usd: 99 });
    runs.set('other', { id: 'other', status: 'completed', owner_id: 'user-m2', cost_usd: 0 });
    const app = await listen(handle);
    try {
      const refused = await call(app, '/run', 'member-jwt', { agentId: MINE, input: 'hi' });
      assert.equal(refused.status, 503);
      assert.match(((await refused.json()) as { error: string }).error, /used this month's allowance/);
      assert.equal(runs.size, 2, 'no run was started');
      assert.equal((await call(app, '/run/aaaaaaaa-0000-0000-0000-000000000001', 'member-jwt', null, 'GET')).status, 403);
    } finally {
      runs.clear();
      app.server.close();
    }
  });

  it('previews with no tools, only the lighter models, and only an agent the member owns', async () => {
    const { handle, resetLimits } = await import('./server.ts');
    const { testing } = await import('./defs.ts');
    resetLimits();
    runs.clear();
    offered.length = 0;
    testing.model = scripted();
    const app = await listen(handle);
    const definition = { id: MINE, name: 'My helper', model: 'anthropic/claude-haiku-5-5', instructions: 'You help me think through offers.', rules: [], tools: ['restart_app', 'http_check'] };
    const messages = [{ role: 'user', content: 'Hello' }];
    try {
      const ok = await call(app, '/preview', 'member-jwt', { definition, messages });
      assert.equal(ok.status, 200, await ok.clone().text());
      assert.deepEqual(offered[0], [], 'tools in the request are ignored');
      assert.equal([...runs.values()][0].owner_id, 'user-m1');

      const opus = await call(app, '/preview', 'member-jwt', { definition: { ...definition, model: 'anthropic/claude-opus-5-5' }, messages });
      assert.equal(opus.status, 400);
      assert.match(((await opus.json()) as { error: string }).error, /Haiku or Sonnet/);

      assert.equal((await call(app, '/preview', 'member-jwt', { definition: { ...definition, id: THEIRS }, messages })).status, 404, 'cannot borrow a team agent\'s documents');
      assert.equal((await call(app, '/preview', 'other-member-jwt', { definition, messages })).status, 404, 'nor another member\'s');
      assert.equal((await call(app, '/preview', 'member-jwt', { definition: { ...definition, id: undefined }, messages })).status, 200, 'a new agent with no id is fine');
    } finally {
      testing.model = undefined;
      app.server.close();
    }
  });

  it('lets a member add knowledge to their own agent only, within smaller limits', async () => {
    const { handle, resetLimits } = await import('./server.ts');
    sources.clear();
    chunks.length = 0;
    resetLimits();
    const app = await listen(handle);
    const text = 'My offer: a four week funnel build for coaches, priced at one flat fee, with two rounds of changes.';
    try {
      assert.equal((await call(app, '/knowledge/ingest', 'member-jwt', { agentId: THEIRS, name: 'Mine', text })).status, 404, 'not a team agent');
      assert.equal((await call(app, '/knowledge/ingest', 'other-member-jwt', { agentId: MINE, name: 'Mine', text })).status, 404, 'not another member\'s');
      assert.equal((await call(app, '/knowledge/ingest', 'plain-jwt', { agentId: MINE, name: 'Mine', text })).status, 401);
      for (let i = 1; i <= 5; i++) {
        resetLimits();
        const added = await call(app, '/knowledge/ingest', 'member-jwt', { agentId: MINE, name: `Notes ${i}`, text });
        assert.equal(added.status, 200, await added.clone().text());
      }
      resetLimits();
      const sixth = await call(app, '/knowledge/ingest', 'member-jwt', { agentId: MINE, name: 'Notes 6', text });
      assert.equal(sixth.status, 400);
      assert.match(((await sixth.json()) as { error: string }).error, /5 sources/);
      const mine = [...sources.values()].filter((s) => s.agent_id === MINE);
      assert.equal(mine.length, 5);
      assert.ok(mine.every((s) => s.created_by === 'user-m1'));
    } finally {
      sources.clear();
      chunks.length = 0;
      app.server.close();
    }
  });
});
