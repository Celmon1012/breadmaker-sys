import React, { useState } from 'react';
import { CheckCircle2, ChevronDown, CircleAlert, X } from 'lucide-react';
import { AgentRun, formatCost, formatDuration, formatTokens, timeAgo } from '../../lib/agent-runs';
import { CARD, Chip, Eyebrow, Notice } from './lms-ui';
import Markdown from './Markdown';

/** Pieces of the agent pages that show a run: the status pill, a stat tile, and one run in full. */

const STATUS_TONE: Record<AgentRun['status'], string> = {
  running: 'bg-[var(--pg-alt)] text-[var(--pg-ink)]',
  completed: 'bg-[#E7F6EC] text-[#1B7A3D]',
  failed: 'bg-[#FDECEA] text-[#B42318]',
};

export function StatusPill({ status }: { status: AgentRun['status'] }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium ${STATUS_TONE[status]}`}>
      {status === 'running' ? <span className="h-2 w-2 animate-pulse rounded-full bg-current" /> : status === 'completed' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}
      {status === 'running' ? 'Working' : status === 'completed' ? 'Done' : 'Failed'}
    </span>
  );
}

export function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className={`${CARD} p-4`}>
      <div className="text-[12.5px] font-medium text-[var(--pg-body)]">{label}</div>
      <div className="mt-1 font-editorial text-[26px] font-semibold leading-none tracking-[-0.02em]">{value}</div>
      {note && <div className="mt-1.5 text-[12.5px] text-[var(--pg-body)]">{note}</div>}
    </div>
  );
}

export function RunDetail({ run, onClose }: { run: AgentRun; onClose: () => void }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className={`${CARD} p-5 sm:p-6`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={run.status} />
            <Chip>{run.agent === 'ops' ? 'Ops' : run.agent}</Chip>
            <span className="text-[12.5px] text-[var(--pg-body)]">{timeAgo(run.startedAt)}</span>
          </div>
          <h3 className="mt-3 text-[17px] font-semibold leading-snug">{run.input}</h3>
        </div>
        <button type="button" onClick={onClose} aria-label="Close run" className="shrink-0 cursor-pointer rounded-full p-1.5 text-[var(--pg-body)] hover:bg-[var(--pg-alt)]">
          <X className="h-4 w-4" />
        </button>
      </div>

      {run.status === 'running' && <p className="mt-4 text-[14.5px] text-[var(--pg-body)]">Ops is checking. This page updates by itself.</p>}
      {run.error && <div className="mt-4"><Notice tone="error">{run.error}</Notice></div>}
      {run.output && <Markdown text={run.output} className="mt-4 text-[15px]" />}

      <dl className="mt-5 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
        {[
          ['Took', formatDuration(run.durationMs)],
          ['Tool calls', String(run.toolCalls.length)],
          ['Tokens', formatTokens(run.tokensIn + run.tokensOut)],
          ['Est. cost', formatCost(run.costUsd)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[12px] bg-[var(--pg-alt)] px-3 py-2">
            <dt className="text-[var(--pg-body)]">{label}</dt>
            <dd className="font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      {run.toolCalls.length > 0 && (
        <div className="mt-5">
          <Eyebrow>What it did</Eyebrow>
          <ol className="mt-2 space-y-2">
            {run.toolCalls.map((call, index) => (
              <li key={index} className="rounded-[12px] border border-[var(--pg-line-soft)]">
                <button type="button" onClick={() => setOpen(open === index ? null : index)} className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--pg-alt)] text-[12px] font-semibold">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{call.name}</span>
                  {call.error && <Chip>error</Chip>}
                  <ChevronDown className={`h-4 w-4 shrink-0 transition ${open === index ? 'rotate-180' : ''}`} />
                </button>
                {open === index && (
                  <div className="space-y-2 border-t border-[var(--pg-line-soft)] px-3 py-3 text-[12.5px]">
                    <div>
                      <div className="mb-1 font-medium text-[var(--pg-body)]">Asked</div>
                      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-[8px] bg-[var(--pg-alt)] p-2">{call.input}</pre>
                    </div>
                    <div>
                      <div className="mb-1 font-medium text-[var(--pg-body)]">Got back</div>
                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-[8px] bg-[var(--pg-alt)] p-2">{call.output ?? 'No result recorded.'}</pre>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

