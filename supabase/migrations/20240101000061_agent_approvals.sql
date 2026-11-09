-- Approvals: an agent may ask for something that changes the world, and a person decides.
--
-- Tools carry a risk tier. Read tools just run. A write tool (restart or redeploy an app) does not run when the agent
-- calls it: the platform stores the request here and tells the agent it is waiting for a person. An owner or coach
-- approves or rejects it in the studio; only an approval makes the platform perform the action, once, and the result
-- is written back to the same row. The request is the audit trail: who asked (which agent, which run), what exactly,
-- who decided and when, and what happened.
--
-- The platform writes this table with the service role. The team reads it through row level security; nobody
-- changes it through the API.
--
-- Run after migration 60. Safe to re-run.

create table if not exists breadmaker.agent_approvals (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references breadmaker.agent_runs(id) on delete set null,
  agent_id uuid references breadmaker.agent_defs(id) on delete set null,
  agent_name text not null default '',
  tool text not null,
  -- The exact input the action will run with. It cannot be edited after the request is made.
  input jsonb not null default '{}'::jsonb,
  -- One plain sentence of what approving does.
  summary text not null,
  status text not null default 'pending' check (status in ('pending', 'rejected', 'approved', 'executed', 'failed')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  -- What the action returned, or why it failed.
  result text,
  created_at timestamptz not null default now()
);

create index if not exists agent_approvals_status_idx on breadmaker.agent_approvals (status, created_at desc);

alter table breadmaker.agent_approvals enable row level security;

drop policy if exists "Team read agent approvals" on breadmaker.agent_approvals;
create policy "Team read agent approvals" on breadmaker.agent_approvals for select using (breadmaker.is_team_member());

grant select on breadmaker.agent_approvals to authenticated;
grant select, insert, update on breadmaker.agent_approvals to service_role;
