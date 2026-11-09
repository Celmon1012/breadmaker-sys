-- Agent runs: the record of everything an agent did, for the agent platform (agent-platform/).
--
-- Every run of an agent writes one row: who asked, what it was asked, what it did (each tool call, in order), what it
-- answered, how long it took, and what it cost. The Runs and Metrics views in the studio read this table. Nothing
-- here lets an agent act: it is a log. The platform writes it with the service role; the team reads it.
--
-- tenant says whose business the run was for, so Restart's agents can use the same table later.
--
-- Run after migration 56. Safe to re-run.

create table if not exists breadmaker.agent_runs (
  id uuid primary key default gen_random_uuid(),
  tenant text not null default 'breadmaker' check (tenant in ('breadmaker', 'restart')),
  agent text not null,
  -- console: someone asked in the studio. schedule: a timed sweep. api: another system called it.
  trigger text not null default 'console' check (trigger in ('console', 'schedule', 'api')),
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  input text not null,
  output text,
  -- One entry per tool call: { name, input, output, ms, error }. Outputs are trimmed before they are stored.
  tool_calls jsonb not null default '[]'::jsonb,
  steps integer not null default 0,
  model text,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  -- Estimated from the model's list price. A guide, not an invoice.
  cost_usd numeric(10, 5) not null default 0,
  duration_ms integer,
  error text,
  requested_by uuid references auth.users(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists agent_runs_started_idx on breadmaker.agent_runs (started_at desc);
create index if not exists agent_runs_agent_idx on breadmaker.agent_runs (agent, started_at desc);

alter table breadmaker.agent_runs enable row level security;

-- Only the team reads runs: they can contain client names and site details. Nobody writes through the API;
-- the platform uses the service role, which bypasses these policies.
drop policy if exists "Team read agent runs" on breadmaker.agent_runs;
create policy "Team read agent runs" on breadmaker.agent_runs
  for select using (breadmaker.is_team_member());

grant select on breadmaker.agent_runs to authenticated;
-- The platform writes with the service role, which needs its own table privilege (RLS is bypassed, grants are not).
grant select, insert, update on breadmaker.agent_runs to service_role;
