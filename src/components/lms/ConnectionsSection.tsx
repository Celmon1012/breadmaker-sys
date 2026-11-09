import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { errorMessage } from '../../lib/lms';
import { loadPlatformStatus } from '../../lib/agent-runs';
import {
  Connection,
  ConnectionDraft,
  McpDraft,
  addMcpServer,
  draftFromHttp,
  draftFromMcp,
  updateConnection,
  updateMcpServer,
  discoverServer,
  emptyMcpDraft,
  DiscoveredTool,
  Method,
  ParamType,
  TryResult,
  addConnection,
  deleteConnection,
  emptyDraft,
  listConnections,
  secretsUsed,
  setConnectionEnabled,
  toConfig,
  toolIdFrom,
  tryConnection,
} from '../../lib/agent-connections';
import { Button, CARD, Chip, Eyebrow, Field, Loading, Notice, Select, TextArea, TextInput, useTeamRole } from './lms-ui';

/**
 * Connections: web tools agents can use. Define one call (address, headers, inputs), try it with real values if it only
 * reads, and every agent can then pick it in the builder. A tool that changes something always waits for approval.
 */
const METHODS: Method[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const hostOf = (url: string) => {
  try {
    return new URL(url.replace(/\{\{[^}]*\}\}/g, 'x')).host;
  } catch {
    return url;
  }
};

/** Tool names that suggest they change something. A hint to slow down on, never a rule: the person decides. */
const CHANGES_THINGS = /^(create|update|delete|remove|set|add|send|complete|propose|write|post|put|patch|cancel|approve|assign|move|restart|deploy|edit|reset|publish|archive)(_|$)/i;
const looksLikeWrite = (name: string) => CHANGES_THINGS.test(name);

/** What is wrong with a connection form, in plain words, before it is sent. Null when it is fine. */
function formProblem(draft: { name: string; toolId: string; description: string; url: string; headers: { name: string; value: string }[] }): string | null {
  if (draft.name.trim().length < 2) return 'Give it a name.';
  const id = draft.toolId.trim() || toolIdFrom(draft.name);
  if (!/^[a-z][a-z0-9_]{2,39}$/.test(id)) return 'The id must be 3 to 40 characters: lower-case letters, numbers and underscores, starting with a letter.';
  if (draft.description.trim().length < 10) return 'Fill in the description (at least 10 characters). The grey text is only an example.';
  if (!draft.url.trim().startsWith('https://') || draft.url.trim().length < 12) return 'The address must start with https:// and be a full web address.';
  const misspelt = draft.headers.find((h) => h.name.trim().toLowerCase() === 'authorisation');
  if (misspelt) return 'The header is spelled Authorization, with a z. Servers will not recognise Authorisation.';
  return null;
}

function Editor({ existing, onSaved, onCancel }: { existing?: Connection; onSaved: () => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<ConnectionDraft>(existing ? draftFromHttp(existing) : emptyDraft());
  const [idTouched, setIdTouched] = useState(Boolean(existing));
  const [sample, setSample] = useState<Record<string, string>>({});
  const [result, setResult] = useState<TryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'try' | null>(null);

  const config = toConfig(draft);
  const secrets = secretsUsed(config);
  const reads = config.risk === 'read';
  const update = (patch: Partial<ConnectionDraft>) => setDraft((current) => ({ ...current, ...patch }));

  const save = async () => {
    const problem = formProblem(draft);
    if (problem) return setError(problem);
    setBusy('save');
    setError(null);
    try {
      if (existing) await updateConnection(existing.id, draft);
      else await addConnection(draft);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  };

  const tryIt = async () => {
    setBusy('try');
    setError(null);
    setResult(null);
    try {
      setResult(await tryConnection(draft, sample));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={`${CARD} space-y-5 p-5 sm:p-6`}>
      <h2 className="text-[18px] font-semibold">{existing ? `Edit ${existing.name}` : 'New web tool'}</h2>
      {error && <Notice tone="error">{error}</Notice>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" hint="What people call it.">
          <TextInput value={draft.name} maxLength={80} onChange={(event) => update({ name: event.target.value, toolId: idTouched ? draft.toolId : toolIdFrom(event.target.value) })} placeholder="Find order" />
        </Field>
        <Field label="Tool id" hint={existing ? 'Fixed: agents refer to it.' : 'What an agent calls it: lower-case words and underscores.'}>
          <TextInput value={draft.toolId} disabled={Boolean(existing)} maxLength={40} onChange={(event) => { setIdTouched(true); update({ toolId: event.target.value }); }} placeholder="find_order" />
        </Field>
      </div>
      <Field label="What it does (required)" hint="The agent reads this to decide when to use it. Say what it returns and when it helps.">
        <TextArea rows={2} maxLength={400} value={draft.description} onChange={(event) => update({ description: event.target.value })} placeholder="Look up one order by its number and return its status and delivery date." />
      </Field>

      <div className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)]">
        <Field label="Method">
          <Select value={draft.method} onChange={(event) => update({ method: event.target.value as Method })}>
            {METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
          </Select>
        </Field>
        <Field label="Address" hint="https only. Use {{input_name}} for values the agent supplies. The host cannot change.">
          <TextInput value={draft.url} onChange={(event) => update({ url: event.target.value })} placeholder="https://api.example.com/orders/{{order_id}}" />
        </Field>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between"><span className="text-[13.5px] font-medium">Inputs the agent supplies</span>
          <Button variant="ghost" onClick={() => update({ params: [...draft.params, { name: '', type: 'string', description: '' }] })}><Plus className="h-4 w-4" aria-hidden="true" /> Add input</Button>
        </div>
        {draft.params.length === 0 && <p className="text-[13px] text-[var(--pg-body)]">None. Add one for each {'{{value}}'} in the address, and for what goes in the body.</p>}
        <div className="space-y-2">
          {draft.params.map((param, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[160px_110px_minmax(0,1fr)_40px]">
              <TextInput value={param.name} placeholder="order_id" aria-label="Input name" onChange={(event) => update({ params: draft.params.map((p, i) => (i === index ? { ...p, name: event.target.value } : p)) })} />
              <Select value={param.type} aria-label="Type" onChange={(event) => update({ params: draft.params.map((p, i) => (i === index ? { ...p, type: event.target.value as ParamType } : p)) })}>
                <option value="string">text</option><option value="number">number</option><option value="boolean">yes/no</option>
              </Select>
              <TextInput value={param.description} placeholder="The order number" aria-label="What it is" onChange={(event) => update({ params: draft.params.map((p, i) => (i === index ? { ...p, description: event.target.value } : p)) })} />
              <button type="button" onClick={() => update({ params: draft.params.filter((_, i) => i !== index) })} aria-label="Remove input" className="flex cursor-pointer items-center justify-center rounded-full hover:bg-[var(--pg-alt)]"><X className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between"><span className="text-[13.5px] font-medium">Headers</span>
          <Button variant="ghost" onClick={() => update({ headers: [...draft.headers, { name: '', value: '' }] })}><Plus className="h-4 w-4" aria-hidden="true" /> Add header</Button>
        </div>
        <p className="mb-2 text-[13px] text-[var(--pg-body)]">For a key or token, write <code className="rounded bg-[var(--pg-alt)] px-1">{'{{secret:SHOP}}'}</code>. Its value is never stored here: you set it as <code className="rounded bg-[var(--pg-alt)] px-1">CONN_SECRET_SHOP</code> in the platform settings.</p>
        <div className="space-y-2">
          {draft.headers.map((header, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[200px_minmax(0,1fr)_40px]">
              <TextInput value={header.name} placeholder="Authorization" aria-label="Header name" onChange={(event) => update({ headers: draft.headers.map((h, i) => (i === index ? { ...h, name: event.target.value } : h)) })} />
              <TextInput value={header.value} placeholder="Bearer {{secret:SHOP}}" aria-label="Header value" onChange={(event) => update({ headers: draft.headers.map((h, i) => (i === index ? { ...h, value: event.target.value } : h)) })} />
              <button type="button" onClick={() => update({ headers: draft.headers.filter((_, i) => i !== index) })} aria-label="Remove header" className="flex cursor-pointer items-center justify-center rounded-full hover:bg-[var(--pg-alt)]"><X className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
        {secrets.length > 0 && <div className="mt-2"><Notice tone="info">Before this works, add {secrets.join(', ')} to the agent platform's settings in Coolify.</Notice></div>}
      </div>

      {draft.method === 'GET' ? (
        <label className="flex cursor-pointer items-start gap-2.5 text-[14px]">
          <input type="checkbox" checked={draft.alwaysAsk} onChange={(event) => update({ alwaysAsk: event.target.checked })} className="mt-1" />
          <span>Ask for approval each time, even though it only reads <span className="block text-[12.5px] text-[var(--pg-body)]">For a lookup that returns private details.</span></span>
        </label>
      ) : (
        <label className="flex cursor-pointer items-start gap-2.5 text-[14px]">
          <input type="checkbox" checked={draft.sendBody} onChange={(event) => update({ sendBody: event.target.checked })} className="mt-1" />
          <span>Send the inputs not used in the address as a JSON body</span>
        </label>
      )}
      <Notice tone="info">{reads ? 'This only reads, so an agent can use it straight away.' : 'This changes something, so an agent can only ask to use it: a person approves each call first.'}</Notice>

      {reads && (
        <div className="space-y-3 rounded-[14px] border border-[var(--pg-line-soft)] p-4">
          <Eyebrow>Try it</Eyebrow>
          {draft.params.filter((p) => p.name).map((param) => (
            <Field key={param.name} label={param.name} hint={param.description}>
              <TextInput value={sample[param.name] ?? ''} onChange={(event) => setSample({ ...sample, [param.name]: event.target.value })} />
            </Field>
          ))}
          <Button variant="ghost" onClick={() => void tryIt()} busy={busy === 'try'} disabled={!draft.url.startsWith('https://')}>Try it with these values</Button>
          {result && (
            <div>
              <div className="mb-1 flex items-center gap-2"><Chip tone={result.ok ? 'accent' : 'neutral'}>{result.status ? `HTTP ${result.status}` : 'Not sent'}</Chip></div>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-[8px] bg-[var(--pg-alt)] p-2 text-[12.5px]">{result.body || '(empty)'}</pre>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button onClick={() => void save()} busy={busy === 'save'}>{existing ? 'Save changes' : 'Save web tool'}</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

/** Add an MCP server: connect, see what it offers, and mark the tools that only read. The rest will always ask first. */
function McpEditor({ existing, onSaved, onCancel }: { existing?: Connection; onSaved: () => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<McpDraft>(existing ? draftFromMcp(existing) : emptyMcpDraft());
  const [idTouched, setIdTouched] = useState(Boolean(existing));
  const [found, setFound] = useState<DiscoveredTool[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'check' | 'save' | null>(null);
  const update = (patch: Partial<McpDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const secrets = secretsUsed({ url: draft.url, headers: Object.fromEntries(draft.headers.map((h) => [h.name, h.value])) });

  const check = async () => {
    if (draft.headers.some((h) => h.name.trim().toLowerCase() === 'authorisation')) return setError('The header is spelled Authorization, with a z. Servers will not recognise Authorisation.');
    setBusy('check');
    setError(null);
    try {
      const result = await discoverServer(draft);
      setFound(result.tools);
      if (result.error) setError(`The server did not answer: ${result.error}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    const problem = formProblem(draft);
    if (problem) return setError(problem);
    const risky = draft.readOnly.filter(looksLikeWrite);
    if (risky.length && !window.confirm(`These tools sound like they change things, but are marked to run without asking:

${risky.join(', ')}

An agent could use them with nobody approving. Save anyway?`)) return;
    setBusy('save');
    setError(null);
    try {
      if (existing) await updateMcpServer(existing.id, draft);
      else await addMcpServer(draft);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  };

  const toggle = (name: string) => update({ readOnly: draft.readOnly.includes(name) ? draft.readOnly.filter((n) => n !== name) : [...draft.readOnly, name] });

  return (
    <div className={`${CARD} space-y-5 p-5 sm:p-6`}>
      <h2 className="text-[18px] font-semibold">{existing ? `Edit ${existing.name}` : 'Add an MCP server'}</h2>
      <p className="text-[14px] text-[var(--pg-body)]">An MCP server publishes its own tools. Once connected, they appear in every agent's Tools step, named after the server. A tool only runs on its own if you mark it as read-only below; every other tool asks a person first.</p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name"><TextInput value={draft.name} maxLength={80} onChange={(event) => update({ name: event.target.value, toolId: idTouched ? draft.toolId : toolIdFrom(event.target.value) })} placeholder="Restart ops" /></Field>
        <Field label="Id" hint={existing ? 'Fixed: agents refer to it.' : 'Its tools are named id_toolname.'}><TextInput value={draft.toolId} disabled={Boolean(existing)} maxLength={40} onChange={(event) => { setIdTouched(true); update({ toolId: event.target.value }); }} placeholder="restart_ops" /></Field>
      </div>
      <Field label="What it is for (required)" hint="Shown next to its tools.">
        <TextArea rows={2} maxLength={400} value={draft.description} onChange={(event) => update({ description: event.target.value })} placeholder="Projects, tasks and teammates in the Restart console." />
      </Field>
      <Field label="Server address" hint="https only, a public address.">
        <TextInput value={draft.url} onChange={(event) => { update({ url: event.target.value }); setFound(null); }} placeholder="https://mcp.example.com/mcp" />
      </Field>
      <div>
        <div className="mb-1.5 flex items-center justify-between"><span className="text-[13.5px] font-medium">Headers</span>
          <Button variant="ghost" onClick={() => update({ headers: [...draft.headers, { name: '', value: '' }] })}><Plus className="h-4 w-4" aria-hidden="true" /> Add header</Button>
        </div>
        <p className="mb-2 text-[13px] text-[var(--pg-body)]">For a key, write <code className="rounded bg-[var(--pg-alt)] px-1">{'{{secret:OPS}}'}</code> and set <code className="rounded bg-[var(--pg-alt)] px-1">CONN_SECRET_OPS</code> in the platform settings.</p>
        <div className="space-y-2">
          {draft.headers.map((header, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[200px_minmax(0,1fr)_40px]">
              <TextInput value={header.name} placeholder="Authorization" aria-label="Header name" onChange={(event) => update({ headers: draft.headers.map((h, i) => (i === index ? { ...h, name: event.target.value } : h)) })} />
              <TextInput value={header.value} placeholder="Bearer {{secret:OPS}}" aria-label="Header value" onChange={(event) => update({ headers: draft.headers.map((h, i) => (i === index ? { ...h, value: event.target.value } : h)) })} />
              <button type="button" onClick={() => update({ headers: draft.headers.filter((_, i) => i !== index) })} aria-label="Remove header" className="flex cursor-pointer items-center justify-center rounded-full hover:bg-[var(--pg-alt)]"><X className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
        {secrets.length > 0 && <div className="mt-2"><Notice tone="info">Before the server answers, add {secrets.join(', ')} to the agent platform's settings in Coolify.</Notice></div>}
      </div>

      <div className="space-y-3 rounded-[14px] border border-[var(--pg-line-soft)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Eyebrow>What it offers</Eyebrow>
          <Button variant="ghost" onClick={() => void check()} busy={busy === 'check'} disabled={!draft.url.startsWith('https://')}>Check the server</Button>
        </div>
        {found === null ? (
          <p className="text-[13.5px] text-[var(--pg-body)]">Check the server to see its tools, then tick the ones that only read.</p>
        ) : found.length === 0 ? (
          <p className="text-[13.5px] text-[var(--pg-body)]">No tools came back.</p>
        ) : (
          <ul className="space-y-2">
            {found.map((tool) => (
              <li key={tool.name}>
                <label className="flex cursor-pointer items-start gap-2.5 text-[14px]">
                  <input type="checkbox" checked={draft.readOnly.includes(tool.name)} onChange={() => toggle(tool.name)} className="mt-1" />
                  <span><span className="font-mono text-[13px] font-semibold">{tool.name}</span> <span className="text-[var(--pg-body)]">{tool.description}</span>{draft.readOnly.includes(tool.name) && looksLikeWrite(tool.name) && <span className="mt-0.5 block text-[12.5px] font-medium text-[#B42318]">The name suggests this changes something. If so, leave it unticked so it asks first.</span>}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <Notice tone="info">{draft.readOnly.length > 0 ? `${draft.readOnly.length} tool${draft.readOnly.length === 1 ? '' : 's'} will run on their own. Every other tool asks a person first.` : 'Every tool will ask a person first. Tick a tool above only if you are sure it never changes anything.'}</Notice>
      </div>

      <div className="flex gap-2">
        <Button onClick={() => void save()} busy={busy === 'save'}>{existing ? 'Save changes' : 'Save MCP server'}</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

export default function ConnectionsSection() {
  const { role } = useTeamRole();
  const canEdit = role === 'Owner' || role === 'Coach';
  const [items, setItems] = useState<Connection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'none' | 'http' | 'mcp'>('none');
  const adding = mode !== 'none';
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = items?.find((item) => item.id === editingId);
  const setAdding = (on: boolean) => setMode(on ? 'http' : 'none');
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    // The platform reports tools it is not offering to agents, with the reason.
    loadPlatformStatus()
      .then((status) => setProblems(Object.fromEntries((status.problems ?? []).map((p) => [p.id, p.reason]))))
      .catch(() => setProblems({}));
    try {
      setItems(await listConnections());
      setError(null);
    } catch (err) {
      // The table may not exist yet (migration 64).
      setItems([]);
      setError(`${errorMessage(err)} If this is new, the connections table may not be set up yet.`);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-editorial text-[30px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[36px]">Connections</h1>
          <p className="mt-2 max-w-[640px] text-[15.5px] leading-[1.6] text-[var(--pg-body)]">
            Web tools your agents can use: look something up in another system, or ask it to do something. Define one and pick it in any agent's Tools step. Anything that changes something waits for a person to approve it.
          </p>
        </div>
        {canEdit && !adding && (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setMode('mcp')}><Plus className="h-4 w-4" aria-hidden="true" /> Add MCP server</Button>
            <Button onClick={() => setMode('http')}><Plus className="h-4 w-4" aria-hidden="true" /> New web tool</Button>
          </div>
        )}
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {mode === 'http' && <Editor key={editingId ?? 'new'} existing={editing} onSaved={() => { setMode('none'); setEditingId(null); void refresh(); }} onCancel={() => { setMode('none'); setEditingId(null); }} />}
      {mode === 'mcp' && <McpEditor key={editingId ?? 'new'} existing={editing} onSaved={() => { setMode('none'); setEditingId(null); void refresh(); }} onCancel={() => { setMode('none'); setEditingId(null); }} />}

      {items === null ? (
        <Loading />
      ) : items.length === 0 ? (
        !adding && <div className={`${CARD} p-6 text-[15px] text-[var(--pg-body)]`}>No web tools yet.{canEdit ? ' Add one and it appears in every agent’s Tools step.' : ''}</div>
      ) : (
        <ul className={`${CARD} divide-y divide-[var(--pg-line-soft)]`}>
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-semibold">{item.name}</span>
                  {item.kind === 'mcp' ? (
                    <>
                      <Chip>MCP · {hostOf(item.config.url)}</Chip>
                      <Chip>{item.config.readOnly?.length ?? 0} read-only tool{(item.config.readOnly?.length ?? 0) === 1 ? '' : 's'}</Chip>
                    </>
                  ) : (
                    <>
                      <Chip>{item.config.method} {hostOf(item.config.url)}</Chip>
                      <Chip tone={item.config.risk === 'read' ? 'accent' : 'neutral'}>{item.config.risk === 'read' ? 'reads' : 'needs approval'}</Chip>
                    </>
                  )}
                  {!item.enabled && <Chip>Off</Chip>}
                </div>
                <div className="mt-0.5 font-mono text-[12.5px] text-[var(--pg-body)]">{item.toolId}</div>
                <p className="mt-1 max-w-[680px] text-[14px] leading-snug text-[var(--pg-body)]">{item.description}</p>
                {item.enabled && problems[item.toolId] && <p className="mt-1 text-[13px] text-[#B42318]">Not offered to agents: {problems[item.toolId]}</p>}
                {secretsUsed(item.config).length > 0 && <p className="mt-1 text-[12.5px] text-[var(--pg-body)]">Needs {secretsUsed(item.config).join(', ')} in the platform settings.</p>}
              </div>
              {canEdit && (
                <div className="flex gap-2">
                  <Button variant="ghost" busy={busy} onClick={() => { setEditingId(item.id); setMode(item.kind === 'mcp' ? 'mcp' : 'http'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</Button>
                  <Button variant="ghost" busy={busy} onClick={() => void run(() => setConnectionEnabled(item.id, !item.enabled))}>{item.enabled ? 'Turn off' : 'Turn on'}</Button>
                  <Button variant="danger" busy={busy} aria-label={`Delete ${item.name}`} onClick={() => { if (window.confirm(`Delete the web tool "${item.name}"? Agents that use it lose it.`)) void run(() => deleteConnection(item.id)); }}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
