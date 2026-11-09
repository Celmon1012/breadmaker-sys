import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { AGENT_PLATFORM_URL } from '../../lib/agent-runs';
import { EvalRun, summary } from '../../lib/agent-evals';
import { StoredAgent } from '../../lib/agent-defs';
import { Button, CARD, Chip } from './lms-ui';

/**
 * Shown after publishing: the agent is live, what was true when it went live, how to use it, and what to watch.
 * "Live" means the published version can be run from the studio and called by other systems. It does not message anyone.
 */
export default function LaunchScreen({ agent, testRun, knowledgeCount, onOpen, onKeepEditing, openPath }: {
  agent: StoredAgent;
  testRun: EvalRun | undefined;
  knowledgeCount: number;
  onOpen: () => void;
  onKeepEditing: () => void;
  openPath: (path: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const tests = summary(testRun);
  const snippet = `curl -X POST ${AGENT_PLATFORM_URL}/run \\\n  -H "Authorization: Bearer $PLATFORM_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '{"agentId":"${agent.id}","input":"Your question"}'`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the text is selectable anyway */
    }
  };

  const checks: { ok: boolean | null; label: string }[] = [
    { ok: agent.name.trim().length >= 2, label: 'It has a name' },
    { ok: agent.instructions.trim().length >= 10, label: 'The instructions are written' },
    { ok: agent.rules.length > 0, label: `${agent.rules.length} rule${agent.rules.length === 1 ? '' : 's'} it always follows` },
    { ok: true, label: `${agent.tools.length} tool${agent.tools.length === 1 ? '' : 's'}${knowledgeCount ? ` and ${knowledgeCount} knowledge source${knowledgeCount === 1 ? '' : 's'}` : ''} connected` },
    { ok: tests.ok, label: `Tests: ${tests.label}` },
  ];

  return (
    <div className="mx-auto max-w-[860px] space-y-6 py-6 text-center">
      <div>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--pg-ink)] text-[var(--pg-bg)]"><Check className="h-8 w-8" aria-hidden="true" /></div>
        <h1 className="mt-5 font-editorial text-[32px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[40px]">{agent.name} is live</h1>
        <p className="mt-2 text-[15.5px] text-[var(--pg-body)]">Version {agent.version} is published. It can be run from the studio and called by other systems. It does not message anyone.</p>
      </div>

      <div className={`${CARD} p-4 text-left sm:p-5`}>
        <div className="mb-3 flex items-center gap-2"><h2 className="text-[16px] font-semibold">Before this launched</h2>{tests.ok === false && <Chip>Tests failing</Chip>}</div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {checks.map((item) => (
            <li key={item.label} className="flex items-center gap-2.5 rounded-[10px] border border-[var(--pg-line-soft)] px-3 py-2 text-[14px]">
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${item.ok === true ? 'bg-emerald-600 text-white' : item.ok === false ? 'bg-[#B42318] text-white' : 'border border-[var(--pg-line)]'}`}>{item.ok !== null && <Check className="h-3 w-3" aria-hidden="true" />}</span>
              {item.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-4 text-left md:grid-cols-3">
        <div className={`${CARD} flex flex-col gap-3 p-4 md:col-span-2`}>
          <h2 className="text-[16px] font-semibold">Call it from another system</h2>
          <p className="text-[13.5px] text-[var(--pg-body)]">Other systems run the published version, never a draft. Use the platform token, kept in the platform's settings.</p>
          <pre className="overflow-x-auto rounded-[10px] bg-[var(--pg-alt)] p-3 text-left text-[12px] leading-[1.55]">{snippet}</pre>
          <div><Button variant="ghost" onClick={() => void copy()}><Copy className="h-4 w-4" aria-hidden="true" /> {copied ? 'Copied' : 'Copy'}</Button></div>
        </div>
        <div className={`${CARD} flex flex-col gap-3 p-4`}>
          <h2 className="text-[16px] font-semibold">Other ways to use it</h2>
          <Button variant="ghost" onClick={onOpen}>Ask it something</Button>
          <Button variant="ghost" onClick={() => openPath(`/studio/agents/${agent.id}`)}>Run it on a schedule</Button>
        </div>
      </div>

      <div className={`${CARD} p-4 text-left sm:p-5`}>
        <h2 className="mb-2 text-[16px] font-semibold">What to watch in the first day</h2>
        <ul className="grid gap-3 text-[13.5px] sm:grid-cols-3">
          <li><span className="font-semibold">Failures</span><br /><span className="text-[var(--pg-body)]">The control room flags an agent that fails a quarter of its runs.</span></li>
          <li><span className="font-semibold">Approvals</span><br /><span className="text-[var(--pg-body)]">Anything it wants to change waits for you, so check the queue.</span></li>
          <li><span className="font-semibold">Spend</span><br /><span className="text-[var(--pg-body)]">Each run is costed and counts against the daily cap.</span></li>
        </ul>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <Button variant="ghost" onClick={onKeepEditing}>Keep editing</Button>
        <Button onClick={onOpen}>Open {agent.name}</Button>
      </div>
    </div>
  );
}
