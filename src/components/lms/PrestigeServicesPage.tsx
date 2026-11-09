import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Bot, GitBranch, LifeBuoy, MessageCircle, Server, Inbox } from 'lucide-react';
import { Route } from '../../types';
import { errorMessage, formatPrice } from '../../lib/lms';
import {
  MemberProject,
  MemberRepo,
  MemberServices,
  PARTNER_AGENT_BUDGET_USD,
  PARTNER_UPTIME,
  budgetResetsOn,
  PlanCode,
  getMyPlan,
  getMyServices,
  listMyProjects,
  listMyRepos,
  requestRepo,
  setMyWhatsapp,
} from '../../lib/prestige';
import MembershipOffer from './MembershipOffer';
import { Button, CARD, Chip, EmptyState, Eyebrow, Field, LearnerLayout, Loading, Notice, PageContainer, PageTitle, ProgressBar, TextInput } from './lms-ui';

interface PrestigeServicesPageProps {
  onNavigate: (route: Route) => void;
  openPath: (path: string) => void;
}

const AGENT_LABEL = { none: 'Not set up', provisioning: 'Being set up', active: 'Active', paused: 'Paused', limit: 'Budget reached' } as const;
const REPO_LABEL = { requested: 'Waiting for us', connected: 'Connected', removed: 'Removed' } as const;
const PROJECT_LABEL = { deploying: 'Deploying', running: 'Running', degraded: 'Degraded', down: 'Down' } as const;

function ServiceCard({ icon: Icon, title, status, children }: { icon: typeof MessageCircle; title: string; status?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={`${CARD} px-6 py-6`}>
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--pg-alt)]">
          <Icon className="h-5 w-5 text-[var(--pg-accent)]" aria-hidden="true" />
        </span>
        <h2 className="text-[18px] font-bold">{title}</h2>
        {status && <span className="ml-auto">{status}</span>}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function PrestigeServicesPage({ onNavigate, openPath }: PrestigeServicesPageProps) {
  const [plan, setPlan] = useState<PlanCode | null | undefined>(undefined);
  const [services, setServices] = useState<MemberServices | null>(null);
  const [repos, setRepos] = useState<MemberRepo[]>([]);
  const [projects, setProjects] = useState<MemberProject[]>([]);
  const [number, setNumber] = useState('');
  const [repoInput, setRepoInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const current = await getMyPlan();
      setPlan(current);
      if (current === 'partner') {
        const [s, r, p] = await Promise.all([getMyServices(), listMyRepos(), listMyProjects()]);
        setServices(s);
        setRepos(r);
        setProjects(p);
        setNumber(s?.whatsappNumber ?? '');
      } else if (current) {
        const s = await getMyServices();
        setNumber(s?.whatsappNumber ?? '');
      }
    } catch (err) {
      setPlan(null);
      setNotice({ tone: 'error', text: errorMessage(err) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (success: string, action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      setNotice({ tone: 'success', text: success });
      await load();
    } catch (err) {
      setNotice({ tone: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const budget = services?.agentBudgetMinor ?? PARTNER_AGENT_BUDGET_USD * 100;
  const spent = services?.agentSpentMinor ?? 0;
  const percent = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;

  return (
    <LearnerLayout active="my-membership" onNavigate={onNavigate}>
      <PageContainer>
        <Eyebrow>{plan === 'partner' ? 'Breadmaker Prestige' : 'Breadmaker Hub'}</Eyebrow>
        <PageTitle className="mt-4">{plan === 'partner' ? 'Your Prestige services' : 'Your membership'}</PageTitle>

        {plan === undefined && <Loading />}
        {notice && <div className="mt-6"><Notice tone={notice.tone}>{notice.text}</Notice></div>}

        {plan === null && (
          <div className="mt-8">
            <p className="mb-5 max-w-[640px] text-[16px] leading-[1.6] text-[var(--pg-body)]">You are not a member yet. Join Community for the room and the tools, or apply for Prestige to have a team behind your systems.</p>
            <MembershipOffer openPath={openPath} />
          </div>
        )}

        {plan === 'hub' && (
          <div className="mt-8 grid max-w-[760px] gap-5">
            <section className={`${CARD} px-6 py-6`}>
              <h2 className="text-[18px] font-bold">You are in the community.</h2>
              <p className="mt-2 text-[15.5px] leading-[1.6] text-[var(--pg-body)]">
                You have the private community, resources and tools. Breadmaker Prestige adds a WhatsApp developer on your repo, hosting on your own dedicated server and priority support.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button onClick={() => openPath('/membership/apply')}>Apply for Prestige</Button>
                <Button variant="ghost" onClick={() => openPath('/membership')}>Read the membership page</Button>
              </div>
            </section>
          </div>
        )}

        {plan === 'partner' && (
          <>
            <p className="mt-3 max-w-[640px] text-[17px] leading-[1.6] text-[var(--pg-body)]">
              Your developer, your server and your inbox, in one place. We run the systems under your business.
            </p>
            <div className="mt-8 grid items-start gap-5 xl:grid-cols-2">
              <ServiceCard
                icon={MessageCircle}
                title="WhatsApp developer"
                status={<Chip tone={services?.agentStatus === 'active' ? 'accent' : 'neutral'}>{AGENT_LABEL[services?.agentStatus ?? 'none']}</Chip>}
              >
                <p className="text-[15px] leading-[1.55] text-[var(--pg-body)]">
                  Message your developer on WhatsApp to change code, fix bugs and ship updates on your connected repo. Work lands on a branch as a pull request, and nothing goes live until you approve it.
                </p>
                <Field label="Your WhatsApp number" className="mt-4" hint={services?.whatsappVerified ? 'Verified. Messages from this number reach your developer.' : number ? 'Waiting for us to verify this number.' : 'Use the international format, for example +2348012345678.'}>
                  <div className="flex gap-2">
                    <TextInput value={number} onChange={(e) => setNumber(e.target.value)} placeholder="+234…" inputMode="tel" />
                    <Button variant="dark" busy={busy} onClick={() => void run('Number saved. We will verify it.', () => setMyWhatsapp(number))}>Save</Button>
                  </div>
                </Field>
                <div className="mt-5">
                  <div className="mb-2 flex justify-between text-[13.5px]">
                    <span className="font-medium">Agent usage this month</span>
                    <span className="text-[var(--pg-body)]">{formatPrice(spent, 'USD')} of {formatPrice(budget, 'USD')}</span>
                  </div>
                  <ProgressBar value={percent} />
                  <p className="mt-2 text-[12.5px] text-[var(--pg-body)]">
                    {formatPrice(budget, 'USD')} of agent usage each month. It starts over on {services ? budgetResetsOn(services.budgetPeriodStart).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : 'your billing date'}. We message you at 80% and when it is used up.
                  </p>
                  {services?.agentStatus === 'limit' && (
                    <div className="mt-3"><Notice tone="error">You have used this month's budget, so your developer is paused until it starts over. Open a ticket if you need a top-up.</Notice></div>
                  )}
                  {services?.agentStatus !== 'limit' && percent >= 80 && (
                    <div className="mt-3"><Notice tone="info">You have used {percent}% of this month's budget.</Notice></div>
                  )}
                </div>
              </ServiceCard>

              <ServiceCard icon={GitBranch} title="Repositories">
                {repos.length === 0 ? (
                  <p className="text-[15px] text-[var(--pg-body)]">No repositories yet. Add the one you want your developer to work on.</p>
                ) : (
                  <ul className="divide-y divide-[var(--pg-line-soft)]">
                    {repos.map((repo) => (
                      <li key={repo.id} className="flex items-center justify-between gap-3 py-2.5 text-[15px]">
                        <span className="truncate font-medium">{repo.repo}</span>
                        <Chip tone={repo.status === 'connected' ? 'accent' : 'neutral'}>{REPO_LABEL[repo.status]}</Chip>
                      </li>
                    ))}
                  </ul>
                )}
                <Field label="Add a repository" className="mt-4" hint="Owner and name, for example acme/website. We will ask you to install our GitHub app on it.">
                  <div className="flex gap-2">
                    <TextInput value={repoInput} onChange={(e) => setRepoInput(e.target.value)} placeholder="owner/repository" />
                    <Button variant="dark" busy={busy} onClick={() => void run('Repository requested.', async () => { await requestRepo(repoInput); setRepoInput(''); })}>Add</Button>
                  </div>
                </Field>
              </ServiceCard>

              <ServiceCard icon={Server} title="Projects on your server">
                {projects.length === 0 ? (
                  <p className="text-[15px] text-[var(--pg-body)]">Your projects appear here once they are deployed on your server.</p>
                ) : (
                  <ul className="divide-y divide-[var(--pg-line-soft)]">
                    {projects.map((project) => (
                      <li key={project.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{project.name}</span>
                          {project.domain && <span className="block truncate text-[13px] text-[var(--pg-body)]">{project.domain}</span>}
                        </span>
                        {project.uptime30d !== null && <span className="text-[13px] text-[var(--pg-body)]">{project.uptime30d}% last 30 days</span>}
                        <Chip tone={project.status === 'running' ? 'accent' : 'neutral'}>{PROJECT_LABEL[project.status]}</Chip>
                        {project.consoleUrl && (
                          <a href={project.consoleUrl} target="_blank" rel="noopener noreferrer" className="text-[13.5px] font-medium text-[var(--pg-accent)] underline underline-offset-4">Open console</a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-[12.5px] text-[var(--pg-body)]">Our uptime target is {PARTNER_UPTIME} a month. If we fall short, you get a credit against that month's fee.</p>
              </ServiceCard>

              <ServiceCard icon={Bot} title="Your own agents">
                <p className="text-[15px] leading-[1.55] text-[var(--pg-body)]">Build up to five agents of your own: write what each does, add your own documents and talk to it. They read what you give them and answer; they cannot reach your servers or send anything. A monthly allowance covers the model cost.</p>
                <div className="mt-4">
                  <Button onClick={() => openPath('/agents/mine')}>Open my agents</Button>
                </div>
              </ServiceCard>

              <ServiceCard icon={LifeBuoy} title="Priority support">
                <p className="text-[15px] leading-[1.55] text-[var(--pg-body)]">Your tickets go to the top of the queue, and our agentic team handles them.</p>
                <div className="mt-4">
                  <Button onClick={() => onNavigate('support')}>Open a ticket</Button>
                </div>
              </ServiceCard>
            </div>
          </>
        )}
      </PageContainer>
    </LearnerLayout>
  );
}
