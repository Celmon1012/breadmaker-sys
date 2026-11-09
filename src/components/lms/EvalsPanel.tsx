import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, CircleAlert, Trash2 } from 'lucide-react';
import { errorMessage } from '../../lib/lms';
import { timeAgo } from '../../lib/agent-runs';
import { EvalCase, EvalRun, Expect, addCase, deleteCase, emptyExpect, latestRuns, listCases, splitList, startTests, summary } from '../../lib/agent-evals';
import { Button, CARD, Chip, Field, Notice, TextArea, TextInput, useTeamRole } from './lms-ui';
import Markdown from './Markdown';

/**
 * Tests for an agent: questions with what a good answer does. Run them all against the working copy before publishing,
 * and see for each one whether it passed and, if not, why. Tests cost model calls like any run.
 */
function expectChips(expect: Expect): string[] {
  return [
    ...expect.contains.map((w) => `mentions “${w}”`),
    ...expect.notContains.map((w) => `avoids “${w}”`),
    ...expect.tools.map((t) => `uses ${t}`),
    ...expect.noTools.map((t) => `never uses ${t}`),
    ...(expect.judge ? ['judged'] : []),
  ];
}

export default function EvalsPanel({ agentId }: { agentId: string }) {
  const { role } = useTeamRole();
  const canEdit = role === 'Owner' || role === 'Coach';
  const [cases, setCases] = useState<EvalCase[] | null>(null);
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', input: '', contains: '', notContains: '', tools: '', noTools: '', judge: '' });

  const refresh = useCallback(async () => {
    try {
      const [c, r] = await Promise.all([listCases(agentId), latestRuns(agentId, 3)]);
      setCases(c);
      setRuns(r);
    } catch {
      // The tables may not exist yet (migration 66).
      setCases((current) => current ?? []);
    }
  }, [agentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const running = runs[0]?.status === 'running';
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [running, refresh]);

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

  const save = () =>
    act(async () => {
      if (form.name.trim().length < 2) throw new Error('Give the test a name.');
      if (form.input.trim().length < 2) throw new Error('Write the question to ask.');
      const expect: Expect = { ...emptyExpect(), contains: splitList(form.contains), notContains: splitList(form.notContains), tools: splitList(form.tools), noTools: splitList(form.noTools), judge: form.judge.trim() };
      if (!expectChips(expect).length) throw new Error('Say what a good answer does: a word it mentions or avoids, a tool, or a plain-language standard.');
      await addCase(agentId, { name: form.name, input: form.input, expect });
      setAdding(false);
      setForm({ name: '', input: '', contains: '', notContains: '', tools: '', noTools: '', judge: '' });
    });

  const latest = runs[0];
  const state = summary(latest);

  return (
    <section aria-labelledby={`tests-${agentId}`}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h2 id={`tests-${agentId}`} className="text-[18px] font-semibold">Tests</h2>
        <div className="flex gap-2">
          {canEdit && !adding && <Button variant="ghost" onClick={() => setAdding(true)}>Add a test question</Button>}
          {canEdit && <Button onClick={() => void act(() => startTests(agentId))} busy={busy || running} disabled={!cases?.length}>{running ? 'Running…' : 'Run tests'}</Button>}
        </div>
      </div>
      <p className="mb-3 text-[14px] text-[var(--pg-body)]">Questions with what a good answer does. They run against the saved working copy, each as a real model call, so run them before you publish a change.</p>
      {error && <div className="mb-3"><Notice tone="error">{error}</Notice></div>}

      {latest && (
        <div className={`${CARD} mb-3 flex flex-wrap items-center gap-3 p-4`}>
          <span className={`flex h-7 w-7 items-center justify-center rounded-full ${state.ok === true ? 'bg-emerald-600 text-white' : state.ok === false ? 'bg-[#B42318] text-white' : 'bg-[var(--pg-alt)]'}`}>{state.ok === false ? <CircleAlert className="h-4 w-4" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}</span>
          <div>
            <div className="text-[15px] font-semibold">{state.label}</div>
            <div className="text-[12.5px] text-[var(--pg-body)]">{timeAgo(latest.startedAt)} · about ${latest.costUsd.toFixed(2)}</div>
          </div>
        </div>
      )}

      {adding && (
        <div className={`${CARD} mb-3 space-y-4 p-4 sm:p-5`}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name"><TextInput value={form.name} maxLength={120} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Return window" /></Field>
            <Field label="Question to ask"><TextInput value={form.input} maxLength={2000} onChange={(event) => setForm({ ...form, input: event.target.value })} placeholder="How long do I have to return something?" /></Field>
          </div>
          <p className="text-[13px] text-[var(--pg-body)]">What a good answer does. Fill in any that apply; separate several with commas.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Must mention"><TextInput value={form.contains} onChange={(event) => setForm({ ...form, contains: event.target.value })} placeholder="14 days" /></Field>
            <Field label="Must not mention"><TextInput value={form.notContains} onChange={(event) => setForm({ ...form, notContains: event.target.value })} placeholder="guarantee" /></Field>
            <Field label="Must use the tool"><TextInput value={form.tools} onChange={(event) => setForm({ ...form, tools: event.target.value })} placeholder="search_knowledge" /></Field>
            <Field label="Must never use the tool"><TextInput value={form.noTools} onChange={(event) => setForm({ ...form, noTools: event.target.value })} placeholder="restart_app" /></Field>
          </div>
          <Field label="Or a plain-language standard" hint="A small model judges the answer against it, for example “cites its source” or “never states a refund amount”.">
            <TextArea rows={2} maxLength={400} value={form.judge} onChange={(event) => setForm({ ...form, judge: event.target.value })} />
          </Field>
          <div className="flex gap-2">
            <Button onClick={() => void save()} busy={busy}>Save test</Button>
            <Button variant="ghost" onClick={() => { setAdding(false); setError(null); }}>Cancel</Button>
          </div>
        </div>
      )}

      {cases === null ? null : cases.length === 0 ? (
        !adding && <div className={`${CARD} p-4 text-[14.5px] text-[var(--pg-body)]`}>No tests yet.{canEdit ? ' Add the questions customers really ask, and what a good answer does.' : ''}</div>
      ) : (
        <ul className={`${CARD} divide-y divide-[var(--pg-line-soft)]`}>
          {cases.map((item) => {
            const result = latest?.results.find((r) => r.caseId === item.id);
            return (
              <li key={item.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14.5px] font-semibold">{item.name}</span>
                      {result && <Chip tone={result.passed ? 'accent' : 'neutral'}>{result.passed ? 'Passed' : 'Failed'}</Chip>}
                    </div>
                    <p className="mt-0.5 text-[13.5px] text-[var(--pg-body)]">“{item.input}”</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">{expectChips(item.expect).map((chip) => <Chip key={chip}>{chip}</Chip>)}</div>
                  </div>
                  <div className="flex gap-2">
                    {result && <Button variant="ghost" onClick={() => setOpen(open === item.id ? null : item.id)} aria-label="Show the result"><ChevronDown className={`h-4 w-4 transition ${open === item.id ? 'rotate-180' : ''}`} aria-hidden="true" /></Button>}
                    {canEdit && <Button variant="danger" busy={busy} aria-label={`Delete ${item.name}`} onClick={() => { if (window.confirm(`Delete the test "${item.name}"?`)) void act(() => deleteCase(item.id)); }}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>}
                  </div>
                </div>
                {result && open === item.id && (
                  <div className="mt-3 space-y-2 rounded-[12px] bg-[var(--pg-alt)] p-3 text-[13px]">
                    {result.reasons.length > 0 && <ul className="list-disc pl-5 text-[#B42318]">{result.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
                    <div><span className="font-medium">It answered:</span><Markdown text={result.output || '(nothing)'} className="mt-1" /></div>
                    {result.tools.length > 0 && <div className="text-[var(--pg-body)]">Tools used: {result.tools.join(', ')}</div>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
