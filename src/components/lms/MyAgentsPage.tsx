import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight, Plus, Trash2, X } from 'lucide-react';
import { Route } from '../../types';
import { errorMessage } from '../../lib/lms';
import { AgentDefinition, MODEL_CHOICES, StoredAgent, canBuildAgents, deleteAgent, listMyAgents, saveMyAgent } from '../../lib/agent-defs';
import { loadPlatformStatus, mySpendThisMonth, timeAgo } from '../../lib/agent-runs';
import { Preview } from './AgentBuilder';
import KnowledgePanel from './KnowledgePanel';
import { Button, CARD, EmptyState, Field, LearnerLayout, Loading, Notice, PageContainer, PageTitle, ProgressBar, TextArea, TextInput } from './lms-ui';

const MAX_AGENTS = 5;
const INSTRUCTION_LIMIT = 4000;
/** A member's agent has no tools, so these are the two models it may use. */
const MODELS = MODEL_CHOICES.filter((model) => !model.id.includes('opus'));

interface Starter {
  id: string;
  name: string;
  summary: string;
  definition: Pick<AgentDefinition, 'name' | 'instructions' | 'rules' | 'model'>;
}

const STARTERS: Starter[] = [
  {
    id: 'writer',
    name: 'Writing partner',
    summary: 'Drafts and tightens your messages, posts and emails in your voice.',
    definition: {
      name: 'Writing partner',
      model: 'anthropic/claude-sonnet-5-5',
      instructions: 'You help me write. When I paste a draft, improve it without changing what I mean: shorter sentences, plain words, one clear ask. When I describe what I want, write a first draft in my voice. Keep what you write ready to send, with no commentary around it unless I ask for your reasoning.',
      rules: ['Never invent facts, numbers or quotes about me or my business.', 'Ask one question if something important is missing, then write.'],
    },
  },
  {
    id: 'offer',
    name: 'Offer sharpener',
    summary: 'Pushes on your offer: who it is for, the promise, the price, what is unclear.',
    definition: {
      name: 'Offer sharpener',
      model: 'anthropic/claude-sonnet-5-5',
      instructions: 'You pressure-test my offer like a friendly, direct advisor. When I describe an offer, say who it seems to be for, what the promise is, what is unclear or unproven, and the single change most likely to make it easier to say yes to. Then ask me the one question I should answer next. If I have added documents about my offer, use them and name which one you used.',
      rules: ['Be specific. Never praise without saying why.', 'Never guess prices, results or customer numbers I have not told you.'],
    },
  },
  {
    id: 'blank',
    name: 'Start from blank',
    summary: 'Write your own instructions.',
    definition: { name: 'My agent', model: 'anthropic/claude-sonnet-5-5', instructions: '', rules: [] },
  },
];

const fromStarter = (starter: Starter): AgentDefinition => ({
  ...starter.definition,
  publicName: '',
  openingMessage: '',
  purpose: '',
  template: `member-${starter.id}`,
  tools: [],
});

interface Props {
  onNavigate: (route: Route) => void;
  openPath: (path: string) => void;
  /** 'new', an agent id, or nothing for the list. */
  id?: string;
}

/** Prestige Partners build a few agents of their own: instructions, rules and their own documents. No tools, no connections. */
export default function MyAgentsPage({ onNavigate, openPath, id }: Props) {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [agents, setAgents] = useState<StoredAgent[]>([]);
  const [spent, setSpent] = useState(0);
  const [limit, setLimit] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const ok = await canBuildAgents();
      setAllowed(ok);
      if (!ok) return;
      const [mine, used, platform] = await Promise.all([listMyAgents(), mySpendThisMonth().catch(() => 0), loadPlatformStatus().catch(() => null)]);
      setAgents(mine);
      setSpent(used);
      setLimit(platform?.memberMonthlyUsd ?? null);
    } catch (err) {
      setError(errorMessage(err));
      setAllowed(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const editing = id === 'new' ? null : agents.find((agent) => agent.id === id);

  return (
    <LearnerLayout active="agents" onNavigate={onNavigate}>
      <PageContainer>
        {allowed === null ? (
          <Loading label="Opening your agents…" />
        ) : !allowed ? (
          <>
            {error && <Notice tone="error">{error}</Notice>}
            <EmptyState
              title="Your own agents are part of Prestige Partner"
              body="Prestige Partners can build agents of their own: write what the agent does, give it your own documents, and talk to it. Everything is capped each month so it never surprises you."
              action={<Button onClick={() => openPath('/membership')}>See Prestige Partner</Button>}
            />
          </>
        ) : id === 'new' || editing ? (
          <Editor
            key={editing?.id ?? 'new'}
            stored={editing ?? null}
            canCreate={agents.length < MAX_AGENTS}
            spent={spent}
            limit={limit}
            onSaved={(saved) => {
              setAgents((list) => (list.some((item) => item.id === saved.id) ? list.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...list]));
              if (id === 'new') window.history.replaceState(null, '', `/agents/mine/${saved.id}`);
            }}
            onUsed={() => void mySpendThisMonth().then(setSpent).catch(() => undefined)}
            onDeleted={(removed) => {
              setAgents((list) => list.filter((item) => item.id !== removed));
              openPath('/agents/mine');
            }}
            openPath={openPath}
          />
        ) : (
          <>
            <button type="button" onClick={() => openPath('/agents')} className="mb-3 inline-flex cursor-pointer items-center gap-1.5 text-[14px] text-[var(--pg-body)] hover:text-[var(--pg-ink)]">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Funnel agents
            </button>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <PageTitle>Your own agents</PageTitle>
                <p className="mt-2 max-w-[640px] text-[15px] leading-[1.55] text-[var(--pg-body)] sm:text-[16px] sm:leading-[1.6]">
                  Build an agent for something you do often: write what it does, add your own documents, and talk to it here. It can read what you give it and answer. It cannot reach your servers or send anything to anyone.
                </p>
              </div>
              <Button className="w-full sm:w-auto" disabled={agents.length >= MAX_AGENTS} onClick={() => openPath('/agents/mine/new')}><Plus className="mr-1 h-4 w-4" aria-hidden="true" /> New agent</Button>
            </div>
            <div className="mt-6"><Allowance spent={spent} limit={limit} /></div>
            {agents.length === 0 ? (
              <div className="mt-6">
                <EmptyState title="No agents yet" body="Start from a template, or write your own. You can change everything later." action={<Button onClick={() => openPath('/agents/mine/new')}>Build your first agent</Button>} />
              </div>
            ) : (
              <ul className={`${CARD} mt-6 divide-y divide-[var(--pg-line-soft)] px-5`}>
                {agents.map((agent) => (
                  <li key={agent.id}>
                    <button type="button" onClick={() => openPath(`/agents/mine/${agent.id}`)} className="flex min-h-[64px] w-full cursor-pointer items-center gap-3 py-3 text-left">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{agent.name}</p>
                        <p className="truncate text-[13.5px] text-[var(--pg-body)]">{MODELS.find((model) => model.id === agent.model)?.name ?? agent.model} · changed {timeAgo(agent.updatedAt)}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--pg-body)]" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[13px] text-[var(--pg-body)]">{agents.length} of {MAX_AGENTS} agents.</p>
          </>
        )}
      </PageContainer>
    </LearnerLayout>
  );
}

function Allowance({ spent, limit }: { spent: number; limit: number | null }) {
  const pct = limit ? (spent / limit) * 100 : 0;
  return (
    <div className={`${CARD} p-4 sm:p-5`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[15px] font-semibold">This month&apos;s allowance</p>
        <p className="text-[14px] text-[var(--pg-body)]">{limit ? <><strong className="font-semibold text-[var(--pg-ink)]">${spent.toFixed(2)}</strong> of ${limit.toFixed(2)} used</> : `$${spent.toFixed(2)} used`}</p>
      </div>
      {limit ? <ProgressBar className="mt-3" value={pct} /> : null}
      <p className="mt-2 text-[12.5px] text-[var(--pg-body)]">Every message you send an agent, including in the preview, uses a little of it. It resets on the 1st of each month.</p>
    </div>
  );
}

function Editor({ stored, canCreate, spent, limit, onSaved, onUsed, onDeleted, openPath }: {
  stored: StoredAgent | null;
  canCreate: boolean;
  spent: number;
  limit: number | null;
  onSaved: (agent: StoredAgent) => void;
  onUsed: () => void;
  onDeleted: (id: string) => void;
  openPath: (path: string) => void;
}) {
  const [picked, setPicked] = useState<Starter | null>(stored ? null : STARTERS[0]);
  const [def, setDef] = useState<AgentDefinition | null>(stored ?? null);
  const [rule, setRule] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const problem = def ? (def.name.trim().length < 2 ? 'Give the agent a name.' : def.instructions.trim().length < 10 ? 'Write the instructions: what this agent does and how it answers.' : null) : null;
  const update = (patch: Partial<AgentDefinition>) => setDef((current) => (current ? { ...current, ...patch } : current));

  const save = async () => {
    if (!def || problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      const saved = await saveMyAgent(def);
      setDef(saved);
      onSaved(saved);
      setSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const back = (
    <button type="button" onClick={() => openPath('/agents/mine')} className="mb-3 inline-flex cursor-pointer items-center gap-1.5 text-[14px] text-[var(--pg-body)] hover:text-[var(--pg-ink)]">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Your own agents
    </button>
  );

  // A new agent starts by choosing what to start from.
  if (!def) {
    if (!canCreate) {
      return (
        <>
          {back}
          <Notice>You have {MAX_AGENTS} agents, which is the most. Delete one to make another.</Notice>
        </>
      );
    }
    return (
      <>
        {back}
        <PageTitle>New agent</PageTitle>
        <p className="mt-2 max-w-[640px] text-[15px] text-[var(--pg-body)]">Pick a starting point. It is only a first draft of the instructions; you change anything.</p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Starting point">
          {STARTERS.map((starter) => {
            const on = picked?.id === starter.id;
            return (
              <li key={starter.id}>
                <button type="button" role="radio" aria-checked={on} onClick={() => setPicked(starter)} className={`${CARD} flex h-full w-full cursor-pointer flex-col gap-2 p-5 text-left transition ${on ? 'border-[var(--pg-ink)] ring-1 ring-[var(--pg-ink)]' : 'hover:bg-[var(--pg-alt)]/40'}`}>
                  <span className="text-[16px] font-semibold">{starter.name}</span>
                  <span className="text-[14px] leading-[1.5] text-[var(--pg-body)]">{starter.summary}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-6"><Button disabled={!picked} onClick={() => picked && setDef(fromStarter(picked))}>Continue</Button></div>
      </>
    );
  }

  const addRule = () => {
    const value = rule.trim();
    if (!value || def.rules.length >= 12) return;
    update({ rules: [...def.rules, value.slice(0, 200)] });
    setRule('');
  };

  return (
    <>
      {back}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle>{stored ? def.name || 'Your agent' : 'New agent'}</PageTitle>
        <p className="text-[13px] text-[var(--pg-body)]">{savedAt ? `Saved ${savedAt}` : stored ? 'Saved' : 'Not saved yet'}</p>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <div className={`${CARD} space-y-5 p-5 sm:p-6`}>
            <Field label="Name" hint="Only you see this."><TextInput value={def.name} maxLength={80} onChange={(event) => update({ name: event.target.value })} /></Field>
            <Field label="Instructions" hint={`${def.instructions.length} of ${INSTRUCTION_LIMIT}. Say what it does, who it helps and how it should answer.`}>
              <TextArea rows={9} value={def.instructions} maxLength={INSTRUCTION_LIMIT} onChange={(event) => update({ instructions: event.target.value })} />
            </Field>
            <div>
              <p className="mb-1.5 text-[13.5px] font-medium">Rules it always follows</p>
              {def.rules.length > 0 && (
                <ul className="mb-2 space-y-1.5">
                  {def.rules.map((item, index) => (
                    <li key={`${item}-${index}`} className="flex items-start gap-2 rounded-[10px] border border-[var(--pg-line-soft)] px-3 py-2 text-[14px]">
                      <span className="flex-1">{item}</span>
                      <button type="button" aria-label={`Remove rule: ${item}`} onClick={() => update({ rules: def.rules.filter((_, i) => i !== index) })} className="cursor-pointer text-[var(--pg-body)] hover:text-[var(--pg-ink)]"><X className="h-4 w-4" aria-hidden="true" /></button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <TextInput value={rule} maxLength={200} onChange={(event) => setRule(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addRule(); } }} placeholder="Never state a price I have not given you" aria-label="Add a rule" />
                <Button variant="ghost" onClick={addRule} disabled={!rule.trim() || def.rules.length >= 12}><Plus className="h-4 w-4" aria-hidden="true" /> Add</Button>
              </div>
            </div>
            <fieldset>
              <legend className="mb-1.5 text-[13.5px] font-medium">Model</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {MODELS.map((model) => {
                  const on = def.model === model.id;
                  return (
                    <button key={model.id} type="button" role="radio" aria-checked={on} onClick={() => update({ model: model.id })} className={`cursor-pointer rounded-[12px] border p-3.5 text-left transition ${on ? 'border-[var(--pg-ink)] ring-1 ring-[var(--pg-ink)]' : 'border-[var(--pg-line)] hover:bg-[var(--pg-alt)]/40'}`}>
                      <span className="block text-[14.5px] font-semibold">{model.name}{model.recommended ? ' · recommended' : ''}</span>
                      <span className="mt-0.5 block text-[13px] text-[var(--pg-body)]">{model.blurb} {model.id.includes('haiku') ? 'Uses the least of your allowance.' : 'Uses more of your allowance.'}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
            {error && <Notice tone="error">{error}</Notice>}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {stored ? (
                <Button variant="danger" disabled={busy} onClick={() => { if (window.confirm(`Delete ${stored.name}? Its documents go too, and this cannot be undone.`)) void deleteAgent(stored.id).then(() => onDeleted(stored.id)).catch((err) => setError(errorMessage(err))); }}><Trash2 className="h-4 w-4" aria-hidden="true" /> Delete</Button>
              ) : <span />}
              <Button busy={busy} disabled={Boolean(problem)} onClick={() => void save()}>{stored ? 'Save changes' : 'Save agent'}</Button>
            </div>
          </div>

          <div className={`${CARD} p-5 sm:p-6`}>
            <h2 className="text-[17px] font-semibold">Your documents</h2>
            {stored ? (
              <div className="mt-3"><KnowledgePanel agentId={stored.id} member /></div>
            ) : (
              <p className="mt-2 text-[14.5px] text-[var(--pg-body)]">Save the agent first, then add the documents it should answer from: a price list, an FAQ, a page on your site.</p>
            )}
          </div>
          <Allowance spent={spent} limit={limit} />
        </div>

        <Preview def={def} valid={problem} onTested={onUsed} />
      </div>
    </>
  );
}
