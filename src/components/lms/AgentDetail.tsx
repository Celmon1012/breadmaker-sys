import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowUp, History, Pause, Pencil, Play, Trash2 } from 'lucide-react';
import { errorMessage } from '../../lib/lms';
import { AgentRun, change, formatCost, formatDuration, isRealRun, loadRunsFor, startRun, summarise, timeAgo, weekStats } from '../../lib/agent-runs';
import { AgentVersion, MODEL_CHOICES, StoredAgent, deleteAgent, getAgent, listVersions, restoreVersion, setAgentStatus } from '../../lib/agent-defs';
import { Button, CARD, Chip, Eyebrow, Loading, Notice } from './lms-ui';
import SchedulesPanel from './SchedulesPanel';
import EvalsPanel from './EvalsPanel';
import { RunDetail, StatusPill, Tile } from './RunParts';

/**
 * One agent: what it is, how its runs have gone, a box to ask it something (a real, recorded run of the working
 * copy), its published versions with restore, and pause, resume and delete.
 */
const STATUS_LABEL = { draft: 'Draft', live: 'Live', paused: 'Paused' } as const;

export default function AgentDetail({ agentId, openPath }: { agentId: string; openPath: (path: string) => void }) {
  const [agent, setAgent] = useState<StoredAgent | null>(null);
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [runs, setRuns] = useState<AgentRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [found, history, list] = await Promise.all([getAgent(agentId), listVersions(agentId), loadRunsFor(agentId, 200)]);
      if (!found) return setError('That agent does not exist.');
      setAgent(found);
      setVersions(history);
      setRuns(list);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
      setRuns((current) => current ?? []);
    }
  }, [agentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const working = runs?.some((run) => run.status === 'running') ?? false;
  useEffect(() => {
    if (!working) return;
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [working, refresh]);

  const realRuns = useMemo(() => (runs ?? []).filter(isRealRun), [runs]);
  const metrics = useMemo(() => summarise(realRuns), [realRuns]);
  const thisWeek = useMemo(() => weekStats(runs ?? [], 0, 7), [runs]);
  const lastWeek = useMemo(() => weekStats(runs ?? [], 7, 14), [runs]);
  const current = runs?.find((run) => run.id === selected) ?? null;
  const model = MODEL_CHOICES.find((choice) => choice.id === agent?.model);

  const ask = async () => {
    const value = text.trim();
    if (!value || sending || !agent) return;
    setSending(true);
    setError(null);
    try {
      const id = await startRun(value, agent.id);
      setText('');
      setSelected(id);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const act = async (work: () => Promise<unknown>) => {
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

  if (!agent) {
    return (
      <div>
        <button type="button" onClick={() => openPath('/studio/agents')} className="mb-3 inline-flex cursor-pointer items-center gap-1.5 text-[14px] text-[var(--pg-body)] hover:text-[var(--pg-ink)]"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Agents</button>
        {error ? <Notice tone="error">{error}</Notice> : <Loading label="Opening the agent…" />}
      </div>
    );
  }

  const published = versions[0];
  const unpublished = published && (published.snapshot.instructions !== agent.instructions || published.snapshot.model !== agent.model || JSON.stringify(published.snapshot.tools ?? []) !== JSON.stringify(agent.tools) || JSON.stringify(published.snapshot.rules ?? []) !== JSON.stringify(agent.rules));

  return (
    <div className="space-y-6">
      <button type="button" onClick={() => openPath('/studio/agents')} className="inline-flex cursor-pointer items-center gap-1.5 text-[14px] text-[var(--pg-body)] hover:text-[var(--pg-ink)]"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Agents</button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-editorial text-[30px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[34px]">{agent.name}</h1>
            <Chip tone={agent.status === 'live' ? 'accent' : 'neutral'}>{STATUS_LABEL[agent.status]}</Chip>
            {agent.version > 0 && <Chip>v{agent.version}</Chip>}
          </div>
          {agent.purpose && <p className="mt-2 max-w-[640px] text-[15.5px] leading-[1.6] text-[var(--pg-body)]">{agent.purpose}</p>}
          <p className="mt-2 text-[13px] text-[var(--pg-body)]">{model?.name ?? agent.model} · {agent.tools.length ? `${agent.tools.length} tool${agent.tools.length === 1 ? '' : 's'}` : 'no tools'} · {agent.rules.length} rule{agent.rules.length === 1 ? '' : 's'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => openPath(`/studio/agents/${agent.id}/edit`)}><Pencil className="h-4 w-4" aria-hidden="true" /> Edit</Button>
          {agent.status === 'live' && <Button variant="ghost" busy={busy} onClick={() => void act(() => setAgentStatus(agent.id, 'paused'))}><Pause className="h-4 w-4" aria-hidden="true" /> Pause</Button>}
          {agent.status === 'paused' && <Button busy={busy} onClick={() => void act(() => setAgentStatus(agent.id, 'live'))}><Play className="h-4 w-4" aria-hidden="true" /> Resume</Button>}
          {agent.status === 'draft' && <Button onClick={() => openPath(`/studio/agents/${agent.id}/edit`)}>Finish and publish</Button>}
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {unpublished && <Notice tone="info">You have changes that are not published. Other systems still get version {published.version}. Open Edit, then Publish, to release them.</Notice>}

      <div className={`${CARD} p-3 sm:p-4`}>
        <form onSubmit={(event) => { event.preventDefault(); void ask(); }} className="flex items-end gap-2">
          <textarea value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void ask(); } }} rows={2} maxLength={2000} placeholder={`Ask ${agent.name} something`} aria-label={`Ask ${agent.name}`} className="min-w-0 flex-1 resize-none bg-transparent px-2 py-1.5 text-[15.5px] leading-[1.5] outline-none placeholder:text-[var(--pg-body)]/70" />
          <button type="submit" disabled={!text.trim() || sending} aria-label="Send" className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--pg-ink)] text-[var(--pg-bg)] disabled:cursor-not-allowed disabled:opacity-40"><ArrowUp className="h-4 w-4" /></button>
        </form>
        <p className="px-2 pt-1 text-[12.5px] text-[var(--pg-body)]">Runs the saved working copy and is recorded below. Nothing is sent to anyone.</p>
      </div>

      {current && <RunDetail run={current} onClose={() => setSelected(null)} />}

      <section aria-labelledby="agent-metrics">
        <h2 id="agent-metrics" className="mb-3 text-[18px] font-semibold">Last 7 days</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Runs" value={String(thisWeek.runs)} note={change(thisWeek.runs, lastWeek.runs, String) ?? (thisWeek.failed ? `${thisWeek.failed} failed` : undefined)} />
          <Tile label="Succeeded" value={thisWeek.successPct === null ? '—' : `${thisWeek.successPct}%`} note={change(thisWeek.successPct, lastWeek.successPct, (n) => `${n} pts`)} />
          <Tile label="Typical time" value={formatDuration(thisWeek.avgMs)} note={change(thisWeek.avgMs, lastWeek.avgMs, (n) => formatDuration(n))} />
          <Tile label="Est. cost" value={formatCost(thisWeek.costUsd)} note={change(thisWeek.costUsd, lastWeek.costUsd, formatCost)} />
        </div>
        <div className={`${CARD} mt-3 p-4`}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[14.5px] font-semibold">Runs per day</span>
            <span className="flex items-center gap-3 text-[12px] text-[var(--pg-body)]"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[var(--pg-ink)]" />Completed</span><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[#B42318]" />Had a failure</span></span>
          </div>
          <div className="flex h-24 items-end gap-2" role="img" aria-label={`Runs per day: ${metrics.perDay.map((d) => `${d.day} ${d.runs}`).join(', ')}`}>
            {metrics.perDay.map((day) => {
              const peak = Math.max(1, ...metrics.perDay.map((d) => d.runs));
              return (
                <div key={day.day} className="flex flex-1 flex-col items-center justify-end gap-1.5" title={`${day.day}: ${day.runs} run${day.runs === 1 ? '' : 's'}${day.failed ? `, ${day.failed} failed` : ''}`}>
                  <span className="text-[11px] text-[var(--pg-body)]">{day.runs || ''}</span>
                  <div className={`w-full max-w-[44px] rounded-t-[5px] ${day.failed ? 'bg-[#B42318]' : 'bg-[var(--pg-ink)]'}`} style={{ height: `${Math.max(day.runs ? 6 : 2, (day.runs / peak) * 64)}px`, opacity: day.runs ? 1 : 0.18 }} />
                  <span className="text-[11px] text-[var(--pg-body)]">{day.day}</span>
                </div>
              );
            })}
          </div>
          {metrics.byTool.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{metrics.byTool.map((tool) => <Chip key={tool.name}>{tool.name} · {tool.calls}</Chip>)}</div>}
        </div>
      </section>

      <section aria-labelledby="agent-runs">
        <h2 id="agent-runs" className="mb-3 text-[18px] font-semibold">Recent runs</h2>
        {!runs ? <Loading /> : runs.length === 0 ? (
          <div className={`${CARD} p-5 text-[15px] text-[var(--pg-body)]`}>No runs yet. Ask it something above.</div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {runs.slice(0, 8).map((run) => (
              <li key={run.id}>
                <button type="button" onClick={() => setSelected(run.id === selected ? null : run.id)} className={`${CARD} flex h-full w-full cursor-pointer flex-col gap-2 p-4 text-left transition hover:border-[var(--pg-line)] ${run.id === selected ? 'ring-2 ring-[var(--pg-ink)]' : ''}`}>
                  <span className="line-clamp-2 text-[14.5px] font-medium leading-snug">{run.input}</span>
                  <span className="flex flex-wrap items-center gap-2 text-[12.5px] text-[var(--pg-body)]"><StatusPill status={run.status} /><span>{timeAgo(run.startedAt)}</span><span>·</span><span>{formatDuration(run.durationMs)}</span></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <SchedulesPanel agentId={agent.id} suggestion="Run your usual check and tell me anything I should know." openRun={setSelected} />

      <EvalsPanel agentId={agent.id} />

      <section aria-labelledby="agent-versions">
        <h2 id="agent-versions" className="mb-1 flex items-center gap-2 text-[18px] font-semibold"><History className="h-4 w-4" aria-hidden="true" /> Versions</h2>
        <p className="mb-3 text-[14px] text-[var(--pg-body)]">Each publish is saved. Restoring one puts it back as a new version, so nothing is lost.</p>
        {versions.length === 0 ? (
          <div className={`${CARD} p-5 text-[15px] text-[var(--pg-body)]`}>Not published yet. Publish from Edit to make the first version.</div>
        ) : (
          <ul className={`${CARD} divide-y divide-[var(--pg-line-soft)]`}>
            {versions.map((version, index) => (
              <li key={version.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><span className="text-[14.5px] font-semibold">v{version.version}</span>{index === 0 && agent.status === 'live' && <Chip tone="accent">Live</Chip>}</div>
                  <div className="text-[13px] text-[var(--pg-body)]">{version.note || 'No note'} · {timeAgo(version.createdAt)}</div>
                </div>
                {index > 0 && <Button variant="ghost" busy={busy} onClick={() => void act(() => restoreVersion(agent, version))}>Restore</Button>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-t border-[var(--pg-line-soft)] pt-5">
        <Eyebrow>Danger zone</Eyebrow>
        <p className="mt-1 text-[14px] text-[var(--pg-body)]">Deleting removes the agent and its versions. Its past runs stay in the list.</p>
        <div className="mt-3">
          <Button variant="danger" busy={busy} onClick={() => { if (window.confirm(`Delete ${agent.name}? This cannot be undone.`)) void act(async () => { await deleteAgent(agent.id); openPath('/studio/agents'); }); }}><Trash2 className="h-4 w-4" aria-hidden="true" /> Delete agent</Button>
        </div>
      </section>
    </div>
  );
}
