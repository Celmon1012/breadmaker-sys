-- Agent definitions: an agent is data (name, model, instructions, rules, tools), not code.
--
-- The agent platform builds a Mastra agent from one of these rows each time it runs, so a team member can create,
-- test and change an agent in the studio without a deploy. Every save of the working copy can be published as a
-- numbered version, and any earlier version can be restored. Tools are chosen from the platform's registry only
-- (read-only tools in Phase 1); the platform rejects an id it does not know, so a definition cannot grant new power.
--
-- "live" means the agent can be run from the studio and called through the platform's API. It does not mean
-- customers can reach it: nothing here sends a message to anyone.
--
-- Also links each run to the definition it came from (agent_runs.agent_id), so a definition's page can show its own runs.
--
-- Run after migration 59. Safe to re-run.

create table if not exists breadmaker.agent_defs (
  id uuid primary key default gen_random_uuid(),
  tenant text not null default 'breadmaker' check (tenant in ('breadmaker', 'restart')),
  -- The name the team sees, and the name a customer would see.
  name text not null check (char_length(name) between 2 and 80),
  public_name text not null default '' check (char_length(public_name) <= 80),
  opening_message text not null default '' check (char_length(opening_message) <= 280),
  -- One line: what this agent is for.
  purpose text not null default '' check (char_length(purpose) <= 400),
  -- The template it started from (ops, support, followup, blank), for the record only.
  template text,
  model text not null default 'anthropic/claude-sonnet-5-5' check (model in ('anthropic/claude-opus-5-5', 'anthropic/claude-sonnet-5-5', 'anthropic/claude-haiku-5-5')),
  instructions text not null default '' check (char_length(instructions) <= 4000),
  -- Rules it always follows, one short line each. The platform adds them to the instructions.
  rules text[] not null default '{}',
  -- Tool ids from the platform's registry.
  tools text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'live', 'paused')),
  version integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_defs_tenant_idx on breadmaker.agent_defs (tenant, updated_at desc);

create table if not exists breadmaker.agent_def_versions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references breadmaker.agent_defs(id) on delete cascade,
  version integer not null,
  -- The definition as it was when published: name, public_name, opening_message, purpose, model, instructions, rules, tools.
  snapshot jsonb not null,
  note text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (agent_id, version)
);

alter table breadmaker.agent_runs
  add column if not exists agent_id uuid references breadmaker.agent_defs(id) on delete set null;
create index if not exists agent_runs_agent_id_idx on breadmaker.agent_runs (agent_id, started_at desc);

alter table breadmaker.agent_defs enable row level security;
alter table breadmaker.agent_def_versions enable row level security;

-- The whole team reads; owners and coaches write (the same people who edit content).
drop policy if exists "Team read agent defs" on breadmaker.agent_defs;
create policy "Team read agent defs" on breadmaker.agent_defs for select using (breadmaker.is_team_member());
drop policy if exists "Editors write agent defs" on breadmaker.agent_defs;
create policy "Editors write agent defs" on breadmaker.agent_defs for all
  using (breadmaker.can_edit_content()) with check (breadmaker.can_edit_content());

drop policy if exists "Team read agent versions" on breadmaker.agent_def_versions;
create policy "Team read agent versions" on breadmaker.agent_def_versions for select using (breadmaker.is_team_member());
drop policy if exists "Editors write agent versions" on breadmaker.agent_def_versions;
create policy "Editors write agent versions" on breadmaker.agent_def_versions for all
  using (breadmaker.can_edit_content()) with check (breadmaker.can_edit_content());

grant select, insert, update, delete on breadmaker.agent_defs to authenticated;
grant select, insert, update, delete on breadmaker.agent_def_versions to authenticated;
-- The platform reads definitions with the service role.
grant select on breadmaker.agent_defs to service_role;
grant select on breadmaker.agent_def_versions to service_role;
