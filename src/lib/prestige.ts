import { supabase } from './supabase';
import { reportTouch } from './attribution';

/**
 * Breadmaker Prestige has two tiers. Community is the monthly membership. Partner is the premium,
 * capped tier: a WhatsApp developer agent, hosting on Restart servers, a Kumoda account and priority support.
 */

export type PlanCode = 'hub' | 'partner';

/** What Partner costs per month, in US dollars. The page shows this; billing for Partner is invoiced by the team for now. */
export const PARTNER_PRICE_USD = 300;
export const PARTNER_SEATS = 5;
export const PARTNER_AGENT_BUDGET_USD = 20;
/** The uptime target in the Partner service level. */
export const PARTNER_UPTIME = '99.5%';

/** The day the budget next starts over, as a Date. */
export const budgetResetsOn = (periodStart: string) => {
  const date = new Date(`${periodStart}T00:00:00`);
  date.setDate(date.getDate() + BUDGET_PERIOD_DAYS);
  return date;
};

/** limit: the monthly budget is used up, so the agent waits for the next period. */
export type AgentStatus = 'none' | 'provisioning' | 'active' | 'paused' | 'limit';

/** The budget starts over every 30 days. */
export const BUDGET_PERIOD_DAYS = 30;
export type KumodaStatus = 'none' | 'requested' | 'active' | 'suspended';
export type RepoStatus = 'requested' | 'connected' | 'removed';
export type ProjectStatus = 'deploying' | 'running' | 'degraded' | 'down';

export interface MemberServices {
  email: string;
  whatsappNumber: string;
  whatsappVerified: boolean;
  agentStatus: AgentStatus;
  agentBudgetMinor: number;
  agentSpentMinor: number;
  /** First day of the current budget period (YYYY-MM-DD). */
  budgetPeriodStart: string;
  /** When the gateway last reported spend. */
  lastUsageAt: string | null;
  kumodaStatus: KumodaStatus;
  kumodaUrl: string;
  notes: string;
}

export interface MemberRepo {
  id: string;
  email: string;
  repo: string;
  status: RepoStatus;
}

export interface MemberProject {
  id: string;
  email: string;
  name: string;
  domain: string;
  status: ProjectStatus;
  uptime30d: number | null;
  consoleUrl: string;
}

export interface PartnerApplication {
  id: string;
  name: string;
  email: string;
  phone: string;
  business: string;
  needs: string;
  status: 'new' | 'approved' | 'declined';
  createdAt: string;
}

const toServices = (row: any): MemberServices => ({
  email: row.email,
  whatsappNumber: row.whatsapp_number ?? '',
  whatsappVerified: !!row.whatsapp_verified_at,
  agentStatus: row.agent_status,
  agentBudgetMinor: row.agent_budget_minor,
  agentSpentMinor: row.agent_spent_minor,
  budgetPeriodStart: row.budget_period_start,
  lastUsageAt: row.last_usage_at ?? null,
  kumodaStatus: row.kumoda_status,
  kumodaUrl: row.kumoda_url ?? '',
  notes: row.notes ?? '',
});

const toRepo = (row: any): MemberRepo => ({ id: row.id, email: row.email, repo: row.repo, status: row.status });

const toProject = (row: any): MemberProject => ({
  id: row.id,
  email: row.email,
  name: row.name,
  domain: row.domain ?? '',
  status: row.status,
  uptime30d: row.uptime_30d === null || row.uptime_30d === undefined ? null : Number(row.uptime_30d),
  consoleUrl: row.console_url ?? '',
});

const toApplication = (row: any): PartnerApplication => ({
  id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone ?? '',
  business: row.business ?? '',
  needs: row.needs ?? '',
  status: row.status,
  createdAt: row.created_at,
});

const fail = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

/** The signed-in person's active plan, or null when they are not a member. */
export async function getMyPlan(): Promise<PlanCode | null> {
  const { data, error } = await supabase.rpc('my_plan');
  if (error) throw new Error(error.message);
  return data === 'partner' || data === 'hub' ? data : null;
}

export async function getMyServices(): Promise<MemberServices | null> {
  const { data, error } = await supabase.from('member_services').select('*').maybeSingle();
  fail(error);
  return data ? toServices(data) : null;
}

export async function listMyRepos(): Promise<MemberRepo[]> {
  const { data, error } = await supabase.from('member_repos').select('*').neq('status', 'removed').order('created_at');
  fail(error);
  return (data ?? []).map(toRepo);
}

export async function listMyProjects(): Promise<MemberProject[]> {
  const { data, error } = await supabase.from('member_projects').select('*').order('name');
  fail(error);
  return (data ?? []).map(toProject);
}

export async function setMyWhatsapp(number: string) {
  const { error } = await supabase.rpc('set_my_whatsapp', { new_number: number });
  fail(error);
}

export async function requestRepo(repo: string) {
  const { error } = await supabase.rpc('request_repo', { new_repo: repo });
  fail(error);
}

/** Anyone can apply for Partner; the team reviews in Studio. */
export async function submitPartnerApplication(input: { name: string; email: string; phone: string; business: string; needs: string }) {
  const { error } = await supabase.from('partner_applications').insert({
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone.trim(),
    business: input.business.trim(),
    needs: input.needs.trim(),
  });
  fail(error);
  reportTouch(input.email);
}

// ---- Team (Studio) ----

export async function listPartnerApplications(): Promise<PartnerApplication[]> {
  const { data, error } = await supabase.from('partner_applications').select('*').order('created_at', { ascending: false }).limit(200);
  fail(error);
  return (data ?? []).map(toApplication);
}

export async function setApplicationStatus(id: string, status: 'new' | 'approved' | 'declined') {
  const { error } = await supabase.from('partner_applications').update({ status }).eq('id', id);
  fail(error);
}

/** Which members are on which plan (email to plan code). */
export async function listMemberPlans(): Promise<Map<string, PlanCode>> {
  const { data, error } = await supabase.from('memberships').select('email, plan_code');
  fail(error);
  return new Map((data ?? []).map((row: any) => [row.email as string, row.plan_code as PlanCode]));
}

export async function setMemberPlan(email: string, plan: PlanCode) {
  const { error } = await supabase.rpc('set_member_plan', { for_email: email, new_plan: plan });
  fail(error);
}

export async function getServicesFor(email: string): Promise<{ services: MemberServices | null; repos: MemberRepo[]; projects: MemberProject[] }> {
  const [services, repos, projects] = await Promise.all([
    supabase.from('member_services').select('*').eq('email', email).maybeSingle(),
    supabase.from('member_repos').select('*').eq('email', email).neq('status', 'removed').order('created_at'),
    supabase.from('member_projects').select('*').eq('email', email).order('name'),
  ]);
  fail(services.error);
  fail(repos.error);
  fail(projects.error);
  return {
    services: services.data ? toServices(services.data) : null,
    repos: (repos.data ?? []).map(toRepo),
    projects: (projects.data ?? []).map(toProject),
  };
}

export async function saveServices(email: string, patch: Partial<Omit<MemberServices, 'email'>> & { whatsappVerified?: boolean }) {
  const row: Record<string, unknown> = { email, updated_at: new Date().toISOString() };
  if (patch.whatsappNumber !== undefined) row.whatsapp_number = patch.whatsappNumber || null;
  if (patch.whatsappVerified !== undefined) row.whatsapp_verified_at = patch.whatsappVerified ? new Date().toISOString() : null;
  if (patch.agentStatus !== undefined) row.agent_status = patch.agentStatus;
  if (patch.agentBudgetMinor !== undefined) row.agent_budget_minor = patch.agentBudgetMinor;
  if (patch.agentSpentMinor !== undefined) row.agent_spent_minor = patch.agentSpentMinor;
  if (patch.kumodaStatus !== undefined) row.kumoda_status = patch.kumodaStatus;
  if (patch.kumodaUrl !== undefined) row.kumoda_url = patch.kumodaUrl;
  if (patch.notes !== undefined) row.notes = patch.notes;
  const { error } = await supabase.from('member_services').upsert(row);
  fail(error);
}

export async function setRepoStatus(id: string, status: RepoStatus) {
  const { error } = await supabase.from('member_repos').update({ status }).eq('id', id);
  fail(error);
}

export async function saveProject(project: { id?: string; email: string; name: string; domain: string; status: ProjectStatus; uptime30d: number | null; consoleUrl: string }) {
  const row = {
    ...(project.id ? { id: project.id } : {}),
    email: project.email,
    name: project.name.trim(),
    domain: project.domain.trim(),
    status: project.status,
    uptime_30d: project.uptime30d,
    console_url: project.consoleUrl.trim(),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('member_projects').upsert(row);
  fail(error);
}

export async function deleteProject(id: string) {
  const { error } = await supabase.from('member_projects').delete().eq('id', id);
  fail(error);
}
