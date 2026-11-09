import React, { useCallback, useEffect, useState } from 'react';
import { HubMemberRow, setHubMember } from '../../lib/hub';
import { errorMessage } from '../../lib/lms';
import {
  AgentStatus,
  KumodaStatus,
  MemberProject,
  MemberRepo,
  MemberServices,
  PARTNER_SEATS,
  PartnerApplication,
  budgetResetsOn,
  PlanCode,
  ProjectStatus,
  RepoStatus,
  deleteProject,
  getServicesFor,
  listMemberPlans,
  listPartnerApplications,
  saveProject,
  saveServices,
  setApplicationStatus,
  setMemberPlan,
  setRepoStatus,
} from '../../lib/prestige';
import { Button, CARD, Chip, EmptyState, Field, Loading, Notice, Select, TextArea, TextInput } from './lms-ui';

/** Studio, Prestige tab: Prestige applications and the services each Partner member gets. */

const formatDate = (value: string) => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const dollars = (minor: number) => (minor / 100).toString();

const EMPTY_PROJECT = { name: '', domain: '', status: 'deploying' as ProjectStatus, uptime30d: '', consoleUrl: '' };

function MemberPanel({ member, canEdit, onError }: { member: HubMemberRow; canEdit: boolean; onError: (text: string) => void }) {
  const [data, setData] = useState<{ services: MemberServices | null; repos: MemberRepo[]; projects: MemberProject[] } | null>(null);
  const [form, setForm] = useState({
    whatsappNumber: '',
    whatsappVerified: false,
    agentStatus: 'none' as AgentStatus,
    spent: '0',
    budget: '20',
    kumodaStatus: 'none' as KumodaStatus,
    kumodaUrl: '',
    notes: '',
  });
  const [project, setProject] = useState(EMPTY_PROJECT);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const next = await getServicesFor(member.email);
      setData(next);
      const s = next.services;
      setForm({
        whatsappNumber: s?.whatsappNumber ?? '',
        whatsappVerified: s?.whatsappVerified ?? false,
        agentStatus: s?.agentStatus ?? 'none',
        spent: dollars(s?.agentSpentMinor ?? 0),
        budget: dollars(s?.agentBudgetMinor ?? 2000),
        kumodaStatus: s?.kumodaStatus ?? 'none',
        kumodaUrl: s?.kumodaUrl ?? '',
        notes: s?.notes ?? '',
      });
    } catch (err) {
      onError(errorMessage(err));
    }
  }, [member.email, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setSaved(false);
    try {
      await action();
      await load();
      setSaved(true);
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  if (!data) return <div className="px-6 py-4"><Loading /></div>;

  return (
    <div className="space-y-5 bg-[var(--pg-alt)]/40 px-6 py-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="WhatsApp number">
          <TextInput value={form.whatsappNumber} onChange={(e) => set({ whatsappNumber: e.target.value, whatsappVerified: false })} disabled={!canEdit} placeholder="+234…" />
        </Field>
        <Field label="Number verified">
          <Select value={form.whatsappVerified ? 'yes' : 'no'} onChange={(e) => set({ whatsappVerified: e.target.value === 'yes' })} disabled={!canEdit}>
            <option value="no">Not yet</option>
            <option value="yes">Verified</option>
          </Select>
        </Field>
        <Field label="Developer agent">
          <Select value={form.agentStatus} onChange={(e) => set({ agentStatus: e.target.value as AgentStatus })} disabled={!canEdit}>
            <option value="none">Not set up</option>
            <option value="provisioning">Being set up</option>
            <option value="active">Active</option>
            <option value="paused">Paused (kill switch)</option>
            <option value="limit">Budget reached</option>
          </Select>
        </Field>
        <Field label="Kumoda account">
          <Select value={form.kumodaStatus} onChange={(e) => set({ kumodaStatus: e.target.value as KumodaStatus })} disabled={!canEdit}>
            <option value="none">Not set up</option>
            <option value="requested">Being set up</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </Select>
        </Field>
        <Field
          label="Spent this period ($)"
          hint={data.services ? `Resets ${budgetResetsOn(data.services.budgetPeriodStart).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}. ${data.services.lastUsageAt ? `Gateway last reported ${new Date(data.services.lastUsageAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.` : 'No report from the gateway yet.'}` : undefined}
        >
          <TextInput type="number" min={0} step="0.01" value={form.spent} onChange={(e) => set({ spent: e.target.value })} disabled={!canEdit} />
        </Field>
        <Field label="Monthly budget ($)">
          <TextInput type="number" min={0} step="1" value={form.budget} onChange={(e) => set({ budget: e.target.value })} disabled={!canEdit} />
        </Field>
        <Field label="Kumoda link" className="sm:col-span-2">
          <TextInput type="url" value={form.kumodaUrl} onChange={(e) => set({ kumodaUrl: e.target.value })} disabled={!canEdit} placeholder="https://…" />
        </Field>
      </div>
      <Field label="Internal notes">
        <TextArea rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} disabled={!canEdit} />
      </Field>
      {canEdit && (
        <div className="flex items-center gap-3">
          <Button
            busy={busy}
            onClick={() =>
              void run(() =>
                saveServices(member.email, {
                  whatsappNumber: form.whatsappNumber.trim(),
                  whatsappVerified: form.whatsappVerified,
                  agentStatus: form.agentStatus,
                  // Only when edited by hand, so saving other fields never overwrites what the gateway reported.
                  ...(form.spent !== dollars(data.services?.agentSpentMinor ?? 0) ? { agentSpentMinor: Math.max(0, Math.round(Number(form.spent) * 100) || 0) } : {}),
                  agentBudgetMinor: Math.max(0, Math.round(Number(form.budget) * 100) || 0),
                  kumodaStatus: form.kumodaStatus,
                  kumodaUrl: form.kumodaUrl.trim(),
                  notes: form.notes,
                })
              )
            }
          >
            Save services
          </Button>
          {saved && <span className="text-[13.5px] text-[var(--pg-body)]">Saved.</span>}
        </div>
      )}

      <div>
        <h4 className="mb-2 text-[14px] font-bold">Repositories</h4>
        {data.repos.length === 0 ? (
          <p className="text-[13.5px] text-[var(--pg-body)]">None requested yet.</p>
        ) : (
          <ul className="space-y-2">
            {data.repos.map((repo) => (
              <li key={repo.id} className="flex flex-wrap items-center gap-3">
                <span className="font-medium">{repo.repo}</span>
                <Select value={repo.status} disabled={!canEdit || busy} onChange={(e) => void run(() => setRepoStatus(repo.id, e.target.value as RepoStatus))} className="max-w-[170px]">
                  <option value="requested">Requested</option>
                  <option value="connected">Connected</option>
                  <option value="removed">Removed</option>
                </Select>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h4 className="mb-2 text-[14px] font-bold">Projects</h4>
        {data.projects.length > 0 && (
          <ul className="mb-3 space-y-2">
            {data.projects.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 text-[14.5px]">
                <span className="font-medium">{p.name}</span>
                {p.domain && <span className="text-[var(--pg-body)]">{p.domain}</span>}
                <Select
                  value={p.status}
                  disabled={!canEdit || busy}
                  onChange={(e) => void run(() => saveProject({ ...p, status: e.target.value as ProjectStatus }))}
                  className="max-w-[150px]"
                >
                  <option value="deploying">Deploying</option>
                  <option value="running">Running</option>
                  <option value="degraded">Degraded</option>
                  <option value="down">Down</option>
                </Select>
                {p.uptime30d !== null && <Chip>{p.uptime30d}%</Chip>}
                {canEdit && (
                  <button className="text-[13px] underline underline-offset-2 cursor-pointer" onClick={() => void run(() => deleteProject(p.id))}>
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <TextInput value={project.name} onChange={(e) => setProject({ ...project, name: e.target.value })} placeholder="Project name" />
            <TextInput value={project.domain} onChange={(e) => setProject({ ...project, domain: e.target.value })} placeholder="domain.com" />
            <TextInput type="number" min={0} max={100} step="0.01" value={project.uptime30d} onChange={(e) => setProject({ ...project, uptime30d: e.target.value })} placeholder="Uptime %" />
            <TextInput type="url" value={project.consoleUrl} onChange={(e) => setProject({ ...project, consoleUrl: e.target.value })} placeholder="Console link" />
            <Button
              variant="ghost"
              busy={busy}
              onClick={() => {
                if (!project.name.trim()) return onError('Give the project a name.');
                void run(async () => {
                  await saveProject({
                    email: member.email,
                    name: project.name,
                    domain: project.domain,
                    status: project.status,
                    uptime30d: project.uptime30d === '' ? null : Number(project.uptime30d),
                    consoleUrl: project.consoleUrl,
                  });
                  setProject(EMPTY_PROJECT);
                });
              }}
            >
              Add project
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PartnerAdmin({ members, canEdit, onChanged }: { members: HubMemberRow[]; canEdit: boolean; onChanged: () => void }) {
  const [plans, setPlans] = useState<Map<string, PlanCode> | null>(null);
  const [applications, setApplications] = useState<PartnerApplication[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [planMap, apps] = await Promise.all([listMemberPlans(), listPartnerApplications()]);
      setPlans(planMap);
      setApplications(apps);
    } catch (err) {
      setPlans(new Map());
      setApplications([]);
      setMessage({ tone: 'error', text: errorMessage(err) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, members]);

  const run = async (success: string, action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      setMessage({ tone: 'success', text: success });
      await load();
      onChanged();
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const onError = useCallback((text: string) => setMessage({ tone: 'error', text }), []);

  if (!plans || !applications) return <Loading />;

  const partners = members.filter((member) => plans.get(member.email) === 'partner');
  const activePartners = partners.filter((member) => member.active).length;
  const newApplications = applications.filter((application) => application.status === 'new');

  return (
    <div className="mt-10 space-y-8">
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <section>
        <h2 className="mb-3 text-[16px] font-bold">
          Prestige applications <span className="font-normal text-[var(--pg-body)]">· {newApplications.length} new</span>
        </h2>
        {applications.length === 0 ? (
          <EmptyState title="No applications yet" body="People who apply for Prestige on the Prestige page appear here, newest first." />
        ) : (
          <ul className={`${CARD} divide-y divide-[var(--pg-line-soft)]`}>
            {applications.map((application) => (
              <li key={application.id} className="px-6 py-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{application.name}</span>
                    <a className="block truncate text-[13px] text-[var(--pg-body)] underline underline-offset-2" href={`mailto:${application.email}`}>{application.email}</a>
                  </span>
                  {application.phone && <span className="text-[13.5px] text-[var(--pg-body)]">{application.phone}</span>}
                  <span className="text-[13.5px] text-[var(--pg-body)]">{formatDate(application.createdAt)}</span>
                  <Chip tone={application.status === 'approved' ? 'accent' : 'neutral'}>{application.status === 'new' ? 'New' : application.status === 'approved' ? 'Approved' : 'Declined'}</Chip>
                </div>
                {(application.business || application.needs) && (
                  <p className="mt-2 whitespace-pre-line text-[14.5px] leading-[1.55]">
                    {application.business && <strong>{application.business}. </strong>}
                    {application.needs}
                  </p>
                )}
                {canEdit && application.status === 'new' && (
                  <div className="mt-3 flex gap-2">
                    <Button
                      busy={busy}
                      onClick={() => {
                        if (activePartners >= PARTNER_SEATS && !window.confirm(`You already have ${activePartners} active Partners (the cohort is ${PARTNER_SEATS}). Approve anyway?`)) return;
                        void run(`${application.email} now has Breadmaker Prestige for 30 days.`, async () => {
                          await setHubMember(application.email, 30, 'Breadmaker Prestige');
                          await setMemberPlan(application.email, 'partner');
                          await setApplicationStatus(application.id, 'approved');
                        });
                      }}
                    >
                      Approve, 30 days
                    </Button>
                    <Button variant="ghost" busy={busy} onClick={() => void run('Marked declined.', () => setApplicationStatus(application.id, 'declined'))}>
                      Decline
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-[16px] font-bold">
          Partners <span className="font-normal text-[var(--pg-body)]">· {activePartners} active of {PARTNER_SEATS} seats</span>
        </h2>
        {partners.length === 0 ? (
          <EmptyState title="No Prestige members yet" body="Approve an application, or open a member below and make them a Prestige member." />
        ) : (
          <ul className={`${CARD} divide-y divide-[var(--pg-line-soft)] overflow-hidden`}>
            {partners.map((member) => (
              <li key={member.email}>
                <button onClick={() => setOpen(open === member.email ? null : member.email)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-6 py-4 text-left cursor-pointer hover:bg-[var(--pg-alt)]/50">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{member.name || member.email}</span>
                    {member.name && <span className="block truncate text-[13px] text-[var(--pg-body)]">{member.email}</span>}
                  </span>
                  <Chip tone={member.active ? 'accent' : 'neutral'}>{member.active ? 'Active' : 'Ended'}</Chip>
                  <span className="text-[13.5px] text-[var(--pg-body)]">{open === member.email ? 'Close' : 'Manage services'}</span>
                </button>
                {open === member.email && <MemberPanel member={member} canEdit={canEdit} onError={onError} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      {canEdit && members.length > 0 && (
        <section>
          <h2 className="mb-3 text-[16px] font-bold">Change a member's plan</h2>
          <ul className={`${CARD} divide-y divide-[var(--pg-line-soft)]`}>
            {members.map((member) => {
              const plan = plans.get(member.email) ?? 'hub';
              return (
                <li key={member.email} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3">
                  <span className="min-w-0 flex-1 truncate">{member.name || member.email}</span>
                  <Select value={plan} disabled={busy} onChange={(e) => void run(`${member.email} is now ${e.target.value === 'partner' ? 'on Breadmaker Prestige' : 'on Breadmaker Community'}.`, () => setMemberPlan(member.email, e.target.value as PlanCode))} className="max-w-[170px]">
                    <option value="hub">Community</option>
                    <option value="partner">Breadmaker Prestige</option>
                  </Select>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
