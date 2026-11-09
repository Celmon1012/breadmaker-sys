import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { myFunnels } from '../../lib/portal';
import { Route } from '../../types';
import { ArrowRight } from 'lucide-react';
import { CARD } from './lms-ui';

interface Counts {
  week: number;
  month: number;
  total: number;
  waiting: number;
  last: string | null;
}

const EMPTY: Counts = { week: 0, month: 0, total: 0, waiting: 0, last: null };

/**
 * How the member's funnels are doing, from the enquiries they have received (their own rows, by row-level
 * security). Shows zeros, not an error, before the first enquiry or if the table is not set up yet.
 */
export default function EnquiryMetrics({ onNavigate }: { onNavigate: (route: Route) => void }) {
  const { user } = useAuth();
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    // Only the member's own funnels: team members can read every applicant's enquiries.
    myFunnels()
      .then(async (funnels) => {
        if (!funnels.length) return { data: [] as { created_at: string; status: string }[], error: null };
        return supabase
          .from('funnel_leads')
          .select('created_at, status')
          .in('job_id', funnels.map((funnel) => funnel.id))
          .order('created_at', { ascending: false })
          .limit(2000);
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) return setCounts(EMPTY);
        const now = Date.now();
        const within = (days: number) => data.filter((row) => now - new Date(row.created_at).getTime() <= days * 86_400_000).length;
        setCounts({
          week: within(7),
          month: within(30),
          total: data.length,
          waiting: data.filter((row) => row.status === 'pending').length,
          last: data[0]?.created_at ?? null,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const c = counts ?? EMPTY;
  const tiles = [
    { label: 'Last 7 days', value: c.week },
    { label: 'Last 30 days', value: c.month },
    { label: 'All time', value: c.total },
    { label: 'Waiting to deliver', value: c.waiting },
  ];

  return (
    <section className={`${CARD} h-full p-6`} aria-labelledby="dash-enquiries">
      <div className="flex items-start justify-between gap-3"><div><p className="font-label text-[11.5px] font-semibold uppercase tracking-[0.06em] text-[var(--pg-accent)]">Work</p><h2 id="dash-enquiries" className="mt-1 font-editorial text-[22px] font-semibold tracking-[-0.01em]">Enquiries</h2></div><button onClick={() => onNavigate('enquiries')} className="rounded-full p-2 text-[var(--pg-body)] hover:bg-[var(--pg-alt)] cursor-pointer" aria-label="View all enquiries"><ArrowRight className="h-4 w-4" /></button></div>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-[12px] bg-[var(--pg-alt)]/50 px-4 py-3">
            <dt className="text-[13px] text-[var(--pg-body)]">{tile.label}</dt>
            <dd className="mt-1 text-[26px] font-semibold leading-[1.15] tracking-[-0.01em]">{counts ? tile.value : '…'}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-[14px] leading-[1.5] text-[var(--pg-body)]">
        {c.last ? `Last enquiry ${new Date(c.last).toLocaleString()}.` : 'Enquiries sent through your funnel appear here.'}
      </p>
    </section>
  );
}
