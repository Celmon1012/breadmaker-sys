import React, { useCallback, useEffect, useState } from 'react';
import { FileText, Globe, RefreshCw, Trash2 } from 'lucide-react';
import { errorMessage } from '../../lib/lms';
import { timeAgo } from '../../lib/agent-runs';
import { KnowledgeSource, addPage, addText, listSources, nameFromUrl, readAgain, removeSource } from '../../lib/agent-knowledge';
import { Button, CARD, Chip, Field, Notice, TextArea, TextInput, useTeamRole } from './lms-ui';

/**
 * What this agent is allowed to say: pasted text, or a public web page. The agent searches these when it is asked
 * something factual and names the source it used. Add the policy, the FAQ, the price list; keep it small and current.
 */
export default function KnowledgePanel({ agentId, member = false }: { agentId: string | undefined; /** A member's own agent: they may change its knowledge. */ member?: boolean }) {
  const { role } = useTeamRole();
  const canEdit = member || role === 'Owner' || role === 'Coach';
  const [items, setItems] = useState<KnowledgeSource[] | null>(null);
  const [mode, setMode] = useState<'none' | 'text' | 'page'>('none');
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [address, setAddress] = useState('https://');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!agentId) return;
    try {
      setItems(await listSources(agentId));
    } catch {
      // The knowledge tables may not exist yet (migration 65).
      setItems([]);
    }
  }, [agentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (key: string, work: () => Promise<string | void>) => {
    setBusy(key);
    setError(null);
    setNote(null);
    try {
      const message = await work();
      if (message) setNote(message);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const add = () =>
    run('add', async () => {
      if (!agentId) throw new Error('Save the draft first.');
      const result = mode === 'text' ? await addText(agentId, name, text) : await addPage(agentId, name || nameFromUrl(address), address.trim());
      setMode('none');
      setName('');
      setText('');
      setAddress('https://');
      return `Added: ${result.chunks} passage${result.chunks === 1 ? '' : 's'} the agent can search.`;
    });

  if (!agentId) {
    return <div className={`${CARD} p-5 text-[14.5px] text-[var(--pg-body)]`}>Save the draft with Continue first. Knowledge belongs to a saved agent.</div>;
  }

  const total = (items ?? []).reduce((sum, item) => sum + item.chunkCount, 0);

  return (
    <div className={`${CARD} space-y-4 p-5 sm:p-6`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold">Knowledge sources</h2>
          <p className="text-[13.5px] text-[var(--pg-body)]">What the agent is allowed to say. It searches these for factual questions and names the source it used. If nothing matches, it says it does not know.</p>
        </div>
        {canEdit && mode === 'none' && (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setMode('text')}>Add text</Button>
            <Button variant="ghost" onClick={() => setMode('page')}>Add a web page</Button>
          </div>
        )}
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {note && <Notice tone="success">{note}</Notice>}

      {mode !== 'none' && (
        <div className="space-y-3 rounded-[14px] border border-[var(--pg-line-soft)] p-4">
          <Field label="Name" hint="What this source is, so the agent can name it.">
            <TextInput value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder={mode === 'text' ? 'Returns policy' : nameFromUrl(address) || 'northwind.co/help'} />
          </Field>
          {mode === 'text' ? (
            <Field label="Text" hint="Paste the policy, FAQ or price list. Up to about 200,000 characters.">
              <TextArea rows={8} value={text} onChange={(event) => setText(event.target.value)} placeholder="Paste the document here." />
            </Field>
          ) : (
            <Field label="Web address" hint="A public page, https only. Files such as PDFs are not read yet: paste their text instead.">
              <TextInput value={address} onChange={(event) => setAddress(event.target.value)} placeholder="https://example.com/help/returns" />
            </Field>
          )}
          <div className="flex gap-2">
            <Button onClick={() => void add()} busy={busy === 'add'} disabled={mode === 'text' ? text.trim().length < 20 : !address.startsWith('https://')}>{mode === 'text' ? 'Add this text' : 'Read this page'}</Button>
            <Button variant="ghost" onClick={() => { setMode('none'); setError(null); }}>Cancel</Button>
          </div>
        </div>
      )}

      {items === null ? null : items.length === 0 ? (
        mode === 'none' && <p className="text-[14.5px] text-[var(--pg-body)]">No sources yet. Without any, the agent can only answer from its instructions.{canEdit ? ' Add the document it should answer from.' : ''}</p>
      ) : (
        <ul className="divide-y divide-[var(--pg-line-soft)] rounded-[14px] border border-[var(--pg-line-soft)]">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[var(--pg-alt)]">{item.kind === 'url' ? <Globe className="h-4 w-4" aria-hidden="true" /> : <FileText className="h-4 w-4" aria-hidden="true" />}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><span className="text-[14.5px] font-semibold">{item.name}</span><Chip tone={item.status === 'ready' ? 'accent' : 'neutral'}>{item.status === 'ready' ? 'Ready' : 'Failed'}</Chip></div>
                  <div className="text-[12.5px] text-[var(--pg-body)]">{item.kind === 'url' ? item.url : 'Pasted text'} · {item.chunkCount} passage{item.chunkCount === 1 ? '' : 's'} · {timeAgo(item.updatedAt)}</div>
                  {item.error && <p className="mt-1 text-[12.5px] text-[#B42318]">{item.error}</p>}
                </div>
              </div>
              {canEdit && (
                <div className="flex gap-2">
                  {item.kind === 'url' && <Button variant="ghost" busy={busy === `r${item.id}`} onClick={() => void run(`r${item.id}`, async () => { const result = await readAgain(item.id); return `Read again: ${result.chunks} passage${result.chunks === 1 ? '' : 's'}.`; })} aria-label={`Read ${item.name} again`}><RefreshCw className="h-4 w-4" aria-hidden="true" /></Button>}
                  <Button variant="danger" busy={busy === `d${item.id}`} onClick={() => { if (window.confirm(`Remove "${item.name}"? The agent will no longer answer from it.`)) void run(`d${item.id}`, () => removeSource(item.id)); }} aria-label={`Remove ${item.name}`}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {items && items.length > 0 && <p className="text-[12.5px] text-[var(--pg-body)]">{items.length} source{items.length === 1 ? '' : 's'} · {total} passages. Try a question in the preview: the agent will say which source it used.</p>}
    </div>
  );
}
