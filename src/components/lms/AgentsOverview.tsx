import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, ChevronRight, Plus } from 'lucide-react';
import { errorMessage } from '../../lib/lms';
import { AgentRun, PlatformStatus, formatCost, formatDuration, loadPlatformStatus, loadRuns, summarise, timeAgo } from '../../lib/agent-runs';
import { StoredAgent, listAgents } from '../../lib/agent-defs';
import { Approval, loadApprovals } from '../../lib/agent-approvals';
import { AttentionItem, loadAttention, successRate, weekOf } from '../../lib/agent-attention';
import { Button, CARD, Chip, Loading, Notice } from './lms-ui';
import { RunDetail, StatusPill } from './RunParts';
import ApprovalsPanel from './ApprovalsPanel';

/**
 * The control room: how every agent is doing at a glance (status, last week's volume, how often it succeeds, what it
 * costs), and a list of what needs a person's attention, each with where to go to fix it. Open an agent for the detail.
 */
type Filter = 'all' | 'live' | 'drafts';

interface Row {
  key: string;
  name: string;
  sub: string;
  status: 'live' | 'paused' | 'draft';
  path: string;
  runs: AgentRun[];
  builtIn?: boolean;
}

function Spark({ runs, label }: { runs: AgentRun[]; label: string }) {
  const days = summarise(runs).perDay;
  const peak = Math.max(1, ...days.map((d) => d.runs));
  return (
    <span className="flex h-7 items-end gap-[3px]" role="img" aria-label={label}>
      {days.map((day, i) => (
        <span key={i} className={`w-[6px] rounded-t-[2px] ${day.failed ? 'bg-[#B42318]' : 'bg-[var(--pg-ink)]'}`} style={{ height: `${Math.max(day.runs ? 5 : 2, (day.runs / peak) * 26)}px`, opacity: day.runs ? 1 : 0.2 }} />
      ))}
    </span>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: 'warn' | 'good' }) {
  return (
    <div className={`${CARD} p-4`}>
      <div className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--pg-body)]">
        <span className={`h-1.5 w-1.5 rounded-full ${tone === 'warn' ? 'bg-amber-600' : tone === 'good' ? 'bg-emerald-600' : 'bg-[var(--pg-ink)]'}`} />
        {label}
      </div>
      <div className="mt-2 font-editorial text-[30px] font-semibold leading-none tracking-[-0.02em]">{value}</div>
      {note && <div className="mt-1.5 text-[12.5px] text-[var(--pg-body)]">{note}</div>}
    </div>
  );
}

export default function AgentsOverview({ openPath }: { openPath: (path: string) => void }) {
  const [runs, setRuns] = useState<AgentRun[] | null>(null);
  const [agents, setAgents] = useState<StoredAgent[] | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [platform, setPlatform] = useState<PlatformStatus | null>(null);
  const [platformError, setPlatformError] = useState<string | null>(null);
  const [attention, setAttention] = useState<AttentionItem[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRuns(await loadRuns(200));
    } catch {
      setRuns((current) => current ?? []);
    }
    setApprovals(await loadApprovals().catch(() => []));
  }, []);

  useEffect(() => {
    void refresh();
    // The agents table may not exist yet (migration 60); the page still works without it.
    listAgents().then(setAgents).catch(() => setAgents([]));
    loadPlatformStatus()
      .then(setPlatform)
      .catch((err) => setPlatformError(errorMessage(err)));
  }, [refresh]);

  const working = runs?.some((run) => run.status === 'running') ?? false;
  useEffect(() => {
    if (!working) return;
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [working, refresh]);

  // The attention list needs everything else loaded first.
  useEffect(() => {
    if (!runs || !agents) return;
    void loadAttention({ agents, runs, approvals, problems: platform?.problems ?? [] }).then(setAttention);
  }, [runs, agents, approvals, platform]);

  const rows: Row[] = useMemo(() => {
    const all = runs ?? [];
    const ops: Row = { key: 'ops', name: 'Ops', sub: 'Built in · platform checker', status: 'live', path: '/studio/agents/ops', runs: weekOf(all, (r) => r.agent === 'ops' && !r.agentId), builtIn: true };
    const mine: Row[] = (agents ?? []).map((agent) => ({
      key: agent.id,
      name: agent.name,
      sub: `${agent.version > 0 ? `v${agent.version}` : 'not published'} · ${agent.tools.length} tool${agent.tools.length === 1 ? '' : 's'}`,
      status: agent.status,
      path: `/studio/agents/${agent.id}`,
      runs: weekOf(all, (r) => r.agentId === agent.id),
    }));
    return [ops, ...mine];
  }, [runs, agents]);

  const shown = rows.filter((row) => (filter === 'all' ? true : filter === 'live' ? row.status === 'live' : row.status === 'draft'));
  const weekRuns = rows.flatMap((row) => row.runs);
  const overall = successRate(weekRuns);
  const totals = summarise(weekRuns);
  const current = runs?.find((run) => run.id === selected) ?? null;
  const liveCount = rows.filter((row) => row.status === 'live').length;
  const missing = platform ? ([['anthropic', 'a model key'], ['supabase', 'database access'], ['coolify', 'Coolify access']] as const).filter(([key]) => !platform[key]).map(([, label]) => label) : [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-editorial text-[30px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[36px]">Agent control room</h1>
          <p className="mt-2 text-[15.5px] leading-[1.6] text-[var(--pg-body)]">{liveCount} agent{liveCount === 1 ? '' : 's'} live · last 7 days</p>
        </div>
        <Button onClick={() => openPath('/studio/agents/new')}><Plus className="h-4 w-4" aria-hidden="true" /> New agent</Button>
      </div>

      {platformError && <Notice tone="error">The agent platform is not reachable ({platformError}). Runs already recorded are still listed below.</Notice>}
      {platform?.paused && <Notice tone="error">Agents are paused. New runs are refused until the kill switch is turned off.</Notice>}
      {missing.length > 0 && <Notice tone="info">The agent platform still needs {missing.join(', ')} before agents can answer. Add them in its Coolify settings.</Notice>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Live agents" value={String(liveCount)} note={`${rows.length} in all`} tone="good" />
        <Stat label="Runs" value={String(weekRuns.length)} note={totals.failed ? `${totals.failed} failed` : weekRuns.length ? 'none failed' : 'none yet'} />
        <Stat label="Succeeded" value={overall === null ? '—' : `${overall}%`} note={overall === null ? 'no runs yet' : 'of finished runs'} tone={overall !== null && overall < 80 ? 'warn' : 'good'} />
        <Stat label="Needs attention" value={attention ? String(attention.length) : '…'} note={platform ? `spend ${formatCost(totals.costUsd)} · cap $${platform.maxDailyUsd}/day` : undefined} tone={attention && attention.length ? 'warn' : undefined} />
      </div>

      <ApprovalsPanel />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="agents-table" className={`${CARD} overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--pg-line-soft)] px-4 py-3">
            <h2 id="agents-table" className="flex items-center gap-2 text-[17px] font-semibold">Your agents <span className="rounded-full bg-[var(--pg-alt)] px-2 py-0.5 text-[12px] font-medium">{rows.length}</span></h2>
            <div className="inline-flex rounded-full bg-[var(--pg-alt)] p-0.5 text-[13px]" role="tablist" aria-label="Filter agents">
              {([['all', 'All'], ['live', 'Live'], ['drafts', 'Drafts']] as const).map(([id, label]) => (
                <button key={id} role="tab" aria-selected={filter === id} type="button" onClick={() => setFilter(id)} className={`cursor-pointer rounded-full px-3 py-1 ${filter === id ? 'bg-[var(--pg-card)] font-semibold shadow-sm' : 'text-[var(--pg-body)]'}`}>{label}</button>
              ))}
            </div>
          </div>
          <div className="hidden grid-cols-[minmax(0,1.6fr)_90px_90px_80px_70px_24px] gap-3 px-4 py-2 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-[var(--pg-body)] sm:grid">
            <span>Agent</span><span>Status</span><span>7-day volume</span><span>Success</span><span>Cost</span><span />
          </div>
          <ul className="divide-y divide-[var(--pg-line-soft)]">
            {shown.map((row) => {
              const rate = successRate(row.runs);
              const stats = summarise(row.runs);
              return (
                <li key={row.key}>
                  <button type="button" onClick={() => openPath(row.path)} className="grid w-full cursor-pointer grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 px-4 py-3.5 text-left transition hover:bg-[var(--pg-alt)]/40 sm:grid-cols-[minmax(0,1.6fr)_90px_90px_80px_70px_24px]">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--pg-alt)]"><Bot className="h-4 w-4" aria-hidden="true" /></span>
                      <span className="min-w-0">
                        <span className="block truncate text-[14.5px] font-semibold">{row.name}</span>
                        <span className="block truncate text-[12.5px] text-[var(--pg-body)]">{row.sub}</span>
                      </span>
                    </span>
                    <span className="justify-self-end sm:justify-self-start"><Chip tone={row.status === 'live' ? 'accent' : 'neutral'}>{row.builtIn ? 'Built in' : row.status === 'live' ? 'Live' : row.status === 'paused' ? 'Paused' : 'Draft'}</Chip></span>
                    <span className="col-span-2 flex items-center gap-4 text-[13px] sm:contents">
                      <Spark runs={row.runs} label={`${row.name}: ${row.runs.length} runs in the last 7 days`} />
                      <span className={`font-semibold ${rate !== null && rate < 80 ? 'text-[#B42318]' : ''}`}>{rate === null ? '—' : `${rate}%`}<span className="ml-1 text-[12px] font-normal text-[var(--pg-body)] sm:hidden">success</span></span>
                      <span className="text-[var(--pg-body)]">{stats.runs ? formatCost(stats.costUsd) : '—'}</span>
                      <ChevronRight className="ml-auto hidden h-4 w-4 text-[var(--pg-body)] sm:block" aria-hidden="true" />
                    </span>
                  </button>
                </li>
              );
            })}
            {agents === null && <li className="px-4 py-6"><Loading /></li>}
            {agents !== null && shown.length === 0 && <li className="px-4 py-6 text-[14.5px] text-[var(--pg-body)]">Nothing here.</li>}
          </ul>
          <div className="border-t border-[var(--pg-line-soft)] px-4 py-3">
            <button type="button" onClick={() => openPath('/studio/agents/new')} className="inline-flex cursor-pointer items-center gap-2 text-[14px] font-medium text-[var(--pg-body)] hover:text-[var(--pg-ink)]"><Plus className="h-4 w-4" aria-hidden="true" /> New agent from a template</button>
          </div>
        </section>

        <aside aria-labelledby="needs-attention" className={`${CARD} self-start p-4`}>
          <h2 id="needs-attention" className="flex items-center gap-2 text-[17px] font-semibold"><span className="h-2 w-2 rounded-full bg-amber-600" /> Needs attention <span className="ml-auto text-[13px] font-normal text-[var(--pg-body)]">{attention?.length ?? ''}</span></h2>
          {attention === null ? (
            <div className="mt-3"><Loading /></div>
          ) : attention.length === 0 ? (
            <p className="mt-3 text-[14px] leading-[1.55] text-[var(--pg-body)]">Nothing needs you. Failing runs, failed tests, schedules that did not run and unreadable knowledge will show here.</p>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--pg-line-soft)]">
              {attention.map((item) => (
                <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                  <span className="rounded-[6px] bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-amber-900">{item.label}</span>
                  <p className="mt-1.5 text-[14px] font-medium leading-snug">{item.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-[var(--pg-body)]">{item.detail}</p>
                  <button type="button" onClick={() => openPath(item.action.path)} className="mt-1.5 cursor-pointer rounded-full border border-[var(--pg-line)] px-3 py-1 text-[12.5px] font-medium hover:bg-[var(--pg-alt)]">{item.action.label}</button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {current && <RunDetail run={current} onClose={() => setSelected(null)} />}

      <section aria-labelledby="all-activity">
        <h2 id="all-activity" className="mb-3 text-[18px] font-semibold">Recent activity</h2>
        {!runs ? (
          <Loading />
        ) : runs.length === 0 ? (
          <div className={`${CARD} p-6 text-[15px] text-[var(--pg-body)]`}>No runs yet. Open an agent and ask it something.</div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {runs.slice(0, 9).map((run) => (
              <li key={run.id}>
                <button type="button" onClick={() => setSelected(run.id === selected ? null : run.id)} className={`${CARD} flex h-full w-full cursor-pointer items-start gap-3 p-4 text-left transition hover:border-[var(--pg-line)] ${run.id === selected ? 'ring-2 ring-[var(--pg-ink)]' : ''}`}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--pg-alt)] text-[14px] font-semibold">{run.agent.replace(/^(preview|eval): /, '').charAt(0).toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-[var(--pg-body)]">{run.agent}{run.trigger === 'schedule' ? ' · scheduled' : ''}</span>
                    <span className="line-clamp-2 text-[14.5px] font-medium leading-snug">{run.input}</span>
                    <span className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-[var(--pg-body)]">
                      <StatusPill status={run.status} />
                      <span>{timeAgo(run.startedAt)}</span>
                      <span>·</span>
                      <span>{formatDuration(run.durationMs)}</span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
