import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, CheckCircle2, Clock3, RefreshCw, Search, TriangleAlert } from 'lucide-react';
import { Route } from '../../types';
import { myFunnels } from '../../lib/portal';
import { LeadRow, myLeads } from '../../lib/agents';
import { Button, CARD, Chip, EmptyState, LearnerLayout, Loading, PageContainer, PageTitle, TextInput } from './lms-ui';

const statusLabel: Record<LeadRow['status'], string> = {
  pending: 'Needs attention',
  sent: 'Delivered',
  emailed: 'Emailed',
  failed: 'Delivery failed',
};

function relative(value: string) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function EnquiriesPage({ onNavigate }: { onNavigate: (route: Route) => void }) {
  const [leads, setLeads] = useState<LeadRow[] | null>(null);
  const [funnelLabels, setFunnelLabels] = useState<Map<string, string>>(new Map());
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'attention'>('all');

  const load = async () => {
    const funnels = await myFunnels();
    setFunnelLabels(new Map(funnels.map((funnel) => [funnel.id, funnel.label])));
    setLeads(await myLeads(funnels.map((funnel) => funnel.id)));
  };

  useEffect(() => {
    load().catch(() => setLeads([]));
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (leads ?? []).filter((lead) => {
      const matchesFilter = filter === 'all' || lead.status === 'pending' || lead.status === 'failed';
      const matchesQuery = !needle || lead.name.toLowerCase().includes(needle) || (funnelLabels.get(lead.jobId) ?? '').toLowerCase().includes(needle);
      return matchesFilter && matchesQuery;
    });
  }, [filter, funnelLabels, leads, query]);

  const attention = (leads ?? []).filter((lead) => lead.status === 'pending' || lead.status === 'failed').length;

  return (
    <LearnerLayout active="enquiries" onNavigate={onNavigate}>
      <PageContainer>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <PageTitle>Enquiries</PageTitle>
            <p className="mt-2 max-w-[680px] text-[16px] leading-[1.6] text-[var(--pg-body)]">Every person who has come through your funnels, with the ones needing attention first.</p>
          </div>
          <Button variant="ghost" onClick={() => void load()}><RefreshCw className="h-4 w-4" /> Refresh</Button>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {[
            { label: 'All enquiries', value: leads?.length ?? '…', icon: ArrowDownLeft },
            { label: 'This week', value: leads ? leads.filter((lead) => Date.now() - new Date(lead.createdAt).getTime() <= 7 * 86_400_000).length : '…', icon: Clock3 },
            { label: 'Needs attention', value: leads ? attention : '…', icon: TriangleAlert },
          ].map((tile) => (
            <div key={tile.label} className={`${CARD} flex items-center gap-3 px-5 py-4`}>
              <tile.icon className="h-5 w-5 text-[var(--pg-accent)]" aria-hidden="true" />
              <div><p className="text-[13px] text-[var(--pg-body)]">{tile.label}</p><p className="mt-1 text-[26px] font-semibold leading-none">{tile.value}</p></div>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--pg-body)]" aria-hidden="true" />
            <TextInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people or funnels" className="pl-10" />
          </div>
          <div className="flex rounded-full bg-[var(--pg-alt)] p-1" role="tablist" aria-label="Enquiry filter">
            {([['all', 'All'], ['attention', `Needs attention${attention ? ` · ${attention}` : ''}`]] as const).map(([key, label]) => (
              <button key={key} role="tab" aria-selected={filter === key} onClick={() => setFilter(key)} className={`rounded-full px-4 py-2 text-[13.5px] font-medium cursor-pointer ${filter === key ? 'bg-[var(--pg-ink)] text-[var(--pg-bg)]' : 'hover:bg-[var(--pg-card)]'}`}>{label}</button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          {leads === null ? <Loading label="Loading enquiries…" /> : !leads.length ? (
            <EmptyState title="No enquiries yet" body="When someone completes one of your funnel forms, their enquiry will appear here." action={<Button onClick={() => onNavigate('funnel')}>View my funnels</Button>} />
          ) : !visible.length ? (
            <EmptyState title="Nothing matches" body="Try another search or show all enquiries." action={<Button variant="ghost" onClick={() => { setQuery(''); setFilter('all'); }}>Clear filters</Button>} />
          ) : (
            <div className={`${CARD} overflow-hidden`}>
              <ul className="divide-y divide-[var(--pg-line-soft)]">
                {visible.map((lead, index) => (
                  <li key={`${lead.jobId}-${lead.createdAt}-${index}`} className="flex flex-wrap items-center gap-4 px-5 py-4 sm:px-6">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--pg-alt)] font-semibold">{lead.name.slice(0, 1).toUpperCase()}</div>
                    <div className="min-w-[180px] flex-1"><p className="font-medium">{lead.name}</p><p className="mt-0.5 text-[13px] text-[var(--pg-body)]">{funnelLabels.get(lead.jobId) ?? 'Your funnel'} · {relative(lead.createdAt)}</p></div>
                    {lead.segment && <Chip>{lead.segment === 'ready' ? 'Ready now' : lead.segment === 'warming' ? 'Warming up' : 'Early'}</Chip>}
                    <Chip tone={lead.status === 'pending' ? 'accent' : lead.status === 'failed' ? 'dark' : 'neutral'}>{statusLabel[lead.status]}</Chip>
                    {(lead.status === 'pending' || lead.status === 'failed') && <CheckCircle2 className="h-5 w-5 text-[var(--pg-accent)]" aria-label="Needs follow-up" />}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </PageContainer>
    </LearnerLayout>
  );
}
