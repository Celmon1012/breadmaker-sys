import React, { useEffect, useState } from 'react';
import { Bot, Mail } from 'lucide-react';
import { siCaldotcom } from 'simple-icons';
import { Route } from '../../types';
import { FunnelSummary, myFunnels } from '../../lib/portal';
import { CARD, Chip, LearnerLayout, Loading, PageContainer, PageTitle } from './lms-ui';
import { ItemCard, ItemGrid, Segmented, ViewToggle, brandTile, useView } from './CardGrid';

type Card = { name: string; icon: React.ReactNode; tileStyle?: React.CSSProperties; body: string; state: 'on' | 'soon'; stateLabel: string; action?: React.ReactNode };

/**
 * What the member's funnels are connected to, at /integrations. Only connections that exist are shown as on:
 * enquiry emails. The rest say plainly that they are not available yet.
 */
export default function IntegrationsPage({ onNavigate }: { onNavigate: (route: Route) => void; openPath: (path: string) => void }) {
  const [funnels, setFunnels] = useState<FunnelSummary[] | null>(null);
  const [view, setView] = useView();
  const [filter, setFilter] = useState<'all' | 'connected'>('all');

  useEffect(() => {
    myFunnels().then(setFunnels).catch(() => setFunnels([]));
  }, []);

  const icon = 'h-5 w-5';
  const cards: Card[] = [
    { name: 'Email', icon: <Mail className={icon} aria-hidden="true" />, state: 'on', stateLabel: 'On', body: 'Every enquiry from your funnels is emailed to you.' },
    { name: 'Booking links', ...brandTile(siCaldotcom), state: 'soon', stateLabel: 'Not yet', body: 'Send ready leads to a calendar, such as Cal.com. For now, add your booking link as the funnel’s action in the brief.' },
    { name: 'Agent runtime', icon: <Bot className={icon} aria-hidden="true" />, state: 'soon', stateLabel: 'Not yet', body: 'Runs your agents so they reply on their own. Your agents are set up in the Hub today and send nothing until this is connected.' },
  ];
  const shown = filter === 'connected' ? cards.filter((card) => card.state === 'on') : cards;

  return (
    <LearnerLayout active="integrations" onNavigate={onNavigate}>
      <PageContainer>
        <PageTitle>Integrations</PageTitle>
        <p className="mt-2 max-w-[640px] text-[15px] leading-[1.55] text-[var(--pg-body)] sm:text-[16px] sm:leading-[1.6]">Where your funnels send their enquiries, and what is connected to them.</p>

        {funnels === null ? (
          <Loading label="Opening your integrations…" />
        ) : (
          <>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 sm:mt-8">
              <Segmented<'all' | 'connected'>
                label="Show"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'connected', label: 'Connected' },
                ]}
              />
              <ViewToggle view={view} onChange={setView} />
            </div>

            <div className="mt-4">
              {shown.length === 0 ? (
                <p className={`${CARD} p-6 text-[15px] text-[var(--pg-body)]`}>Nothing is connected yet.</p>
              ) : (
                <ItemGrid view={view} label="Integrations">
                  {shown.map((card) => (
                    <ItemCard
                      key={card.name}
                      view={view}
                      icon={card.icon}
                      tileStyle={card.tileStyle}
                      title={card.name}
                      body={card.body}
                      status={<Chip tone={card.state === 'on' ? 'accent' : 'neutral'}>{card.stateLabel}</Chip>}
                      action={card.action}
                    />
                  ))}
                </ItemGrid>
              )}
            </div>
          </>
        )}
      </PageContainer>
    </LearnerLayout>
  );
}
