// Builds the two n8n workflows of the Breadmaker chat agent as JSON and, with --push, creates or updates them on the
// n8n instance through its public API.
//
//   node scripts/build-n8n-agent.mjs                 writes docs/agent/workflows/*.json
//   N8N_API_KEY=... node scripts/build-n8n-agent.mjs --push [--activate]
//
// The system prompt comes from docs/agent/system-prompt.md and the knowledge from docs/agent/knowledge.md
// (npm run build:agent-knowledge). Webhook paths are random and kept in docs/agent/workflows/.paths.json, which is
// git-ignored: they are the shared secret between Kumoda and n8n.
import { randomBytes, randomUUID } from 'node:crypto';
import https from 'node:https';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'docs', 'agent', 'workflows');
mkdirSync(outDir, { recursive: true });

const N8N = 'https://n8n.kumoda.io';
const KUMODA = 'https://kumoda.io';
const TOOLS_URL = 'https://db.restart.ng/functions/v1/agent-tools';
// claude-sonnet-5-5 rejects the thinking:disabled that n8n's Anthropic node sends; 4.5 accepts it.
const MODEL = process.env.AGENT_MODEL || 'claude-sonnet-4-5';
const CRED_KUMODA = 'Kumoda token (api)';
const CRED_TOOLS = 'Breadmaker agent-tools (api)';

const pathsFile = join(outDir, '.paths.json');
const paths = existsSync(pathsFile) ? JSON.parse(readFileSync(pathsFile, 'utf8')) : {};
for (const key of ['chat', 'handover']) paths[key] ??= `bm-${key}-${randomBytes(16).toString('hex')}`;
writeFileSync(pathsFile, JSON.stringify(paths, null, 2));

const prompt = readFileSync(join(root, 'docs', 'agent', 'system-prompt.md'), 'utf8').split(/\n---\n/).slice(1).join('\n---\n').trim();
const knowledge = readFileSync(join(root, 'docs', 'agent', 'knowledge.md'), 'utf8').trim();
const systemMessage = `${prompt}\n\n# Knowledge\n\n${knowledge}`;

const kumodaCred = { httpBearerAuth: { id: 'KgpEvMXHi9zXCIew', name: CRED_KUMODA } };
const kumodaAuth = { authentication: 'genericCredentialType', genericAuthType: 'httpBearerAuth' };
const toolsCred = { httpHeaderAuth: { id: 'h2CeD5ecUSUPHt6N', name: CRED_TOOLS } };
const auth = { authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth' };

let y = 0;
const node = (name, type, typeVersion, parameters, extra = {}) => ({
  id: randomUUID(),
  name,
  type,
  typeVersion,
  position: [extra.x ?? 0, extra.y ?? (y += 0)],
  parameters,
  ...Object.fromEntries(Object.entries(extra).filter(([k]) => !['x', 'y'].includes(k))),
});

const kumodaPost = (name, urlExpr, bodyExpr, x, extra = {}) =>
  node(
    name,
    'n8n-nodes-base.httpRequest',
    4.2,
    {
      method: 'POST',
      url: urlExpr,
      ...kumodaAuth,
      sendBody: true,
      specifyBody: 'json',
      jsonBody: bodyExpr,
      options: { response: { response: { neverError: true } }, timeout: 20000 },
    },
    { x, y: 300, credentials: kumodaCred, ...extra },
  );

const toolsCall = (name, bodyExpr, x, extra = {}) =>
  node(
    name,
    'n8n-nodes-base.httpRequest',
    4.2,
    {
      method: 'POST',
      url: TOOLS_URL,
      ...auth,
      sendBody: true,
      specifyBody: 'json',
      jsonBody: bodyExpr,
      options: { response: { response: { neverError: true } }, timeout: 20000 },
    },
    { x, y: 300, credentials: toolsCred, onError: 'continueRegularOutput', ...extra },
  );

// ───────────────────────────── main workflow ─────────────────────────────

const prepareCode = `
const b = $input.first().json.body || {};
const m = b.message || {};
const c = b.conversation || {};
const channel = c.channel || m.channel;
if (b.event !== 'message.received' || m.direction !== 'in' || channel !== 'whatsapp' || c.assigned_to === 'human') return [];
const type = m.type || 'text';
const body = String(m.body || '').trim();
const text = type === 'text' ? body : (body || '[The customer sent a ' + type + ' message that you cannot open. Say so and ask them to type it.]');
if (!text) return [];
return [{ json: {
  messageId: String(m.id),
  conversationId: m.conversation_id,
  phone: String(c.contact?.phone || ''),
  name: c.contact?.name || '',
  text,
  windowOpen: c.is_whatsapp_window_open !== false,
  startMs: Date.now(),
} }];
`.trim();

const contextCode = `
const prep = $('Prepare').first().json;
const msgs = ($input.first().json.data || []).filter((x) => x.type !== 'internal_note');
const lastIn = [...msgs].reverse().find((x) => x.direction === 'in');
// A newer message arrived while we waited: its own run answers with the whole thread.
if (lastIn && String(lastIn.id) !== prep.messageId) return [];
const lines = msgs.map((x) => (x.direction === 'in' ? 'Customer: ' : 'Assistant: ') + (x.body || '[' + x.type + ']'));
const isFirst = !msgs.some((x) => x.direction === 'out');
const prompt = [
  'Conversation so far (oldest first):',
  lines.join('\\n'),
  '',
  prep.name ? 'The name on their WhatsApp is ' + prep.name + '.' : '',
  isFirst
    ? 'This is your first reply in this conversation, so begin with the required introduction line.'
    : 'You have already introduced yourself in this conversation; do not repeat the introduction.',
  'Write your next reply to the customer\\'s latest message(s).',
].filter((l) => l !== '').join('\\n');
return [{ json: { prompt, isFirst } }];
`.trim();

const guardsCode = `
const prep = $('Prepare').first().json;
const ctx = $('Context').first().json;
const out = $input.first().json;
const steps = out.intermediateSteps || [];
let reply = String(out.output || '').trim();
const reasons = [];

const known = JSON.stringify($('Prices').first().json || {}) + steps.map((s) => JSON.stringify(s.observation ?? '')).join(' ');
const norm = (s) => s.replace(/\\s+/g, '').replace(/,/g, '');
const allowed = new Set((known.match(/[$₦£€]\\s?\\d[\\d,]*(?:\\.\\d+)?/g) || []).map(norm));
for (const amount of reply.match(/[$₦£€]\\s?\\d[\\d,]*(?:\\.\\d+)?/g) || []) {
  if (!allowed.has(norm(amount))) reasons.push('amount not from a tool: ' + amount);
}

for (const raw of reply.match(/https?:\\/\\/[^\\s)]+|\\b(?:[a-z0-9-]+\\.)+(?:com|ng|io|net|org|co|app|dev)\\b[^\\s)]*/gi) || []) {
  const host = raw.replace(/^https?:\\/\\//i, '').split(/[/?#]/)[0].toLowerCase().replace(/[.,;:!?]+$/, '');
  if (host !== 'breadmakersystems.com' && !host.endsWith('.breadmakersystems.com')) reasons.push('link not on the allow list: ' + raw);
}

if (out.error || !reply) reasons.push('agent error: ' + String(out.error || 'empty reply').slice(0, 200));

const INTRO = "Hi, I'm Breadmaker's AI assistant, working with Ademola and the team.";
let handoverNeeded = false;
if (reasons.length) {
  handoverNeeded = true;
  reply = (ctx.isFirst ? INTRO + ' ' : '') + 'I want to be sure you get the right answer, so I have passed this to Ademola and the team. They will reply on this WhatsApp within 1 business day.';
} else if (ctx.isFirst && !reply.startsWith(INTRO)) {
  reply = INTRO + ' ' + reply;
}

const tools = steps.map((s) => s.action?.tool).filter(Boolean);
return [{ json: {
  reply,
  reasons,
  handoverNeeded,
  handedOver: handoverNeeded || tools.includes('hand_over'),
  tools,
  latencyMs: Date.now() - prep.startMs,
  error: out.error ? String(out.error) : '',
} }];
`.trim();

const handoverToolBody = (name, description, valueProvider, value) => ({ name, valueProvider, ...(value ? { value } : {}), _description: description });

const tool = (name, description, x, body) =>
  node(
    name,
    '@n8n/n8n-nodes-langchain.toolHttpRequest',
    1.1,
    {
      toolDescription: description,
      method: 'POST',
      url: body.url ?? TOOLS_URL,
      ...auth,
      sendBody: true,
      ...(body.keypair
        ? {
            specifyBody: 'keypair',
            parametersBody: { values: body.keypair.map(({ _description, ...p }) => p) },
            placeholderDefinitions: {
              values: body.keypair
                .filter((p) => p.valueProvider !== 'fieldValue')
                .map((p) => ({ name: p.name, description: p._description, type: 'string' })),
            },
          }
        : { specifyBody: 'json', jsonBody: body.json }),
      options: {},
    },
    { x, y: 700, credentials: body.credentials ?? toolsCred },
  );

const mainNodes = [
  node('Webhook', 'n8n-nodes-base.webhook', 2, { httpMethod: 'POST', path: paths.chat, responseMode: 'onReceived', options: {} }, { x: 0, y: 300, webhookId: randomUUID() }),
  node('Prepare', 'n8n-nodes-base.code', 2, { jsCode: prepareCode }, { x: 220, y: 300 }),
  toolsCall(
    'Claim',
    '={{ JSON.stringify({ tool: "claim_message", args: { message_id: $json.messageId, conversation_id: String($json.conversationId), phone: $json.phone, user_text: $json.text } }) }}',
    440,
  ),
  node(
    'New message?',
    'n8n-nodes-base.if',
    2.2,
    {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ id: randomUUID(), leftValue: '={{ $json.duplicate }}', rightValue: 'true', operator: { type: 'string', operation: 'notEquals' } }],
        combinator: 'and',
      },
      options: {},
    },
    { x: 660, y: 300 },
  ),
  node('Collect further messages', 'n8n-nodes-base.wait', 1.1, { amount: 4, unit: 'seconds' }, { x: 880, y: 300 }),
  node(
    'History',
    'n8n-nodes-base.httpRequest',
    4.2,
    {
      method: 'GET',
      url: `=${KUMODA}/api/v1/conversations/{{ $('Prepare').first().json.conversationId }}/messages?latest=20`,
      ...kumodaAuth,
      options: { timeout: 20000 },
    },
    { x: 1100, y: 300, credentials: kumodaCred },
  ),
  node('Context', 'n8n-nodes-base.code', 2, { jsCode: contextCode }, { x: 1320, y: 300 }),
  toolsCall('Prices', '={"tool":"get_prices"}', 1540),
  kumodaPost('Typing on', `=${KUMODA}/api/v1/conversations/{{ $('Prepare').first().json.conversationId }}/typing`, '={"is_typing":true}', 1760, { onError: 'continueRegularOutput' }),
  node(
    'Claude agent',
    '@n8n/n8n-nodes-langchain.agent',
    2.3,
    {
      promptType: 'define',
      text: "={{ $('Context').first().json.prompt }}",
      options: { systemMessage, maxIterations: 6, returnIntermediateSteps: true },
    },
    { x: 1980, y: 300, onError: 'continueRegularOutput' },
  ),
  node('Guards', 'n8n-nodes-base.code', 2, { jsCode: guardsCode }, { x: 2200, y: 300 }),
  kumodaPost('Reply', `=${KUMODA}/api/v1/conversations/{{ $('Prepare').first().json.conversationId }}/reply`, '={{ JSON.stringify({ body: $json.reply }) }}', 2420),
  toolsCall(
    'Log turn',
    `={{ JSON.stringify({ tool: "log_turn", args: { message_id: $('Prepare').first().json.messageId, reply_text: $('Guards').first().json.reply, tools: $('Guards').first().json.tools, guards: { reasons: $('Guards').first().json.reasons }, handed_over: $('Guards').first().json.handedOver, model: "${MODEL}", latency_ms: $('Guards').first().json.latencyMs, error: $('Guards').first().json.error || ($json.error ? String($json.error) : "") } }) }}`,
    2640,
  ),
  node(
    'Needs hand-over?',
    'n8n-nodes-base.if',
    2.2,
    {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ id: randomUUID(), leftValue: "={{ $('Guards').first().json.handoverNeeded }}", rightValue: 'true', operator: { type: 'string', operation: 'equals' } }],
        combinator: 'and',
      },
      options: {},
    },
    { x: 2860, y: 300 },
  ),
  node(
    'Hand over (guard)',
    'n8n-nodes-base.httpRequest',
    4.2,
    {
      method: 'POST',
      url: `${N8N}/webhook/${paths.handover}`,
      sendBody: true,
      specifyBody: 'json',
      jsonBody:
        "={{ JSON.stringify({ conversation_id: $('Prepare').first().json.conversationId, phone: $('Prepare').first().json.phone, name: $('Prepare').first().json.name, email: '', reason: 'The assistant could not answer safely: ' + $('Guards').first().json.reasons.join('; ') }) }}",
      options: { response: { response: { neverError: true } } },
    },
    { x: 3080, y: 200 },
  ),
];

const model = node(
  'Claude Sonnet',
  '@n8n/n8n-nodes-langchain.lmChatAnthropic',
  1.3,
  { model: { __rl: true, mode: 'id', value: MODEL }, options: { temperature: 0.2, maxTokensToSample: 700 } },
  { x: 1900, y: 700, credentials: { anthropicApi: { name: 'Anthropic account' } } },
);

const tools = [
  tool('get_prices', 'Live prices for every Breadmaker offer. Call before stating any amount of money. No input.', 2000, { json: '={"tool":"get_prices"}' }),
  tool(
    'lookup_customer',
    "What Breadmaker holds for the person writing: Leak Test result, payments, application and membership. The system supplies their WhatsApp number; take no input.",
    2200,
    { json: '={{ JSON.stringify({ tool: "lookup_customer", args: { phone: $("Prepare").first().json.phone } }) }}' },
  ),
  tool('check_cohort', 'Next Launchpad and Foundry start dates and places left. Call before giving a date or a number of places. No input.', 2400, { json: '={"tool":"check_cohort"}' }),
  tool(
    'hand_over',
    'Pass this conversation to Ademola and the team. Call it once you have the customer\'s name and email. After it returns, send the fixed closing line.',
    2600,
    {
      url: `${N8N}/webhook/${paths.handover}`,
      credentials: undefined,
      keypair: [
        handoverToolBody('conversation_id', '', 'fieldValue', "={{ $('Prepare').first().json.conversationId }}"),
        handoverToolBody('phone', '', 'fieldValue', "={{ $('Prepare').first().json.phone }}"),
        handoverToolBody('reason', 'One line on what the customer needs, for the team.', 'modelRequired'),
        handoverToolBody('name', "The customer's name.", 'modelRequired'),
        handoverToolBody('email', "The customer's email address.", 'modelRequired'),
      ],
    },
  ),
];
// the hand-over webhook is protected by its random path, not by a credential
delete tools[3].credentials;
tools[3].parameters.authentication = 'none';
delete tools[3].parameters.genericAuthType;

const c = (from, to, type = 'main', index = 0) => ({ from, to, type, index });
const wire = (nodes, links) => {
  const out = {};
  for (const l of links) {
    out[l.from] ??= {};
    out[l.from][l.type] ??= [];
    while (out[l.from][l.type].length <= l.index) out[l.from][l.type].push([]);
    out[l.from][l.type][l.index].push({ node: l.to, type: l.type, index: 0 });
  }
  return out;
};

const mainWorkflow = {
  name: 'Breadmaker chat agent',
  nodes: [...mainNodes, model, ...tools],
  connections: wire(null, [
    c('Webhook', 'Prepare'),
    c('Prepare', 'Claim'),
    c('Claim', 'New message?'),
    c('New message?', 'Collect further messages', 'main', 0),
    c('Collect further messages', 'History'),
    c('History', 'Context'),
    c('Context', 'Prices'),
    c('Prices', 'Typing on'),
    c('Typing on', 'Claude agent'),
    c('Claude agent', 'Guards'),
    c('Guards', 'Reply'),
    c('Reply', 'Log turn'),
    c('Log turn', 'Needs hand-over?'),
    c('Needs hand-over?', 'Hand over (guard)', 'main', 0),
    c('Claude Sonnet', 'Claude agent', 'ai_languageModel'),
    ...tools.map((t) => c(t.name, 'Claude agent', 'ai_tool')),
  ]),
  settings: { executionOrder: 'v1', saveDataSuccessExecution: 'all', saveDataErrorExecution: 'all' },
};

// ───────────────────────────── hand-over workflow ─────────────────────────────

const parseCode = `
const b = $input.first().json.body || {};
const clip = (v, n) => String(v ?? '').replace(/\\s+/g, ' ').trim().slice(0, n);
return [{ json: {
  conversationId: Number(b.conversation_id),
  note: 'AI assistant hand-over. ' + clip(b.reason, 400) + ' | Name: ' + clip(b.name, 120) + ' | Email: ' + clip(b.email, 160) + ' | WhatsApp: ' + clip(b.phone, 40),
} }];
`.trim();

const handoverWorkflow = {
  name: 'Breadmaker hand-over',
  nodes: [
    node('Webhook', 'n8n-nodes-base.webhook', 2, { httpMethod: 'POST', path: paths.handover, responseMode: 'lastNode', options: {} }, { x: 0, y: 300, webhookId: randomUUID() }),
    node('Parse', 'n8n-nodes-base.code', 2, { jsCode: parseCode }, { x: 220, y: 300 }),
    kumodaPost('Hand over in Kumoda', `=${KUMODA}/api/v1/conversations/{{ $json.conversationId }}/handover`, '={{ JSON.stringify({ reason: $json.note }) }}', 440),
    kumodaPost('Label', `=${KUMODA}/api/v1/conversations/{{ $('Parse').first().json.conversationId }}/labels`, '={"name":"ai-handover"}', 660, { onError: 'continueRegularOutput' }),
    node(
      'Result',
      'n8n-nodes-base.code',
      2,
      {
        jsCode:
          "const ok = $('Hand over in Kumoda').first().json.data?.assigned_to === 'human';\nreturn [{ json: { handed_over: ok, next: ok ? 'Send the fixed closing line now.' : 'The hand-over failed. Tell the customer you could not pass it on right now and that they can email the team.' } }];",
      },
      { x: 880, y: 300 },
    ),
  ],
  connections: wire(null, [c('Webhook', 'Parse'), c('Parse', 'Hand over in Kumoda'), c('Hand over in Kumoda', 'Label'), c('Label', 'Result')]),
  settings: { executionOrder: 'v1', saveDataSuccessExecution: 'all', saveDataErrorExecution: 'all' },
};

writeFileSync(join(outDir, 'chat-agent.json'), JSON.stringify(mainWorkflow, null, 2));
writeFileSync(join(outDir, 'hand-over.json'), JSON.stringify(handoverWorkflow, null, 2));
console.log('wrote docs/agent/workflows');

if (process.argv.includes('--push')) {
  const key = process.env.N8N_API_KEY;
  if (!key) throw new Error('Set N8N_API_KEY.');
  // Some networks cannot resolve kumoda.io; N8N_IP pins the address (the TLS name stays n8n.kumoda.io).
  const ip = process.env.N8N_IP;
  const api = (method, path, body) =>
    new Promise((resolve, reject) => {
      const data = body ? JSON.stringify(body) : null;
      const req = https.request(
        {
          host: 'n8n.kumoda.io',
          path: `/api/v1${path}`,
          method,
          servername: 'n8n.kumoda.io',
          headers: { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) },
          ...(ip ? { lookup: (h, o, cb) => (o && o.all ? cb(null, [{ address: ip, family: 4 }]) : cb(null, ip, 4)) } : {}),
        },
        (res) => {
          let text = '';
          res.on('data', (d) => (text += d));
          res.on('end', () => (res.statusCode < 300 ? resolve(text ? JSON.parse(text) : {}) : reject(new Error(`${method} ${path} -> ${res.statusCode} ${text.slice(0, 600)}`))));
        },
      );
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  const existing = (await api('GET', '/workflows?limit=250')).data ?? [];
  for (const wf of [handoverWorkflow, mainWorkflow]) {
    const found = existing.find((w) => w.name === wf.name);
    const saved = found ? await api('PUT', `/workflows/${found.id}`, wf) : await api('POST', '/workflows', wf);
    console.log(found ? 'updated' : 'created', wf.name, saved.id);
    if (process.argv.includes('--activate')) {
      await api('POST', `/workflows/${saved.id}/activate`);
      console.log('activated', wf.name);
    }
  }
}
