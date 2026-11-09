-- Evals: questions with expected behaviour, run against an agent before it is published.
--
-- A test case is a question and what a good answer does: it mentions certain words, avoids others, calls (or does not
-- call) certain tools, and optionally passes a plain-language judgement ("cites its source", "never states a refund
-- amount"). The platform runs every case against the agent's working copy and records, for each, whether it passed and
-- why not. Running tests costs model calls like any run, and is limited to owners and coaches.
--
-- The platform writes runs with the service role; owners and coaches write cases; the team reads both.
--
-- Run after migration 65. Safe to re-run.

create table if not exists breadmaker.agent_eval_cases (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references breadmaker.agent_defs(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  input text not null check (char_length(input) between 2 and 2000),
  -- { contains: [], notContains: [], tools: [], noTools: [], judge: "" }
  expect jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists agent_eval_cases_agent_idx on breadmaker.agent_eval_cases (agent_id, created_at);

create table if not exists breadmaker.agent_eval_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references breadmaker.agent_defs(id) on delete cascade,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  total integer not null default 0,
  passed integer not null default 0,
  failed integer not null default 0,
  cost_usd numeric(10, 5) not null default 0,
  -- [{ caseId, name, passed, reasons: [], output, tools: [], costUsd }]
  results jsonb not null default '[]'::jsonb,
  error text,
  requested_by uuid references auth.users(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists agent_eval_runs_agent_idx on breadmaker.agent_eval_runs (agent_id, started_at desc);

alter table breadmaker.agent_eval_cases enable row level security;
alter table breadmaker.agent_eval_runs enable row level security;

drop policy if exists "Team read eval cases" on breadmaker.agent_eval_cases;
create policy "Team read eval cases" on breadmaker.agent_eval_cases for select using (breadmaker.is_team_member());
drop policy if exists "Editors write eval cases" on breadmaker.agent_eval_cases;
create policy "Editors write eval cases" on breadmaker.agent_eval_cases for all
  using (breadmaker.can_edit_content()) with check (breadmaker.can_edit_content());

drop policy if exists "Team read eval runs" on breadmaker.agent_eval_runs;
create policy "Team read eval runs" on breadmaker.agent_eval_runs for select using (breadmaker.is_team_member());

grant select, insert, update, delete on breadmaker.agent_eval_cases to authenticated;
grant select on breadmaker.agent_eval_runs to authenticated;
grant select on breadmaker.agent_eval_cases to service_role;
grant select, insert, update on breadmaker.agent_eval_runs to service_role;
