import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowUp, Database, Globe, Search, Server, Wrench } from 'lucide-react';
import { errorMessage } from '../../lib/lms';
import {
  AgentRun,
  PlatformStatus,
  formatCost,
  formatDuration,
  formatTokens,
  loadPlatformStatus,
  loadRuns,
  startRun,
  summarise,
  timeAgo,
} from '../../lib/agent-runs';
import { Chip, CARD, Loading, Notice } from './lms-ui';
import { RunDetail, StatusPill, Tile } from './RunParts';
import AgentBuilder from './AgentBuilder';
import AgentDetail from './AgentDetail';
import AgentsOverview from './AgentsOverview';
import SchedulesPanel from './SchedulesPanel';

/**
 * Studio: the agent platform. Ask the Ops agent something, see what every run did (each tool call, what it cost),
 * and what the agents are allowed to touch. The runs are rows in breadmaker.agent_runs, written by agent-platform/.
 */

const FALLBACK_SUGGESTIONS = ['Is everything running?', 'Why might a funnel site not be live?', 'Did the last push deploy?', 'Where does breadmakersystems.com point?'];

const SYSTEM_ICON: Record<string, typeof Server> = { Coolify: Server, Web: Globe, DNS: Search, Supabase: Database };

/**
 * /studio/agents is the overview; /studio/agents/new and /studio/agents/<id>/edit open the builder; /studio/agents/<id> is one agent.
 * `editing` carries whatever follows /runs/.
 */
export default function AgentRunsSection({ editing, openPath }: { editing: string | null; openPath: (path: string) => void }) {
  // The pages used to live under /studio/runs; rewrite an old link in the address bar so it can be shared as /studio/agents.
  useEffect(() => {
    if (window.location.pathname.startsWith('/studio/runs')) window.history.replaceState(null, '', window.location.pathname.replace('/studio/runs', '/studio/agents') + window.location.search);
  }, []);
  const [id, sub] = (editing ?? '').split('/');
  if (id === 'new') return <AgentBuilder key="new" agentId="new" openPath={openPath} />;
  if (id && sub === 'edit') return <AgentBuilder key={id} agentId={id} openPath={openPath} />;
  if (id === 'ops') return <OpsPage key="ops" openPath={openPath} />;
  if (id) return <AgentDetail key={id} agentId={id} openPath={openPath} />;
  return <AgentsOverview openPath={openPath} />;
}

function OpsPage({ openPath }: { openPath: (path: string) => void }) {
  const [runs, setRuns] = useState<AgentRun[] | null>(null);
  const [platform, setPlatform] = useState<PlatformStatus | null>(null);
  const [platformError, setPlatformError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      // Only the built-in agent's own runs; other agents have their own pages.
      setRuns((await loadRuns(200)).filter((run) => run.agent === 'ops'));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
      setRuns((current) => current ?? []);
    }
  }, []);


  useEffect(() => {
    void refresh();
    loadPlatformStatus()
      .then(setPlatform)
      .catch((err) => setPlatformError(errorMessage(err)));
  }, [refresh]);

  // While anything is still working, look again every few seconds.
  const working = runs?.some((run) => run.status === 'running') ?? false;
  useEffect(() => {
    if (!working) return;
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [working, refresh]);

  const ask = async (question: string) => {
    const value = question.trim();
    if (!value || sending) return;
    setSending(true);
    setError(null);
    try {
      const id = await startRun(value);
      setText('');
      setSelected(id);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const metrics = useMemo(() => summarise(runs ?? []), [runs]);
  const current = runs?.find((run) => run.id === selected) ?? null;
  const suggestions = platform?.agents[0]?.suggestions ?? FALLBACK_SUGGESTIONS;
  const missing = platform
    ? ([['anthropic', 'a model key'], ['supabase', 'database access'], ['coolify', 'Coolify access']] as const).filter(([key]) => !platform[key]).map(([, label]) => label)
    : [];
  const peak = Math.max(1, ...metrics.perDay.map((day) => day.runs));

  return (
    <div className="space-y-8">
      <div>
        <button type="button" onClick={() => openPath('/studio/agents')} className="mb-3 inline-flex cursor-pointer items-center gap-1.5 text-[14px] text-[var(--pg-body)] hover:text-[var(--pg-ink)]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Agents
        </button>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="font-editorial text-[30px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[34px]">Ops</h1>
          <Chip>Built in</Chip>
        </div>
        <p className="mt-2 max-w-[640px] text-[15.5px] leading-[1.6] text-[var(--pg-body)]">
          Checks servers, deployments, sites, domains and funnel builds. It can look, and it can ask for a restart or redeploy, which waits for a person to approve it.
        </p>
      </div>

      {platformError && <Notice tone="error">The agent platform is not reachable ({platformError}). Runs already recorded are still listed below.</Notice>}
      {platform?.paused && <Notice tone="error">Agents are paused. New runs are refused until the kill switch is turned off.</Notice>}
      {missing.length > 0 && <Notice tone="info">The agent platform still needs {missing.join(', ')} before Ops can answer. Add them in its Coolify settings.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      <div className={`${CARD} mx-auto max-w-[760px] p-3 sm:p-4`}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void ask(text);
          }}
        >
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void ask(text);
              }
            }}
            maxLength={2000}
            rows={2}
            placeholder="Ask about the platform, a site, a domain or a funnel build"
            aria-label="Ask Ops"
            className="w-full resize-none bg-transparent px-2 py-1.5 text-[15.5px] leading-[1.5] outline-none placeholder:text-[var(--pg-body)]/70"
          />
          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="px-2 text-[12.5px] text-[var(--pg-body)]">Ops · looks, asks before changing · {platform ? platform.model.replace('anthropic/', '') : '…'}</span>
            <button
              type="submit"
              disabled={!text.trim() || sending}
              aria-label="Send"
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-[var(--pg-ink)] text-[var(--pg-bg)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </form>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => void ask(suggestion)}
            disabled={sending}
            className="cursor-pointer rounded-full border border-[var(--pg-line)] px-3.5 py-1.5 text-[13.5px] text-[var(--pg-body)] transition hover:bg-[var(--pg-alt)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {suggestion}
          </button>
        ))}
      </div>

      {current && <RunDetail run={current} onClose={() => setSelected(null)} />}

      <SchedulesPanel agentId="ops" suggestion="Is everything running? Tell me anything that is not healthy, and check that https://breadmakersystems.com responds." openRun={setSelected} />

      <section aria-labelledby="runs-recent">
        <h2 id="runs-recent" className="mb-3 text-[18px] font-semibold">Recent activity</h2>
        {!runs ? (
          <Loading />
        ) : runs.length === 0 ? (
          <div className={`${CARD} p-6 text-[15px] text-[var(--pg-body)]`}>No runs yet. Ask Ops something above and it will show here with everything it checked.</div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {runs.slice(0, 12).map((run) => (
              <li key={run.id}>
                <button
                  type="button"
                  onClick={() => setSelected(run.id === selected ? null : run.id)}
                  className={`${CARD} flex h-full w-full cursor-pointer items-start gap-3 p-4 text-left transition hover:border-[var(--pg-line)] ${run.id === selected ? 'ring-2 ring-[var(--pg-ink)]' : ''}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--pg-alt)] text-[14px] font-semibold">{run.agent.charAt(0).toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
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

      <section aria-labelledby="runs-metrics">
        <h2 id="runs-metrics" className="mb-3 text-[18px] font-semibold">Last 7 days</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Tile label="Runs" value={String(metrics.runs)} note={metrics.failed ? `${metrics.failed} failed` : 'none failed'} />
          <Tile label="Typical time" value={formatDuration(metrics.avgMs)} note={metrics.p95Ms != null ? `slowest 5%: ${formatDuration(metrics.p95Ms)}` : undefined} />
          <Tile label="Tokens" value={formatTokens(metrics.tokens)} />
          <Tile label="Est. cost" value={formatCost(metrics.costUsd)} note={platform ? `cap $${platform.maxDailyUsd} a day` : undefined} />
          <div className={`${CARD} col-span-2 p-4 lg:col-span-1`}>
            <div className="text-[12.5px] font-medium text-[var(--pg-body)]">Runs per day</div>
            <div className="mt-2 flex h-[52px] items-end gap-1.5" role="img" aria-label={`Runs per day: ${metrics.perDay.map((d) => `${d.day} ${d.runs}`).join(', ')}`}>
              {metrics.perDay.map((day) => (
                <div key={day.day} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${day.day}: ${day.runs} run${day.runs === 1 ? '' : 's'}${day.failed ? `, ${day.failed} failed` : ''}`}>
                  <div className={`w-full rounded-t-[4px] ${day.failed ? 'bg-[#B42318]' : 'bg-[var(--pg-ink)]'}`} style={{ height: `${Math.max(day.runs ? 6 : 2, (day.runs / peak) * 40)}px`, opacity: day.runs ? 1 : 0.2 }} />
                  <span className="text-[10px] text-[var(--pg-body)]">{day.day.slice(0, 1)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        {metrics.byTool.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {metrics.byTool.map((tool) => (
              <Chip key={tool.name}>
                {tool.name} · {tool.calls}
                {tool.errors ? ` (${tool.errors} failed)` : ''}
              </Chip>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="runs-tools">
        <h2 id="runs-tools" className="mb-1 text-[18px] font-semibold">What Ops can touch</h2>
        <p className="mb-3 text-[14.5px] text-[var(--pg-body)]">Most tools only look. A tool marked needs approval can only file a request: nothing changes until an owner or coach approves it above.</p>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(platform?.tools ?? []).map((tool) => {
            const Icon = SYSTEM_ICON[tool.system] ?? Wrench;
            const connected = tool.system === 'Coolify' ? platform?.coolify : tool.system === 'Supabase' ? platform?.supabase : true;
            return (
              <li key={tool.id} className={`${CARD} flex flex-col gap-3 p-4`}>
                <div className="flex items-center justify-between">
                  <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--pg-alt)]"><Icon className="h-4.5 w-4.5" /></span>
                  <Chip tone={connected ? 'accent' : 'neutral'}>{connected ? 'Connected' : 'Not connected'}</Chip>
                </div>
                <div>
                  <div className="font-mono text-[13px] font-semibold">{tool.id}</div>
                  <div className="mt-1 text-[13.5px] leading-snug text-[var(--pg-body)]">{tool.summary}</div>
                </div>
                <div className="mt-auto text-[12px] text-[var(--pg-body)]">{tool.system} · {tool.risk === 'read' ? 'read only' : tool.risk === 'write' ? 'needs approval' : tool.risk}</div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
