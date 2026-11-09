import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronRight, Circle, Flag, Plus, TriangleAlert } from 'lucide-react';
import { Route } from '../../types';
import { FunnelSummary, myFunnels } from '../../lib/portal';
import {
  addAgent,
  BLUEPRINTS,
  blueprintOf,
  BlueprintId,
  FunnelAgent,
  LeadRow,
  myAgents,
  myLeads,
  removeAgent,
  saveSteps,
  STATUS_LABEL,
} from '../../lib/agents';
import { Button, CARD, Chip, EmptyState, LearnerLayout, Loading, Notice, PageContainer, PageTitle } from './lms-ui';

const DAY = 86_400_000;
const SEGMENT_NAME = { ready: 'Ready now', warming: 'Warming up', early: 'Early' } as const;
const SEGMENT_DOT = { ready: 'bg-emerald-600', warming: 'bg-amber-500', early: 'bg-sky-600', none: 'bg-[var(--pg-line)]' } as const;
const LABEL = 'font-label text-[11.5px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-body)]';

const within = (iso: string, days: number) => Date.now() - new Date(iso).getTime() <= days * DAY;
const clock = (iso: string) => {
  const date = new Date(iso);
  return Date.now() - date.getTime() < DAY ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString([], { day: 'numeric', month: 'short' });
};

/** Which enquiries an agent works on: its segment on a scorecard funnel, every enquiry otherwise. */
function leadsFor(agent: FunnelAgent, funnel: FunnelSummary | undefined, leads: LeadRow[]) {
  const mine = leads.filter((lead) => lead.jobId === agent.jobId);
  const segment = blueprintOf(agent.blueprint)?.segment;
  return segment && funnel?.scorecard ? mine.filter((lead) => lead.segment === segment) : mine;
}

function Tile({ label, value, sub, tone, className = '' }: { label: string; value: string | number; sub: string; tone?: 'good' | 'warn'; className?: string }) {
  return (
    <div className={`${CARD} flex min-w-0 flex-col gap-2 p-4 sm:gap-3 sm:p-5 ${className}`}>
      <p className={LABEL}>{label}</p>
      <p className="truncate font-editorial text-[32px] font-semibold leading-none tracking-[-0.02em] sm:text-[40px]">{value}</p>
      <p className={`text-[13px] leading-[1.4] sm:text-[14px] ${tone === 'good' ? 'text-emerald-700' : tone === 'warn' ? 'text-[#B42318]' : 'text-[var(--pg-body)]'}`}>{sub}</p>
    </div>
  );
}

function AddAgent({ funnels, agents, onClose, onAdded }: { funnels: FunnelSummary[]; agents: FunnelAgent[]; onClose: () => void; onAdded: (agent: FunnelAgent) => void }) {
  const [jobId, setJobId] = useState(funnels[0]?.id ?? '');
  const [busy, setBusy] = useState<BlueprintId | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const add = async (blueprint: BlueprintId) => {
    setBusy(blueprint);
    setError(null);
    try {
      onAdded(await addAgent(jobId, blueprint));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the agent.');
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:px-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Add an agent" className={`${CARD} max-h-[88vh] w-full max-w-[680px] overflow-y-auto rounded-b-none p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-h-[90vh] sm:rounded-b-[17px] sm:p-8`} onClick={(event) => event.stopPropagation()}>
        <span className="mx-auto mb-4 block h-1 w-10 rounded-full bg-[var(--pg-line)] sm:hidden" aria-hidden="true" />
        <h2 className="font-editorial text-[24px] font-semibold leading-[1.2]">Add an agent</h2>
        <p className="mt-1.5 text-[15px] text-[var(--pg-body)]">Each agent has one job. You set it up from your funnel&apos;s own brief.</p>
        {funnels.length > 1 && (
          <label className="mt-4 grid gap-1.5 text-[13.5px] font-medium">
            For which funnel?
            <select value={jobId} onChange={(event) => setJobId(event.target.value)} className="rounded-[10px] border border-[var(--pg-line)] bg-[var(--pg-card)] px-3 py-2.5 text-[15px]">
              {funnels.map((funnel) => <option key={funnel.id} value={funnel.id}>{funnel.label}</option>)}
            </select>
          </label>
        )}
        {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {BLUEPRINTS.map((blueprint) => {
            const has = agents.some((agent) => agent.jobId === jobId && agent.blueprint === blueprint.id);
            return (
              <li key={blueprint.id} className="flex flex-col gap-2 rounded-[14px] border border-[var(--pg-line-soft)] bg-[var(--pg-alt)]/40 p-4">
                <p className="font-semibold">{blueprint.name}</p>
                <p className="text-[14px] leading-[1.5] text-[var(--pg-body)]">{blueprint.job}</p>
                <div className="mt-auto pt-2">
                  <Button variant="ghost" className="w-full sm:w-auto" disabled={has || !jobId} busy={busy === blueprint.id} onClick={() => void add(blueprint.id)}>{has ? 'Already added' : 'Add'}</Button>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-5"><Button variant="ghost" className="w-full sm:w-auto" onClick={onClose}>Cancel</Button></div>
      </div>
    </div>
  );
}

function Chart({ leads, jobIds }: { leads: LeadRow[]; jobIds: Set<string> }) {
  const days = useMemo(() => {
    const out: { label: string; ready: number; warming: number; early: number; other: number }[] = [];
    for (let back = 13; back >= 0; back--) {
      const day = new Date(Date.now() - back * DAY);
      const key = day.toDateString();
      const rows = leads.filter((lead) => jobIds.has(lead.jobId) && new Date(lead.createdAt).toDateString() === key);
      out.push({
        label: day.toLocaleDateString([], { day: 'numeric', month: 'short' }),
        ready: rows.filter((lead) => lead.segment === 'ready').length,
        warming: rows.filter((lead) => lead.segment === 'warming').length,
        early: rows.filter((lead) => lead.segment === 'early').length,
        other: rows.filter((lead) => !lead.segment).length,
      });
    }
    return out;
  }, [leads, jobIds]);
  const max = Math.max(1, ...days.map((day) => day.ready + day.warming + day.early + day.other));
  const total = days.reduce((sum, day) => sum + day.ready + day.warming + day.early + day.other, 0);

  return (
    <section className={`${CARD} p-4 sm:p-5`} aria-label="Enquiries by segment">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={LABEL}>Enquiries by segment · 14 days</p>
        <ul className="flex flex-wrap gap-3 text-[12.5px] text-[var(--pg-body)]">
          {(['ready', 'warming', 'early'] as const).map((key) => (
            <li key={key} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${SEGMENT_DOT[key]}`} />{SEGMENT_NAME[key]}</li>
          ))}
        </ul>
      </div>
      <div className="mt-4 flex h-[150px] items-end gap-1.5" role="img" aria-label={`${total} enquiries in the last 14 days`}>
        {days.map((day) => {
          const sum = day.ready + day.warming + day.early + day.other;
          return (
            <div key={day.label} className="flex h-full flex-1 flex-col justify-end" title={`${day.label}: ${sum}`}>
              <div className="flex flex-col-reverse overflow-hidden rounded-[4px]" style={{ height: `${(sum / max) * 100}%` }}>
                {day.ready > 0 && <div className={SEGMENT_DOT.ready} style={{ flexGrow: day.ready }} />}
                {day.warming > 0 && <div className={SEGMENT_DOT.warming} style={{ flexGrow: day.warming }} />}
                {day.early > 0 && <div className={SEGMENT_DOT.early} style={{ flexGrow: day.early }} />}
                {day.other > 0 && <div className="bg-[var(--pg-line)]" style={{ flexGrow: day.other }} />}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[12px] text-[var(--pg-body)]">
        <span>{days[0].label}</span>
        <span>{days[days.length - 1].label}</span>
      </div>
      {total === 0 && <p className="mt-3 text-[14px] text-[var(--pg-body)]">Enquiries from your funnels appear here, sorted by how ready each person is.</p>}
    </section>
  );
}

/**
 * One agent as a short builder: a chip for each setup step, one step on screen at a time, and a final review
 * that reads like a launch checklist. The main action lives in a bar at the bottom of the screen on a phone.
 * Setup is tracked here; the agent sends nothing until the agent runtime is connected, and the review says so.
 */
function AgentDetail({ agent, funnel, leads, onChange, onRemoved, openPath }: { agent: FunnelAgent; funnel?: FunnelSummary; leads: LeadRow[]; onChange: (agent: FunnelAgent) => void; onRemoved: () => void; openPath: (path: string) => void }) {
  const blueprint = blueprintOf(agent.blueprint)!;
  const steps = blueprint.steps;
  const reviewIndex = steps.length;
  const firstOpen = steps.findIndex((step) => !agent.stepsDone.includes(step.id));
  const [current, setCurrent] = useState(firstOpen === -1 ? reviewIndex : firstOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mine = leadsFor(agent, funnel, leads);
  const doneCount = agent.stepsDone.length;
  const left = steps.length - doneCount;
  const allDone = left === 0;
  const onReview = current === reviewIndex;
  const step = onReview ? null : steps[current];
  const stepDone = step ? agent.stepsDone.includes(step.id) : false;

  const save = async (stepId: string, done: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const next = done ? [...agent.stepsDone.filter((id) => id !== stepId), stepId] : agent.stepsDone.filter((id) => id !== stepId);
      onChange(await saveSteps(agent, next));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const go = (index: number) => {
    setCurrent(index);
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const primary = async () => {
    if (onReview) {
      if (!allDone) go(steps.findIndex((item) => !agent.stepsDone.includes(item.id)));
      return;
    }
    if (!stepDone && !(await save(step!.id, true))) return;
    go(current + 1);
  };

  const remove = async () => {
    if (!window.confirm(`Remove the ${blueprint.name} from ${funnel?.label ?? 'this funnel'}?`)) return;
    try {
      await removeAgent(agent.id);
      onRemoved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove it.');
    }
  };

  const nextLabel = current + 1 < reviewIndex ? steps[current + 1].title : 'review';
  const barText = onReview
    ? allDone
      ? 'Setup is complete. The agent sends nothing until the agent runtime is connected.'
      : `${left} step${left === 1 ? '' : 's'} left before this agent is ready.`
    : `Step ${current + 1} of ${steps.length} · ${doneCount} of ${steps.length} done`;

  return (
    <>
      <button onClick={() => openPath('/agents')} className="mb-3 inline-flex items-center gap-1.5 text-[14px] text-[var(--pg-body)] hover:text-[var(--pg-ink)] cursor-pointer">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Agents
      </button>

      {/* One chip per step, then the review. Scrolls sideways on a phone. */}
      <nav aria-label="Setup steps" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
        {[...steps.map((item) => item.title), 'Review'].map((label, index) => {
          const isReview = index === reviewIndex;
          const done = isReview ? allDone : agent.stepsDone.includes(steps[index].id);
          const active = index === current;
          return (
            <button
              key={label}
              onClick={() => go(index)}
              aria-current={active ? 'step' : undefined}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5 text-[13.5px] font-medium transition-colors cursor-pointer ${active ? 'border-[var(--pg-ink)] bg-[var(--pg-ink)] text-[var(--pg-bg)]' : 'border-[var(--pg-line-soft)] bg-[var(--pg-card)] text-[var(--pg-body)] hover:text-[var(--pg-ink)]'}`}
            >
              <span className={`flex h-[22px] w-[22px] items-center justify-center rounded-full text-[11.5px] font-semibold ${done ? 'bg-emerald-600 text-white' : active ? 'bg-[var(--pg-bg)] text-[var(--pg-ink)]' : 'bg-[var(--pg-alt)]'}`}>
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" /> : isReview ? <Flag className="h-3 w-3" aria-hidden="true" /> : index + 1}
              </span>
              <span className="max-w-[150px] truncate">{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-6 max-w-[760px]">
        <p className="text-[14px] text-[var(--pg-body)]">{blueprint.name}{funnel ? ` · ${funnel.label}` : ''}</p>

        {step ? (
          <>
            <h1 className="mt-1 font-editorial text-[30px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[36px]">{step.title}</h1>
            <p className="mt-3 text-[16px] leading-[1.6] text-[var(--pg-body)]">{step.body}</p>

            <button
              onClick={() => void save(step.id, !stepDone)}
              disabled={busy}
              aria-pressed={stepDone}
              className={`mt-6 flex min-h-[64px] w-full items-center gap-3 rounded-[14px] border p-4 text-left transition-colors active:scale-[0.99] cursor-pointer ${stepDone ? 'border-emerald-600/40 bg-emerald-50' : 'border-[var(--pg-line)] bg-[var(--pg-card)] hover:bg-[var(--pg-alt)]/40'}`}
            >
              {stepDone ? <Check className="h-6 w-6 shrink-0 text-emerald-700" aria-hidden="true" /> : <Circle className="h-6 w-6 shrink-0 text-[var(--pg-body)]" aria-hidden="true" />}
              <span>
                <span className="block font-semibold">{stepDone ? 'Done' : 'Mark this step as done'}</span>
                <span className="block text-[13.5px] text-[var(--pg-body)]">{stepDone ? 'Tap to undo.' : 'Tick it once you have done what it asks.'}</span>
              </span>
            </button>

            <dl className="mt-6 grid grid-cols-2 gap-3">
              <div className={`${CARD} p-4`}>
                <dt className={LABEL}>Works on</dt>
                <dd className="mt-1.5 font-semibold">{blueprint.segment && funnel?.scorecard ? SEGMENT_NAME[blueprint.segment] : 'All enquiries'}</dd>
              </div>
              <div className={`${CARD} p-4`}>
                <dt className={LABEL}>Enquiries</dt>
                <dd className="mt-1.5 font-semibold">{mine.length} in total</dd>
              </div>
            </dl>
          </>
        ) : (
          <>
            <h1 className="mt-1 font-editorial text-[30px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[36px]">{allDone ? 'Ready to go live?' : 'Almost there.'}</h1>
            <p className="mt-3 text-[16px] leading-[1.6] text-[var(--pg-body)]">Everything that must be true before this agent can reply to a customer.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className={`rounded-[10px] border px-3 py-1.5 text-[13.5px] font-medium ${left ? 'border-red-200 bg-red-50 text-[#B42318]' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{left ? `${left} blocker${left === 1 ? '' : 's'}` : 'No blockers'}</span>
              <span className="rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-1.5 text-[13.5px] font-medium text-amber-800">1 warning</span>
            </div>

            <section className={`${CARD} mt-5 overflow-hidden`} aria-label="Readiness checklist">
              <div className="flex items-center justify-between border-b border-[var(--pg-line-soft)] px-4 py-3">
                <h2 className="font-semibold">Readiness checklist</h2>
                <Chip tone={agent.status === 'ready' ? 'accent' : 'neutral'}>{STATUS_LABEL[agent.status]}</Chip>
              </div>
              <ul className="divide-y divide-[var(--pg-line-soft)]">
                {steps.map((item, index) => {
                  const done = agent.stepsDone.includes(item.id);
                  return (
                    <li key={item.id} className="flex items-center gap-3 px-4 py-3.5">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${done ? 'bg-emerald-100 text-emerald-700' : 'bg-red-50 text-[#B42318]'}`}>
                        {done ? <Check className="h-4 w-4" aria-hidden="true" /> : <TriangleAlert className="h-4 w-4" aria-hidden="true" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`font-medium leading-tight ${done ? '' : 'text-[#B42318]'}`}>{item.title}</p>
                        <p className="mt-0.5 text-[13px] leading-[1.4] text-[var(--pg-body)]">{done ? 'Done' : 'Not done yet. This blocks going live.'}</p>
                      </div>
                      <button onClick={() => go(index)} className="shrink-0 rounded-[9px] border border-[var(--pg-line)] px-3 py-1.5 text-[13px] font-medium hover:bg-[var(--pg-alt)] cursor-pointer">{done ? 'View' : 'Do it'}</button>
                    </li>
                  );
                })}
                <li className="flex items-center gap-3 bg-amber-50/60 px-4 py-3.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700"><TriangleAlert className="h-4 w-4" aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-tight text-amber-900">Agent runtime not connected</p>
                    <p className="mt-0.5 text-[13px] leading-[1.4] text-amber-800">Until it is, this agent sends nothing. Live replies start once the runtime is connected under Integrations.</p>
                  </div>
                  <button onClick={() => openPath('/integrations')} className="shrink-0 rounded-[9px] border border-amber-300 px-3 py-1.5 text-[13px] font-medium text-amber-900 hover:bg-amber-100 cursor-pointer">Open</button>
                </li>
              </ul>
            </section>

            <div className="mt-5 flex flex-wrap gap-2">
              {funnel && <Button variant="ghost" onClick={() => openPath(`/funnel/${funnel.token}`)}>Open the funnel</Button>}
              <Button variant="ghost" onClick={() => void remove()}>Remove agent</Button>
            </div>
          </>
        )}

        {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
      </div>

      {/* The main action stays at the bottom of the screen on a phone. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--pg-line-soft)] bg-[var(--pg-card)] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 lg:static lg:mt-8 lg:max-w-[760px] lg:border-0 lg:bg-transparent lg:p-0">
        <p className="mb-2 text-[13px] leading-[1.4] text-[var(--pg-body)] lg:mb-3">{barText}</p>
        <div className="flex gap-2">
          {current > 0 && (
            <Button variant="ghost" className="shrink-0" onClick={() => go(current - 1)}><ArrowLeft className="h-4 w-4" aria-hidden="true" /><span className="sr-only">Back</span></Button>
          )}
          <Button className="flex-1 lg:flex-none lg:px-8" busy={busy} disabled={onReview && allDone} onClick={() => void primary()}>
            {onReview ? (allDone ? 'Waiting for the agent runtime' : 'Go to the next open step') : stepDone ? `Continue to ${nextLabel}` : `Done, continue to ${nextLabel}`}
            {!(onReview && allDone) && <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />}
          </Button>
        </div>
      </div>
    </>
  );
}

/**
 * The member's agents at /agents: an overview of how their funnels are doing and which agents work on them, and
 * /agents/<id> for one agent's setup steps. An agent is built from a blueprint; today the page tracks setup and
 * shows real enquiry numbers, and does not claim to send anything.
 */
export default function AgentsPage({ onNavigate, openPath, id }: { onNavigate: (route: Route) => void; openPath: (path: string) => void; id?: string }) {
  const [funnels, setFunnels] = useState<FunnelSummary[] | null>(null);
  const [agents, setAgents] = useState<FunnelAgent[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    myFunnels()
      .then(async (f) => {
        const ids = f.map((funnel) => funnel.id);
        const [a, l] = await Promise.all([
          myAgents(ids).catch((err) => {
            setError(err instanceof Error ? err.message : 'Could not load your agents.');
            return [] as FunnelAgent[];
          }),
          myLeads(ids),
        ]);
        setFunnels(f);
        setAgents(a);
        setLeads(l);
      })
      .catch(() => setFunnels([]));
  }, []);

  const funnelOf = (jobId: string) => funnels?.find((funnel) => funnel.id === jobId);
  const mineIds = useMemo(() => new Set((funnels ?? []).map((funnel) => funnel.id)), [funnels]);
  const week = leads.filter((lead) => within(lead.createdAt, 7));
  const month = leads.filter((lead) => within(lead.createdAt, 30));
  const scored = month.filter((lead) => lead.segment);
  const attention = leads.filter((lead) => lead.status === 'pending' || lead.status === 'failed').length;
  const settingUp = agents.filter((agent) => agent.status !== 'ready').length;
  const needsAttention = (funnels ?? [])
    .map((funnel) => ({ funnel, count: leads.filter((lead) => lead.jobId === funnel.id && (lead.status === 'pending' || lead.status === 'failed')).length }))
    .filter((item) => item.count > 0);

  const events = useMemo(() => {
    const fromLeads = leads.slice(0, 8).map((lead) => ({
      at: lead.createdAt,
      dot: lead.status === 'failed' ? 'bg-red-600' : SEGMENT_DOT[lead.segment ?? 'none'],
      title: lead.segment ? `${SEGMENT_NAME[lead.segment]}: ${lead.name} scored ${lead.score}%` : `New enquiry from ${lead.name}`,
      sub: `${funnelOf(lead.jobId)?.label ?? 'Funnel'} · ${lead.status === 'sent' ? 'delivered' : lead.status === 'emailed' ? 'emailed to you' : lead.status === 'pending' ? 'waiting to deliver' : 'could not deliver'}`,
    }));
    const fromAgents = agents.slice(0, 4).map((agent) => ({
      at: agent.updatedAt,
      dot: 'bg-[var(--pg-accent)]',
      title: `${blueprintOf(agent.blueprint)?.name ?? 'Agent'} ${agent.status === 'ready' ? 'is ready' : agent.status === 'testing' ? 'is being set up' : 'added'}`,
      sub: `${funnelOf(agent.jobId)?.label ?? 'Funnel'} · ${agent.stepsDone.length} of ${blueprintOf(agent.blueprint)?.steps.length ?? 0} steps`,
    }));
    return [...fromLeads, ...fromAgents].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, agents, funnels]);

  const agent = id ? agents.find((item) => item.id === id) : undefined;

  return (
    <LearnerLayout active="agents" onNavigate={onNavigate}>
      <PageContainer>
        {funnels === null ? (
          <Loading label="Opening your agents…" />
        ) : agent ? (
          <AgentDetail
            agent={agent}
            funnel={funnelOf(agent.jobId)}
            leads={leads}
            openPath={openPath}
            onChange={(next) => setAgents((list) => list.map((item) => (item.id === next.id ? next : item)))}
            onRemoved={() => {
              setAgents((list) => list.filter((item) => item.id !== agent.id));
              openPath('/agents');
            }}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <PageTitle>Agents</PageTitle>
                <p className="mt-2 max-w-[640px] text-[15px] leading-[1.55] text-[var(--pg-body)] sm:text-[16px] sm:leading-[1.6]">
                  Each agent has one job on your funnel: following up with the people who enquire, or helping you see what to change. Here you design it from your funnel&apos;s own brief: how it speaks, what it asks, and when it hands over to you. Agents send nothing yet; live replies start when the agent runtime is connected.
                </p>
              </div>
              {funnels.length > 0 && <Button className="w-full sm:w-auto" onClick={() => setAdding(true)}><Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Add agent</Button>}
            </div>

            {error && <div className="mt-6"><Notice tone="error">{error}. If this is new, the agents table may not be set up yet.</Notice></div>}

            {funnels.length === 0 ? (
              <div className="mt-8">
                <EmptyState title="Build a funnel first" body="Agents work on a funnel. Reserve a Launchpad build spot and your funnel brief appears here." action={<Button onClick={() => openPath('/launchpad/apply')}>Reserve your build spot</Button>} />
              </div>
            ) : (
              <>
                <div className="mt-6 grid grid-cols-2 gap-3 sm:mt-8 sm:gap-4 xl:grid-cols-4">
                  <Tile label="Agents" value={agents.length} sub={agents.length ? `${new Set(agents.map((a) => a.jobId)).size} funnel${new Set(agents.map((a) => a.jobId)).size === 1 ? '' : 's'} · ${settingUp} still setting up` : 'None added yet'} />
                  <Tile label="Enquiries · 7 days" value={week.length} sub={`${week.filter((lead) => lead.segment).length} scored by a scorecard`} />
                  <Tile label="Ready now · 30 days" value={scored.filter((lead) => lead.segment === 'ready').length} sub={`of ${scored.length} scored`} tone={scored.some((lead) => lead.segment === 'ready') ? 'good' : undefined} />
                  <Tile label="Needs attention" value={attention} sub={attention ? 'enquiries waiting to deliver' : 'every enquiry delivered'} tone={attention ? 'warn' : undefined} />
                </div>

                {needsAttention.length > 0 && (
                  <section className="mt-6" aria-label="Needs attention">
                    <div className="flex items-baseline justify-between">
                      <h2 className="font-editorial text-[20px] font-semibold tracking-[-0.01em]">Needs attention</h2>
                      <p className="text-[13.5px] text-[var(--pg-body)]">{attention} open</p>
                    </div>
                    <ul className="-mx-4 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3 [&::-webkit-scrollbar]:hidden">
                      {needsAttention.map(({ funnel, count }) => (
                        <li key={funnel.id} className={`${CARD} flex w-[78%] shrink-0 snap-start flex-col gap-3 p-4 sm:w-auto`}>
                          <span className="w-fit rounded-md bg-[#FEF3F2] px-2 py-0.5 font-label text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#B42318]">Delivery</span>
                          <p className="font-medium leading-[1.4]">{count} {count === 1 ? 'enquiry is' : 'enquiries are'} waiting to deliver from {funnel.label}</p>
                          <Button variant="ghost" className="mt-auto w-fit" onClick={() => openPath('/enquiries')}>Open enquiries</Button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <section className={`${CARD} p-4 sm:p-5`} aria-label="Recent activity">
                    <p className={LABEL}>Recent activity</p>
                    {events.length === 0 ? (
                      <p className="mt-4 text-[14.5px] text-[var(--pg-body)]">Nothing yet. New enquiries and agent changes show up here.</p>
                    ) : (
                      <ul className="mt-3 divide-y divide-[var(--pg-line-soft)]">
                        {events.map((event, index) => (
                          <li key={`${event.at}-${index}`} className="flex items-start gap-3 py-3">
                            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${event.dot}`} aria-hidden="true" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">{event.title}</p>
                              <p className="truncate text-[13.5px] text-[var(--pg-body)]">{event.sub}</p>
                            </div>
                            <time className="shrink-0 text-[13px] text-[var(--pg-body)]" dateTime={event.at}>{clock(event.at)}</time>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                  <Chart leads={leads} jobIds={mineIds} />
                </div>

                <section className={`${CARD} mt-4 p-4 sm:p-5`} aria-label="Your agents">
                  <div className="flex items-center justify-between gap-3">
                    <p className={LABEL}>Your agents</p>
                    <p className="text-[13px] text-[var(--pg-body)]">{agents.length} total</p>
                  </div>
                  {agents.length === 0 ? (
                    <div className="mt-4">
                      <p className="max-w-[620px] text-[15.5px] leading-[1.6] text-[var(--pg-body)]">
                        Start with the Qualifier: the agent that will reply first to the people who are ready to buy.
                      </p>
                      <div className="mt-4"><Button onClick={() => setAdding(true)}>Add your first agent</Button></div>
                    </div>
                  ) : (
                    <>
                    {/* Phones get a card per agent; the table needs room for its columns. */}
                    <ul className="mt-2 divide-y divide-[var(--pg-line-soft)] md:hidden">
                      {agents.map((row) => {
                        const funnel = funnelOf(row.jobId);
                        const blueprint = blueprintOf(row.blueprint);
                        const count = leadsFor(row, funnel, leads).filter((lead) => within(lead.createdAt, 30)).length;
                        return (
                          <li key={row.id}>
                            <button onClick={() => openPath(`/agents/${row.id}`)} className="flex min-h-[64px] w-full items-center gap-3 py-3 text-left cursor-pointer">
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-semibold">{blueprint?.name}</p>
                                <p className="truncate text-[13.5px] text-[var(--pg-body)]">{funnel?.label ?? '—'} · {blueprint?.segment && funnel?.scorecard ? SEGMENT_NAME[blueprint.segment] : 'All enquiries'}</p>
                              </div>
                              <div className="flex shrink-0 flex-col items-end gap-1">
                                <Chip tone={row.status === 'ready' ? 'accent' : 'neutral'}>{STATUS_LABEL[row.status]}</Chip>
                                <span className="text-[12.5px] text-[var(--pg-body)]">{count} in 30 days</span>
                              </div>
                              <ChevronRight className="h-4 w-4 shrink-0 text-[var(--pg-body)]" aria-hidden="true" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="mt-3 hidden overflow-x-auto md:block">
                      <table className="w-full min-w-[640px] border-collapse text-left text-[14.5px]">
                        <thead>
                          <tr className={LABEL}>
                            <th className="py-2 pr-3 font-semibold">Agent</th>
                            <th className="py-2 pr-3 font-semibold">Funnel</th>
                            <th className="py-2 pr-3 font-semibold">Works on</th>
                            <th className="py-2 pr-3 font-semibold">Enquiries · 30d</th>
                            <th className="py-2 pr-3 font-semibold">Status</th>
                            <th className="py-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {agents.map((row) => {
                            const funnel = funnelOf(row.jobId);
                            const blueprint = blueprintOf(row.blueprint);
                            const count = leadsFor(row, funnel, leads).filter((lead) => within(lead.createdAt, 30)).length;
                            return (
                              <tr key={row.id} className="cursor-pointer border-t border-[var(--pg-line-soft)] hover:bg-[var(--pg-alt)]/40" onClick={() => openPath(`/agents/${row.id}`)}>
                                <td className="py-3 pr-3 font-medium">{blueprint?.name}</td>
                                <td className="py-3 pr-3">{funnel?.label ?? '—'}</td>
                                <td className="py-3 pr-3 text-[var(--pg-body)]">{blueprint?.segment && funnel?.scorecard ? SEGMENT_NAME[blueprint.segment] : 'All enquiries'}</td>
                                <td className="py-3 pr-3">{count}</td>
                                <td className="py-3 pr-3"><Chip tone={row.status === 'ready' ? 'accent' : 'neutral'}>{STATUS_LABEL[row.status]}</Chip></td>
                                <td className="py-3 text-right"><ChevronRight className="inline h-4 w-4 text-[var(--pg-body)]" aria-label="Open" /></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    </>
                  )}
                </section>

              </>
            )}
          </>
        )}
      </PageContainer>
      {adding && funnels && (
        <AddAgent
          funnels={funnels}
          agents={agents}
          onClose={() => setAdding(false)}
          onAdded={(added) => {
            setAgents((list) => [added, ...list]);
            setAdding(false);
            openPath(`/agents/${added.id}`);
          }}
        />
      )}
    </LearnerLayout>
  );
}
