import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Route } from '../../types';
import { FunnelSummary, myFunnels } from '../../lib/portal';
import FunnelPortal from './FunnelPortal';
import { Button, CARD, Chip, EmptyState, LearnerLayout, Loading, PageContainer, PageTitle } from './lms-ui';

const stage = (funnel: FunnelSummary) =>
  funnel.live ? 'Live' : funnel.deployed ? 'Preview ready' : funnel.paid ? 'Building' : funnel.hasBrief ? 'Brief ready' : 'Drafting';

/**
 * The signed-in view of the member's funnels, at /funnel.
 *   /funnel      -> an overview, even with one funnel: each funnel's name, stage and address, and Open
 *   /funnel/<id> -> that funnel, with a way back to the overview
 * "Build another funnel" starts a new application, because each funnel is built around one problem and one customer.
 */
export default function MyFunnelPage({ onNavigate, openPath, token }: { onNavigate: (route: Route) => void; openPath: (path: string) => void; token?: string }) {
  const [funnels, setFunnels] = useState<FunnelSummary[] | undefined>(undefined);

  useEffect(() => {
    myFunnels().then(setFunnels).catch(() => setFunnels([]));
  }, []);

  // The funnel to show is the one named in the address; with none named, the overview shows.
  const current = funnels?.find((funnel) => funnel.token === token);
  const overview = !!funnels && funnels.length > 0 && !current;

  return (
    <LearnerLayout active="funnel" onNavigate={onNavigate}>
      <PageContainer>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            {current && (
              <button onClick={() => openPath('/funnel')} className="mb-2 inline-flex items-center gap-1.5 text-[14px] text-[var(--pg-body)] hover:text-[var(--pg-ink)] cursor-pointer">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All funnels
              </button>
            )}
            <PageTitle>{current ? current.label : 'Funnels'}</PageTitle>
            <p className="mt-2 max-w-[640px] text-[16px] leading-[1.6] text-[var(--pg-body)]">
              {current ? 'Your brief, your address and your domain, in one place.' : 'Each funnel is built around one problem and one customer.'}
            </p>
          </div>
          {current ? (
            // The funnel page puts its Update funnel button here (with the revisions left).
            <div id="funnel-header-action" />
          ) : (
            funnels && funnels.length > 0 && <Button variant="ghost" onClick={() => openPath('/launchpad/apply')}>Build another funnel</Button>
          )}
        </div>

        <div className="mt-8">
          {funnels === undefined ? (
            <Loading label="Opening your funnels…" />
          ) : overview ? (
            <ul className="grid gap-4 sm:grid-cols-2">
              {funnels.map((funnel) => (
                <li key={funnel.token} className={`${CARD} flex flex-col gap-3 p-6`}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-editorial text-[22px] font-semibold leading-[1.2]">{funnel.label}</p>
                    <Chip tone={funnel.live ? 'accent' : 'neutral'}>{stage(funnel)}</Chip>
                  </div>
                  <p className="text-[14.5px] text-[var(--pg-body)]">{funnel.customDomain ?? (funnel.slug ? `${funnel.slug}.breadmaker.site` : 'Address not set yet')}</p>
                  <div className="mt-auto pt-2">
                    <Button onClick={() => openPath(`/funnel/${funnel.token}`)}>Open</Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : current ? (
            <FunnelPortal key={current.token} token={current.token} />
          ) : (
            <EmptyState
              title="No funnel yet"
              body="Reserve a Launchpad build spot and your funnel brief appears here."
              action={<Button onClick={() => openPath('/launchpad/apply')}>Reserve your build spot</Button>}
            />
          )}
        </div>
      </PageContainer>
    </LearnerLayout>
  );
}
