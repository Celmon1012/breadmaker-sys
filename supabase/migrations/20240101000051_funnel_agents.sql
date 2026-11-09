-- Agents: the follow-up and management workers a member attaches to a funnel.
--
-- Each row is one agent built from a blueprint (qualifier, nurturer, educator, manager) for one funnel. The member
-- works through the blueprint's build steps in the Hub; steps_done records which are finished. Nothing here sends
-- a message: live replies come from the agent runtime (Kumoda + n8n), which is attached to a ready agent later.
--
-- Also lets a scorecard funnel's enquiries be read by segment: funnel_leads.payload already carries score and
-- segment (see funnel-lead), so no change is needed there.
--
-- Run after migration 50. Safe to re-run.

create table if not exists breadmaker.funnel_agents (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references breadmaker.build_jobs(id) on delete cascade,
  blueprint text not null check (blueprint in ('qualifier', 'nurturer', 'educator', 'manager')),
  -- draft: no steps done. testing: some done. ready: every step done, waiting for the runtime.
  status text not null default 'draft' check (status in ('draft', 'testing', 'ready')),
  steps_done text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, blueprint)
);

create index if not exists funnel_agents_job_idx on breadmaker.funnel_agents (job_id);

alter table breadmaker.funnel_agents enable row level security;

-- A member manages the agents of their own funnels, and only those.
drop policy if exists "Owner manage funnel agents" on breadmaker.funnel_agents;
create policy "Owner manage funnel agents" on breadmaker.funnel_agents
  for all
  using (
    exists (
      select 1 from breadmaker.build_jobs j
      join breadmaker.applications a on a.id = j.application_id
      where j.id = funnel_agents.job_id and a.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from breadmaker.build_jobs j
      join breadmaker.applications a on a.id = j.application_id
      where j.id = funnel_agents.job_id and a.user_id = auth.uid()
    )
  );

drop policy if exists "Team read funnel agents" on breadmaker.funnel_agents;
create policy "Team read funnel agents" on breadmaker.funnel_agents
  for select using (breadmaker.is_team_member());

grant select, insert, update, delete on breadmaker.funnel_agents to authenticated;
