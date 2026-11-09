-- Schedules: an agent that runs by itself, on a timetable.
--
-- One row is "run this agent with this question at this time". The agent platform checks the table every minute and
-- starts whatever is due, once. A scheduled run is an ordinary run (it appears in the runs list, costs count against the
-- daily cap, any change it wants goes to the approval queue). A stored agent runs its last published version on a
-- schedule, never an unpublished draft. Missed runs (the platform was down) are not made up: it runs once when it is back.
--
-- next_run_at is left empty when a schedule is created or changed; the platform fills it in. All times are UTC
-- (Lagos is UTC+1, so 07:00 UTC is 08:00 there).
--
-- Run after migration 61. Safe to re-run.

create table if not exists breadmaker.agent_schedules (
  id uuid primary key default gen_random_uuid(),
  -- Either a stored agent, or the built-in Ops agent. Exactly one.
  agent_id uuid references breadmaker.agent_defs(id) on delete cascade,
  builtin text check (builtin in ('ops')),
  name text not null check (char_length(name) between 2 and 80),
  -- What the agent is asked each time it runs.
  input text not null check (char_length(input) between 3 and 2000),
  frequency text not null check (frequency in ('hourly', 'daily', 'weekdays', 'weekly')),
  -- Time of day for daily, weekdays and weekly; the minute past the hour for hourly. Weekly runs on Mondays.
  hour integer not null default 7 check (hour between 0 and 23),
  minute integer not null default 0 check (minute between 0 and 59),
  enabled boolean not null default true,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_run_id uuid references breadmaker.agent_runs(id) on delete set null,
  -- Why the last attempt did not start a run (for example: the agent has no published version).
  last_error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((agent_id is not null) <> (builtin is not null))
);

create index if not exists agent_schedules_due_idx on breadmaker.agent_schedules (next_run_at) where enabled;

alter table breadmaker.agent_schedules enable row level security;

drop policy if exists "Team read agent schedules" on breadmaker.agent_schedules;
create policy "Team read agent schedules" on breadmaker.agent_schedules for select using (breadmaker.is_team_member());
drop policy if exists "Editors write agent schedules" on breadmaker.agent_schedules;
create policy "Editors write agent schedules" on breadmaker.agent_schedules for all
  using (breadmaker.can_edit_content()) with check (breadmaker.can_edit_content());

grant select, insert, update, delete on breadmaker.agent_schedules to authenticated;
grant select, update on breadmaker.agent_schedules to service_role;
