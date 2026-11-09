import React, { useEffect, useState } from 'react';
import { Bot } from 'lucide-react';
import { Route } from '../../types';
import { FunnelSummary, myFunnels } from '../../lib/portal';
import { BLUEPRINTS, BlueprintId, FunnelAgent, addAgent, myAgents } from '../../lib/agents';
import { Button, EmptyState, LearnerLayout, Loading, Notice, PageContainer, PageTitle } from './lms-ui';
import { ItemCard, ItemGrid, ViewToggle, useView } from './CardGrid';

/**
 * Templates at /templates: the starting points for an agent, as cards or a list. Each has one job and a short
 * setup. Using one adds that agent to a funnel and opens its setup.
 */
export default function TemplatesPage({ onNavigate, openPath }: { onNavigate: (route: Route) => void; openPath: (path: string) => void }) {
  const [funnels, setFunnels] = useState<FunnelSummary[] | null>(null);
  const [agents, setAgents] = useState<FunnelAgent[]>([]);
  const [jobId, setJobId] = useState('');
  const [busy, setBusy] = useState<BlueprintId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useView();

  useEffect(() => {
    myFunnels()
      .then(async (list) => {
        setFunnels(list);
        setJobId(list[0]?.id ?? '');
        setAgents(await myAgents(list.map((funnel) => funnel.id)).catch(() => [] as FunnelAgent[]));
      })
      .catch(() => setFunnels([]));
  }, []);

  const use = async (blueprint: BlueprintId) => {
    setBusy(blueprint);
    setError(null);
    try {
      const added = await addAgent(jobId, blueprint);
      openPath(`/agents/${added.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the agent.');
      setBusy(null);
    }
  };

  return (
    <LearnerLayout active="templates" onNavigate={onNavigate}>
      <PageContainer>
        <PageTitle>Templates</PageTitle>
        <p className="mt-2 max-w-[640px] text-[15px] leading-[1.55] text-[var(--pg-body)] sm:text-[16px] sm:leading-[1.6]">Each agent starts from a template with one job and a short setup. Pick one and it is added to your funnel, ready for you to design. It sends nothing until the agent runtime is connected.</p>

        {funnels === null ? (
          <Loading label="Opening your templates…" />
        ) : funnels.length === 0 ? (
          <div className="mt-8">
            <EmptyState title="Build a funnel first" body="Agents work on a funnel. Reserve a Launchpad build spot and your templates unlock here." action={<Button onClick={() => openPath('/launchpad#apply')}>Reserve your build spot</Button>} />
          </div>
        ) : (
          <>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 sm:mt-8">
              {funnels.length > 1 ? (
                <label className="flex items-center gap-2 text-[13.5px] font-medium">
                  For
                  <select value={jobId} onChange={(event) => setJobId(event.target.value)} className="rounded-[10px] border border-[var(--pg-line)] bg-[var(--pg-card)] px-3 py-2 text-[14.5px]">
                    {funnels.map((funnel) => <option key={funnel.id} value={funnel.id}>{funnel.label}</option>)}
                  </select>
                </label>
              ) : (
                <p className="text-[14px] text-[var(--pg-body)]">For {funnels[0].label}</p>
              )}
              <ViewToggle view={view} onChange={setView} />
            </div>

            {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}

            <div className="mt-4">
              <ItemGrid view={view} label="Agent templates">
                {BLUEPRINTS.map((blueprint) => {
                  const has = agents.some((agent) => agent.jobId === jobId && agent.blueprint === blueprint.id);
                  return (
                    <ItemCard
                      key={blueprint.id}
                      view={view}
                      icon={<Bot className="h-5 w-5" aria-hidden="true" />}
                      title={blueprint.name}
                      body={blueprint.job}
                      meta={`${blueprint.steps.length} setup steps`}
                      action={
                        <Button variant="ghost" className="w-full sm:w-auto" disabled={has || !jobId} busy={busy === blueprint.id} onClick={() => void use(blueprint.id)}>
                          {has ? 'Already added' : 'Use template'}
                        </Button>
                      }
                    />
                  );
                })}
              </ItemGrid>
            </div>
          </>
        )}
      </PageContainer>
    </LearnerLayout>
  );
}
