-- Agents for members: a Prestige Partner can build a few agents of their own.
--
-- A member's agent is an ordinary agent_defs row with owner_id set. It differs from a team agent in what it may do:
--   * no tools (the database refuses any), because tools are the team's connections and the team's servers;
--   * only the cheaper models;
--   * at most 5 agents per member, and only its own documents as knowledge (the platform limits those too).
-- The member sees and changes only their own agents, versions, knowledge sources and runs. The team can read
-- everything (to answer for what runs on the platform) but changes only team agents.
--
-- Who may build: Prestige Partners, decided in one place (can_build_agents) so it is easy to change later.
-- What it costs: the platform records each run's cost against the member and stops them at a monthly allowance
-- (MEMBER_AGENT_MONTHLY_USD on the platform). Nothing here sends a message to anyone.
--
-- Run after migration 66. Safe to re-run.

alter table breadmaker.agent_defs
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;
create index if not exists agent_defs_owner_idx on breadmaker.agent_defs (owner_id) where owner_id is not null;

alter table breadmaker.agent_runs
  add column if not exists owner_id uuid references auth.users(id) on delete set null;
create index if not exists agent_runs_owner_idx on breadmaker.agent_runs (owner_id, started_at desc) where owner_id is not null;

-- A member's agent can never be given tools, and may use only the lighter models.
alter table breadmaker.agent_defs drop constraint if exists agent_defs_member_limits;
alter table breadmaker.agent_defs
  add constraint agent_defs_member_limits check (
    owner_id is null
    or (cardinality(tools) = 0 and model in ('anthropic/claude-haiku-5-5', 'anthropic/claude-sonnet-5-5') and tenant = 'breadmaker')
  );

-- Who may build agents of their own. Today: a Prestige Partner whose membership is current.
create or replace function breadmaker.can_build_agents()
returns boolean
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select breadmaker.is_partner(breadmaker.my_email());
$$;
grant execute on function breadmaker.can_build_agents() to authenticated;

-- At most 5 agents per member.
create or replace function breadmaker.limit_member_agents()
returns trigger
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
begin
  if new.owner_id is not null and (select count(*) from breadmaker.agent_defs where owner_id = new.owner_id) >= 5 then
    raise exception 'You can have up to 5 agents. Delete one to make another.' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists agent_defs_member_limit on breadmaker.agent_defs;
create trigger agent_defs_member_limit before insert on breadmaker.agent_defs for each row execute function breadmaker.limit_member_agents();

-- A member may not hand their agent to someone else or turn it into a team agent.
create or replace function breadmaker.keep_agent_owner()
returns trigger
language plpgsql
as $$
begin
  if old.owner_id is not null and new.owner_id is distinct from old.owner_id then
    raise exception 'An agent cannot change owner.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists agent_defs_keep_owner on breadmaker.agent_defs;
create trigger agent_defs_keep_owner before update on breadmaker.agent_defs for each row execute function breadmaker.keep_agent_owner();

-- ---------------------------------------------------------------------------
-- Policies. The team keeps reading everything but writes only team agents (owner_id is null).

drop policy if exists "Editors write agent defs" on breadmaker.agent_defs;
create policy "Editors write agent defs" on breadmaker.agent_defs for all
  using (breadmaker.can_edit_content() and owner_id is null)
  with check (breadmaker.can_edit_content() and owner_id is null);

drop policy if exists "Owner manage own agent defs" on breadmaker.agent_defs;
create policy "Owner manage own agent defs" on breadmaker.agent_defs for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and breadmaker.can_build_agents());

drop policy if exists "Editors write agent versions" on breadmaker.agent_def_versions;
create policy "Editors write agent versions" on breadmaker.agent_def_versions for all
  using (breadmaker.can_edit_content() and exists (select 1 from breadmaker.agent_defs d where d.id = agent_id and d.owner_id is null))
  with check (breadmaker.can_edit_content() and exists (select 1 from breadmaker.agent_defs d where d.id = agent_id and d.owner_id is null));

drop policy if exists "Owner manage own agent versions" on breadmaker.agent_def_versions;
create policy "Owner manage own agent versions" on breadmaker.agent_def_versions for all
  using (exists (select 1 from breadmaker.agent_defs d where d.id = agent_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from breadmaker.agent_defs d where d.id = agent_id and d.owner_id = auth.uid()) and breadmaker.can_build_agents());

-- A member reads their own runs, and the knowledge sources of their own agents (and removes them).
drop policy if exists "Owner read own agent runs" on breadmaker.agent_runs;
create policy "Owner read own agent runs" on breadmaker.agent_runs for select using (owner_id = auth.uid());

drop policy if exists "Owner read own knowledge sources" on breadmaker.agent_knowledge_sources;
create policy "Owner read own knowledge sources" on breadmaker.agent_knowledge_sources for select
  using (exists (select 1 from breadmaker.agent_defs d where d.id = agent_id and d.owner_id = auth.uid()));
drop policy if exists "Owner remove own knowledge sources" on breadmaker.agent_knowledge_sources;
create policy "Owner remove own knowledge sources" on breadmaker.agent_knowledge_sources for delete
  using (exists (select 1 from breadmaker.agent_defs d where d.id = agent_id and d.owner_id = auth.uid()));

grant select on breadmaker.agent_defs to service_role;
grant select, insert, update, delete on breadmaker.agent_defs to authenticated;
