import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUp, Check, Plus, RotateCcw, X } from 'lucide-react';
import { errorMessage } from '../../lib/lms';
import { ModelStatus, PlatformStatus, formatCost, loadPlatformStatus } from '../../lib/agent-runs';
import {
  AgentDefinition,
  MODEL_CHOICES,
  PreviewMessage,
  PreviewResult,
  StoredAgent,
  TEMPLATES,
  Template,
  emptyDefinition,
  getAgent,
  previewAgent,
  publishAgent,
  saveAgent,
} from '../../lib/agent-defs';
import { Button, CARD, Chip, Eyebrow, Field, Loading, Notice, TextArea, TextInput } from './lms-ui';
import KnowledgePanel from './KnowledgePanel';
import Markdown from './Markdown';
import LaunchScreen from './LaunchScreen';
import { listSources } from '../../lib/agent-knowledge';
import { EvalRun, latestRuns, summary } from '../../lib/agent-evals';

/**
 * The agent builder: Purpose, Identity, Tools, Publish, with a live preview that stays beside the form. The preview
 * is a real model call through the agent platform using the definition as it is on screen, saved or not.
 */

type Step = 'purpose' | 'identity' | 'knowledge' | 'tools' | 'publish';
const STEPS: { id: Step; label: string }[] = [
  { id: 'purpose', label: 'Purpose' },
  { id: 'identity', label: 'Identity' },
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'tools', label: 'Tools' },
  { id: 'publish', label: 'Publish' },
];

const INSTRUCTION_LIMIT = 4000;

function Bars({ value, tone }: { value: number; tone: 'good' | 'cost' }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${value} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={`h-1.5 w-3.5 rounded-full ${n <= value ? (tone === 'cost' ? 'bg-[#B54708]' : 'bg-[var(--pg-ink)]') : 'bg-[var(--pg-line)]'}`} />
      ))}
    </span>
  );
}

export function Preview({ def, valid, onTested }: { def: AgentDefinition; valid: string | null; onTested: () => void }) {
  const [messages, setMessages] = useState<PreviewMessage[]>([]);
  const [calls, setCalls] = useState<PreviewResult['toolCalls']>([]);
  const [cost, setCost] = useState(0);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [messages, busy]);

  const send = async () => {
    const value = text.trim();
    if (!value || busy) return;
    if (valid) return setError(valid);
    setError(null);
    const next = [...messages, { role: 'user' as const, content: value }];
    setMessages(next);
    setText('');
    setBusy(true);
    try {
      const result = await previewAgent(def, next);
      setMessages([...next, { role: 'assistant', content: result.failed ? `That did not work: ${result.error ?? 'the agent failed'}` : result.reply || '(no reply)' }]);
      setCalls(result.toolCalls);
      setCost((total) => total + result.costUsd);
      if (!result.failed) onTested();
    } catch (err) {
      setError(errorMessage(err));
      setMessages(messages);
      setText(value);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className={`${CARD} flex h-[520px] flex-col overflow-hidden lg:sticky lg:top-4`} aria-label="Live preview">
      <div className="flex items-center justify-between border-b border-[var(--pg-line-soft)] px-4 py-3">
        <span className="flex items-center gap-2 text-[14px] font-semibold"><span className="h-2 w-2 rounded-full bg-emerald-600" />Live preview</span>
        <button type="button" onClick={() => { setMessages([]); setCalls([]); setCost(0); setError(null); }} className="inline-flex cursor-pointer items-center gap-1 text-[12.5px] text-[var(--pg-body)] hover:text-[var(--pg-ink)]">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Start over
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-[14.5px]">
        <div className="text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[var(--pg-ink)] text-[13px] font-semibold text-[var(--pg-bg)]">{(def.publicName || def.name || 'A').slice(0, 2).toUpperCase()}</div>
          <div className="mt-1.5 text-[14px] font-semibold">{def.publicName || def.name || 'Your agent'}</div>
        </div>
        {def.openingMessage && <div className="max-w-[85%] rounded-[14px] bg-[var(--pg-alt)] px-3 py-2">{def.openingMessage}</div>}
        {messages.map((message, index) => (
          <div key={index} className={`max-w-[85%] rounded-[14px] px-3 py-2 ${message.role === 'user' ? 'ml-auto whitespace-pre-wrap bg-[var(--pg-ink)] text-[var(--pg-bg)]' : 'bg-[var(--pg-alt)]'}`}>{message.role === 'user' ? message.content : <Markdown text={message.content} className="space-y-2" />}</div>
        ))}
        {busy && <div className="max-w-[85%] rounded-[14px] bg-[var(--pg-alt)] px-3 py-2 text-[var(--pg-body)]">Thinking…</div>}
        {calls.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1" aria-label="Tools it used on the last answer">
            {calls.map((call, index) => <Chip key={index}>{call.name}{call.error ? ' (failed)' : ''}</Chip>)}
          </div>
        )}
        <div ref={end} />
      </div>
      {error && <div className="px-4 pb-2"><Notice tone="error">{error}</Notice></div>}
      <form onSubmit={(event) => { event.preventDefault(); void send(); }} className="flex items-center gap-2 border-t border-[var(--pg-line-soft)] p-3">
        <input value={text} onChange={(event) => setText(event.target.value)} maxLength={2000} placeholder="Ask something" aria-label="Message to try the agent with" className="min-w-0 flex-1 rounded-full bg-[var(--pg-alt)] px-4 py-2.5 text-[14.5px] outline-none" />
        <button type="submit" disabled={!text.trim() || busy} aria-label="Send" className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--pg-ink)] text-[var(--pg-bg)] disabled:cursor-not-allowed disabled:opacity-40"><ArrowUp className="h-4 w-4" /></button>
      </form>
      <p className="px-4 pb-3 text-[12px] leading-[1.45] text-[var(--pg-body)]">
        Draft only: no customer can reach it. Each message is a real model call{cost > 0 ? `, about ${formatCost(cost)} so far` : ''}. Changes to the form apply to your next message.
      </p>
    </aside>
  );
}

export default function AgentBuilder({ agentId, openPath }: { agentId: string; openPath: (path: string) => void }) {
  const isNew = agentId === 'new';
  const [stored, setStored] = useState<StoredAgent | null>(null);
  const [def, setDef] = useState<AgentDefinition | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [step, setStep] = useState<Step>('purpose');
  const [platform, setPlatform] = useState<PlatformStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tested, setTested] = useState(false);
  const [note, setNote] = useState('');
  const [rule, setRule] = useState('');
  const [testRun, setTestRun] = useState<EvalRun | undefined>(undefined);
  const [launched, setLaunched] = useState<StoredAgent | null>(null);
  const [picked, setPicked] = useState<Template | null>(TEMPLATES[0] ?? null);
  const [newName, setNewName] = useState('');
  const [knowledgeCount, setKnowledgeCount] = useState(0);
  useEffect(() => {
    if (step !== 'publish' || !def?.id) return;
    latestRuns(def.id, 1).then((runs) => setTestRun(runs[0])).catch(() => setTestRun(undefined));
    listSources(def.id).then((sources) => setKnowledgeCount(sources.filter((s) => s.status === 'ready').length)).catch(() => setKnowledgeCount(0));
  }, [step, def?.id]);

  useEffect(() => {
    loadPlatformStatus().then(setPlatform).catch(() => setPlatform(null));
    if (isNew) return;
    getAgent(agentId)
      .then((agent) => {
        if (!agent) return setError('That agent does not exist.');
        setStored(agent);
        setDef(agent);
        setStep('identity');
      })
      .catch((err) => setError(errorMessage(err)));
  }, [agentId, isNew]);

  const update = (patch: Partial<AgentDefinition>) => setDef((current) => (current ? { ...current, ...patch } : current));

  const problem = useMemo(() => {
    if (!def) return 'Pick a starting point first.';
    if (def.name.trim().length < 2) return 'Give the agent a name.';
    if (def.instructions.trim().length < 10) return 'Write the instructions: what this agent does and how it answers.';
    return null;
  }, [def]);

  const choose = (chosen: Template, name?: string) => {
    setTemplate(chosen);
    setDef({ ...emptyDefinition(chosen), ...(name?.trim() ? { name: name.trim() } : {}) });
    setStep('identity');
  };

  const save = async (then?: () => void) => {
    if (!def) return;
    if (def.name.trim().length < 2) return setError('Give the agent a name.');
    setBusy(true);
    setError(null);
    try {
      const saved = await saveAgent(def);
      setStored(saved);
      setDef((current) => (current ? { ...current, id: saved.id } : current));
      if (isNew) window.history.replaceState(null, '', `/studio/agents/${saved.id}`);
      then?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const next = (to: Step) => void save(() => setStep(to));

  const publish = async () => {
    if (!def || problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      const live = await publishAgent(def, note || (stored?.version ? `Version ${stored.version + 1}` : 'First version'));
      setLaunched(live);
      setBusy(false);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  if (!isNew && !def && !error) return <Loading label="Opening the agent…" />;

  if (launched) {
    return (
      <LaunchScreen
        agent={launched}
        testRun={testRun}
        knowledgeCount={knowledgeCount}
        openPath={openPath}
        onOpen={() => openPath(`/studio/agents/${launched.id}`)}
        onKeepEditing={() => { setStored(launched); setLaunched(null); setStep('identity'); }}
      />
    );
  }

  const tools = platform?.tools ?? [];
  /** One group per connection (Coolify, Restart ops, ...), in the order the platform lists them. */
  const toolGroups = tools.reduce<{ system: string; tools: typeof tools }[]>((groups, tool) => {
    const group = groups.find((item) => item.system === tool.system);
    if (group) group.tools.push(tool); else groups.push({ system: tool.system, tools: [tool] });
    return groups;
  }, []);
  // The platform says which models exist and which providers are connected; if it cannot be reached, the three built-in choices.
  const models: ModelStatus[] = platform?.models ?? MODEL_CHOICES.map((choice) => ({ ...choice, provider: 'anthropic', recommended: Boolean(choice.recommended), available: true, needs: null, priceKnown: false }));
  const back = (
    <button type="button" onClick={() => openPath(stored ? `/studio/agents/${stored.id}` : '/studio/agents')} className="mb-3 inline-flex cursor-pointer items-center gap-1.5 text-[14px] text-[var(--pg-body)] hover:text-[var(--pg-ink)]">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {stored ? stored.name : 'Agents'}
    </button>
  );

  if (isNew && !def) {
    return (
      <div>
        {back}
        <h1 className="font-editorial text-[30px] font-semibold leading-[1.1] tracking-[-0.02em]">New agent</h1>
        <p className="mt-2 max-w-[620px] text-[15.5px] leading-[1.6] text-[var(--pg-body)]">Start from a template and change anything, or begin blank. You will test it as you build.</p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Template">
          {TEMPLATES.map((item) => {
            const on = picked?.id === item.id;
            return (
              <li key={item.id}>
                <button type="button" role="radio" aria-checked={on} onClick={() => { setPicked(item); setNewName(''); }} className={`${CARD} flex h-full w-full cursor-pointer flex-col gap-2 p-5 text-left transition ${on ? 'border-[var(--pg-ink)] ring-1 ring-[var(--pg-ink)]' : 'hover:border-[var(--pg-line)] hover:bg-[var(--pg-alt)]/40'}`}>
                  <span className="flex items-center justify-between gap-2"><span className="text-[16px] font-semibold">{item.name}</span>{on && <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--pg-ink)] text-[var(--pg-bg)]"><Check className="h-3.5 w-3.5" aria-hidden="true" /></span>}</span>
                  <span className="text-[14px] leading-[1.5] text-[var(--pg-body)]">{item.summary}</span>
                  <span className="mt-auto pt-2 text-[12.5px] text-[var(--pg-body)]">{item.id === 'blank' ? 'You write everything' : `${item.definition.tools.length} tool${item.definition.tools.length === 1 ? '' : 's'} · ${item.definition.rules.length} rule${item.definition.rules.length === 1 ? '' : 's'}`}</span>
                </button>
              </li>
            );
          })}
        </ul>

        {picked && (
          <div className={`${CARD} mt-6 p-5 sm:p-6`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[16px] font-semibold">What “{picked.name}” sets up for you</h2>
              <span className="text-[12.5px] text-[var(--pg-body)]">Change anything later</span>
            </div>
            {picked.id === 'blank' ? (
              <p className="mt-3 text-[14.5px] text-[var(--pg-body)]">No preloaded instructions or tools. You write the instructions, choose the model and pick the tools yourself.</p>
            ) : (
              <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
                <div>
                  <dt className="text-[13.5px] font-semibold">Instructions draft</dt>
                  <dd className="mt-0.5 line-clamp-3 text-[13px] leading-[1.5] text-[var(--pg-body)]">{picked.definition.instructions}</dd>
                </div>
                <div>
                  <dt className="text-[13.5px] font-semibold">{picked.definition.tools.length ? `${picked.definition.tools.length} tool${picked.definition.tools.length === 1 ? '' : 's'}` : 'No tools'}</dt>
                  <dd className="mt-0.5 text-[13px] leading-[1.5] text-[var(--pg-body)]">{picked.definition.tools.length ? `${picked.definition.tools.join(', ')}. All only look; nothing is changed without a person approving.` : 'It answers from its instructions alone. Add tools or knowledge as you build.'}</dd>
                </div>
                <div>
                  <dt className="text-[13.5px] font-semibold">{picked.definition.rules.length} rule{picked.definition.rules.length === 1 ? '' : 's'} it always follows</dt>
                  <dd className="mt-0.5 text-[13px] leading-[1.5] text-[var(--pg-body)]">{picked.definition.rules.join(' · ')}</dd>
                </div>
                <div>
                  <dt className="text-[13.5px] font-semibold">Model</dt>
                  <dd className="mt-0.5 text-[13px] leading-[1.5] text-[var(--pg-body)]">{MODEL_CHOICES.find((m) => m.id === picked.definition.model)?.name ?? picked.definition.model}. You test it live as you build, and can add knowledge from your own documents.</dd>
                </div>
              </dl>
            )}
            <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-[var(--pg-line-soft)] pt-4">
              <div className="min-w-[240px] flex-1 sm:max-w-[360px]">
                <Field label="Agent name" hint="Only your team sees this. You can change it."><TextInput value={newName} maxLength={80} onChange={(event) => setNewName(event.target.value)} placeholder={picked.definition.name} /></Field>
              </div>
              <Button onClick={() => choose(picked, newName)}>Continue to identity</Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!def) return <div>{back}{error && <Notice tone="error">{error}</Notice>}</div>;

  const toggleTool = (id: string) => update({ tools: def.tools.includes(id) ? def.tools.filter((tool) => tool !== id) : [...def.tools, id] });
  const addRule = () => {
    const value = rule.trim();
    if (!value || def.rules.length >= 12) return;
    update({ rules: [...def.rules, value] });
    setRule('');
  };
  const index = STEPS.findIndex((item) => item.id === step);

  return (
    <div>
      {back}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>{stored ? `Version ${stored.version || 'not published'} · ${stored.status}` : 'New agent'}</Eyebrow>
          <h1 className="mt-1 font-editorial text-[30px] font-semibold leading-[1.1] tracking-[-0.02em]">{step === 'purpose' ? 'What is it for?' : step === 'identity' ? 'Set up the agent’s identity' : step === 'knowledge' ? 'What should it know?' : step === 'tools' ? 'What can it use?' : 'Check it, then publish'}</h1>
        </div>
        <ol className="flex flex-wrap gap-1.5" aria-label="Steps">
          {STEPS.map((item, i) => (
            <li key={item.id}>
              <button type="button" onClick={() => setStep(item.id)} aria-current={item.id === step ? 'step' : undefined} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] ${item.id === step ? 'border-[var(--pg-ink)] bg-[var(--pg-ink)] text-[var(--pg-bg)]' : 'border-[var(--pg-line)] text-[var(--pg-body)] hover:bg-[var(--pg-alt)]'}`}>
                <span className="text-[11px] font-semibold">{i < index ? <Check className="h-3 w-3" aria-hidden="true" /> : i + 1}</span>{item.label}
              </button>
            </li>
          ))}
        </ol>
      </div>

      {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          {step === 'purpose' && (
            <div className={`${CARD} space-y-4 p-5 sm:p-6`}>
              <Field label="What is this agent for?" hint="One or two sentences. It helps you and your team remember its job.">
                <TextArea rows={3} maxLength={400} value={def.purpose} onChange={(event) => update({ purpose: event.target.value })} placeholder="Tell someone whether a website is up and where its domain points." />
              </Field>
              {(template || def.template) && <p className="text-[13.5px] text-[var(--pg-body)]">Started from: {TEMPLATES.find((item) => item.id === (template?.id ?? def.template))?.name ?? 'your own design'}.</p>}
            </div>
          )}

          {step === 'identity' && (
            <>
              <div className={`${CARD} space-y-4 p-5 sm:p-6`}>
                <h2 className="text-[17px] font-semibold">Identity</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Internal name" hint="Only your team sees this."><TextInput value={def.name} maxLength={80} onChange={(event) => update({ name: event.target.value })} /></Field>
                  <Field label="Customer-facing name" hint="Shown at the top of the chat. Optional."><TextInput value={def.publicName} maxLength={80} onChange={(event) => update({ publicName: event.target.value })} /></Field>
                </div>
                <Field label="Opening message" hint={`${def.openingMessage.length} of 280 used`}><TextInput value={def.openingMessage} maxLength={280} onChange={(event) => update({ openingMessage: event.target.value })} placeholder="Hi! I can check a website for you." /></Field>
              </div>

              <div className={`${CARD} p-5 sm:p-6`}>
                <h2 className="text-[17px] font-semibold">Model</h2>
                <p className="mt-1 text-[13.5px] text-[var(--pg-body)]">Change it any time. More bars is more of that trait; for cost, more bars means pricier.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Model">
                  {models.map((model) => (
                    <button key={model.id} type="button" role="radio" aria-checked={def.model === model.id} disabled={!model.available} onClick={() => update({ model: model.id })} className={`rounded-[14px] border p-3.5 text-left transition disabled:cursor-not-allowed disabled:opacity-55 ${model.available ? 'cursor-pointer' : ''} ${def.model === model.id ? 'border-[var(--pg-ink)] ring-1 ring-[var(--pg-ink)]' : 'border-[var(--pg-line)] hover:bg-[var(--pg-alt)]/40'}`}>
                      <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1"><span className="text-[15px] font-semibold">{model.name}</span>{model.recommended && <Chip tone="accent">Recommended</Chip>}</span>
                      <span className="mt-0.5 block text-[12px] text-[var(--pg-body)]">{model.provider === 'anthropic' ? 'Anthropic' : model.provider === 'openai' ? 'OpenAI' : 'Google'}{model.available ? '' : ` · not connected: add ${model.needs} in the platform settings`}</span>
                      <span className="mt-1 block text-[13px] leading-[1.45] text-[var(--pg-body)]">{model.blurb}</span>
                      <span className="mt-3 grid grid-cols-[56px_1fr] items-center gap-y-1.5 text-[12px] text-[var(--pg-body)]">
                        <span>Speed</span><Bars value={model.speed} tone="good" />
                        <span>Quality</span><Bars value={model.quality} tone="good" />
                        <span>Cost</span><Bars value={model.cost} tone="cost" />
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={`${CARD} space-y-3 p-5 sm:p-6`}>
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-[17px] font-semibold">Instructions</h2>
                  <span className={`text-[12.5px] ${def.instructions.length > INSTRUCTION_LIMIT ? 'text-[#B42318]' : 'text-[var(--pg-body)]'}`}>{def.instructions.length.toLocaleString()} / {INSTRUCTION_LIMIT.toLocaleString()}</span>
                </div>
                <TextArea rows={9} maxLength={INSTRUCTION_LIMIT} value={def.instructions} onChange={(event) => update({ instructions: event.target.value })} placeholder="You are… You answer questions about… Always…" aria-label="Instructions" />
                <div>
                  <p className="text-[13.5px] font-medium">Rules it always follows</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {def.rules.map((item, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[13px] text-emerald-900">
                        {item}
                        <button type="button" onClick={() => update({ rules: def.rules.filter((_, j) => j !== i) })} aria-label={`Remove rule: ${item}`} className="cursor-pointer"><X className="h-3 w-3" /></button>
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <TextInput value={rule} maxLength={200} onChange={(event) => setRule(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addRule(); } }} placeholder="Never state a refund amount" aria-label="Add a rule" />
                    <Button variant="ghost" onClick={addRule} disabled={!rule.trim() || def.rules.length >= 12}><Plus className="h-4 w-4" aria-hidden="true" /> Add</Button>
                  </div>
                  <p className="mt-1.5 text-[12.5px] text-[var(--pg-body)]">The platform also tells every agent to treat tool results as data, not instructions.</p>
                </div>
              </div>
            </>
          )}

          {step === 'knowledge' && <KnowledgePanel agentId={def.id} />}

          {step === 'tools' && (
            <div className={`${CARD} p-5 sm:p-6`}>
              <p className="text-[14.5px] text-[var(--pg-body)]">Pick what this agent may use. Tools that only look run on their own. A tool marked needs approval only files a request: a person must approve it before anything changes. With none picked, the agent answers from its instructions alone.</p>
              {tools.length === 0 ? (
                <div className="mt-4"><Notice tone="info">The agent platform did not list its tools, so they cannot be chosen right now. Try again in a moment.</Notice></div>
              ) : (
                <ul className="mt-4 space-y-3">
                  {toolGroups.map((group) => {
                    const ids = group.tools.map((tool) => tool.id);
                    const picked = ids.filter((id) => def.tools.includes(id)).length;
                    const on = picked > 0;
                    const writes = group.tools.filter((tool) => tool.risk !== 'read').length;
                    const setGroup = (enable: boolean) => update({ tools: enable ? [...new Set([...def.tools, ...ids])] : def.tools.filter((id) => !ids.includes(id)) });
                    return (
                      <li key={group.system} className={`rounded-[14px] border p-4 ${on ? 'border-[var(--pg-ink)] ring-1 ring-[var(--pg-ink)]' : 'border-[var(--pg-line)]'}`}>
                        <div className="flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-[15px] font-semibold">{group.system}</p>
                            <p className="mt-0.5 text-[13px] text-[var(--pg-body)]">
                              {group.tools.length} tool{group.tools.length === 1 ? '' : 's'} · {writes === 0 ? 'all read only' : `${group.tools.length - writes} read only, ${writes} need${writes === 1 ? 's' : ''} approval`}
                              {on && picked < ids.length ? ` · ${picked} of ${ids.length} on` : ''}
                            </p>
                          </div>
                          <button type="button" role="switch" aria-checked={on} aria-label={`Let this agent use ${group.system}`} onClick={() => setGroup(!on)} className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition ${on ? 'bg-[var(--pg-accent)]' : 'bg-[var(--pg-line)]'}`}>
                            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-[var(--pg-bg)] transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
                          </button>
                        </div>
                        <details className="mt-2">
                          <summary className="cursor-pointer text-[12.5px] text-[var(--pg-body)] underline-offset-2 hover:underline">See what it can do</summary>
                          <ul className="mt-2 divide-y divide-[var(--pg-line-soft)] text-[13px]">
                            {group.tools.map((tool) => (
                              <li key={tool.id} className="flex items-start justify-between gap-3 py-2">
                                <span className="min-w-0"><span className="block font-mono text-[12.5px] font-semibold">{tool.id}</span><span className="block leading-snug text-[var(--pg-body)]">{tool.summary}</span></span>
                                <span className="flex shrink-0 items-center gap-2">
                                  <span className="text-[12px] text-[var(--pg-body)]">{tool.risk === 'read' ? 'read only' : 'needs approval'}</span>
                                  <input type="checkbox" className="h-4 w-4 cursor-pointer" checked={def.tools.includes(tool.id)} onChange={() => toggleTool(tool.id)} aria-label={`Use ${tool.id}`} />
                                </span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {step === 'publish' && (
            <div className={`${CARD} space-y-4 p-5 sm:p-6`}>
              <h2 className="text-[17px] font-semibold">Before this goes live</h2>
              <ul className="space-y-2 text-[14.5px]">
                {[
                  [def.name.trim().length >= 2, 'It has a name'],
                  [def.instructions.trim().length >= 10, 'The instructions are written'],
                  [tested, 'You have tried it in the preview (this session)'],
                  [testRun ? testRun.status === 'completed' && testRun.failed === 0 && testRun.total > 0 : false, testRun ? `Tests: ${summary(testRun).label}` : 'No tests have been run (optional, but they catch mistakes before customers do)'],
                  [def.rules.length > 0, 'It has at least one rule'],
                ].map(([ok, label]) => (
                  <li key={String(label)} className="flex items-center gap-2.5">
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full ${ok ? 'bg-emerald-600 text-white' : 'border border-[var(--pg-line)]'}`}>{ok && <Check className="h-3 w-3" aria-hidden="true" />}</span>
                    <span className={ok ? '' : 'text-[var(--pg-body)]'}>{String(label)}</span>
                  </li>
                ))}
              </ul>
              <Field label="What changed? (optional)" hint="Shown in the version history."><TextInput value={note} maxLength={120} onChange={(event) => setNote(event.target.value)} placeholder="First version" /></Field>
              <p className="text-[13.5px] leading-[1.55] text-[var(--pg-body)]">Going live makes this version the one other systems get when they call the agent. It does not message anyone. You can keep editing: changes are tested in the preview and reach other systems only when you publish again.</p>
              <Button onClick={() => void publish()} busy={busy} disabled={Boolean(problem)}>{stored?.version ? `Publish version ${stored.version + 1}` : 'Go live'}</Button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[13px] text-[var(--pg-body)]">{stored ? `Saved as a draft${stored.updatedAt ? ` · ${new Date(stored.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}` : 'Not saved yet'}</span>
            <div className="flex gap-2">
              {index > 0 && <Button variant="ghost" onClick={() => setStep(STEPS[index - 1].id)}>Back</Button>}
              <Button variant="ghost" onClick={() => void save()} busy={busy}>Save draft</Button>
              {index < STEPS.length - 1 && <Button onClick={() => next(STEPS[index + 1].id)} busy={busy}>Continue</Button>}
            </div>
          </div>
        </div>

        <Preview def={def} valid={problem} onTested={() => setTested(true)} />
      </div>
    </div>
  );
}
