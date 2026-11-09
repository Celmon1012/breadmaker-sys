import React, { useEffect, useState } from 'react';
import { Activity, ArrowRight, CheckCircle2, Inbox, Rocket } from 'lucide-react';
import { myLeads, LeadRow } from '../../lib/agents';
import { FunnelSummary, myFunnels } from '../../lib/portal';
import { Route } from '../../types';
import { Button, CARD } from './lms-ui';

function relative(value: string) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function RecentActivity({ onNavigate, openPath }: { onNavigate: (route: Route) => void; openPath: (path: string) => void }) {
  const [funnels, setFunnels] = useState<FunnelSummary[] | null>(null);
  const [leads, setLeads] = useState<LeadRow[]>([]);

  useEffect(() => {
    myFunnels().then(async (items) => {
      setFunnels(items);
      setLeads(await myLeads(items.map((item) => item.id)));
    }).catch(() => setFunnels([]));
  }, []);

  const newest = leads.slice(0, 3);
  return (
    <section className={`${CARD} p-6`} aria-labelledby="dash-activity">
      <div className="flex items-center justify-between gap-3">
        <div><p className="font-label text-[11.5px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">Workspace</p><h2 id="dash-activity" className="mt-1 font-editorial text-[22px] font-semibold">Recent activity</h2></div>
        <Activity className="h-5 w-5 text-[var(--pg-body)]" aria-hidden="true" />
      </div>
      {funnels === null ? <p className="mt-5 text-[14px] text-[var(--pg-body)]">Loading activity…</p> : newest.length ? (
        <ul className="mt-4 divide-y divide-[var(--pg-line-soft)]">
          {newest.map((lead, index) => {
            const funnel = funnels.find((item) => item.id === lead.jobId);
            return <li key={`${lead.createdAt}-${index}`} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--pg-alt)]"><Inbox className="h-4 w-4 text-[var(--pg-accent)]" /></span><span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-medium">New enquiry from {lead.name}</span><span className="block truncate text-[12.5px] text-[var(--pg-body)]">{funnel?.label ?? 'Your funnel'} · {relative(lead.createdAt)}</span></span>{(lead.status === 'pending' || lead.status === 'failed') && <span className="text-[12px] font-medium text-[var(--pg-accent)]">Needs attention</span>}</li>;
          })}
        </ul>
      ) : (
        <div className="mt-4 flex items-start gap-3 rounded-[12px] bg-[var(--pg-alt)]/50 p-4"><Rocket className="mt-0.5 h-5 w-5 shrink-0 text-[var(--pg-accent)]" /><p className="text-[14px] leading-[1.5] text-[var(--pg-body)]">Your workspace activity will appear here when your funnel starts receiving enquiries.</p></div>
      )}
      <div className="mt-5 flex flex-wrap gap-3"><Button variant="ghost" onClick={() => onNavigate('enquiries')}>View enquiries <ArrowRight className="h-4 w-4" /></Button>{funnels?.length ? <button onClick={() => openPath(`/funnel/${funnels[0].token}`)} className="inline-flex items-center gap-1.5 px-2 py-2 text-[13.5px] font-medium text-[var(--pg-body)] hover:text-[var(--pg-ink)] cursor-pointer">Open latest funnel <CheckCircle2 className="h-4 w-4" /></button> : null}</div>
    </section>
  );
}
