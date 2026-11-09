-- Partner agent usage: the gateway reports what each member's developer agent has spent, the budget
-- resets every 30 days, and the member is warned at 80% and when the budget is reached. Safe to re-run.
--
-- The budget itself (the $20 a month) is enforced by the LLM gateway. This is the record the Hub shows,
-- the reset clock, and the alert state, so one person never gets the same warning twice in a period.

-- A fourth agent state: the budget is used up, so the agent waits for the next period.
alter table breadmaker.member_services drop constraint if exists member_services_agent_status_check;
alter table breadmaker.member_services
  add constraint member_services_agent_status_check check (agent_status in ('none', 'provisioning', 'active', 'paused', 'limit'));

alter table breadmaker.member_services
  add column if not exists usage_alert_80_for date,
  add column if not exists usage_alert_100_for date,
  add column if not exists last_usage_at timestamptz;

-- Every report from the gateway, for the audit trail.
create table if not exists breadmaker.agent_usage_log (
  id bigint generated always as identity primary key,
  email text not null,
  mode text not null check (mode in ('total', 'add')),
  amount_minor integer not null check (amount_minor >= 0),
  spent_after_minor integer not null,
  recorded_at timestamptz not null default now()
);
create index if not exists agent_usage_log_email_idx on breadmaker.agent_usage_log (email, recorded_at desc);

alter table breadmaker.agent_usage_log enable row level security;
drop policy if exists "Team read usage log" on breadmaker.agent_usage_log;
create policy "Team read usage log" on breadmaker.agent_usage_log for select to authenticated using (breadmaker.is_team_member());
grant select on breadmaker.agent_usage_log to authenticated;
grant select, insert on breadmaker.agent_usage_log to service_role;

-- ---------------------------------------------------------------------------
-- Gateway reports spend. mode "total" sets the spend for the current period; "add" adds to it.
-- Returns the new spend in cents, or null when the email is not a Partner with services set up.

create or replace function breadmaker.record_agent_usage(for_email text, amount_minor integer, usage_mode text default 'total')
returns integer
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
declare
  who text := lower(trim(for_email));
  after_minor integer;
begin
  if usage_mode not in ('total', 'add') then
    raise exception 'mode must be total or add' using errcode = '22023';
  end if;
  if amount_minor is null or amount_minor < 0 then
    raise exception 'amount must be zero or more' using errcode = '22023';
  end if;

  update breadmaker.member_services
  set agent_spent_minor = case when usage_mode = 'add' then agent_spent_minor + amount_minor else amount_minor end,
      last_usage_at = now(),
      updated_at = now()
  where email = who
  returning agent_spent_minor into after_minor;

  if after_minor is null then
    return null;
  end if;

  insert into breadmaker.agent_usage_log (email, mode, amount_minor, spent_after_minor) values (who, usage_mode, amount_minor, after_minor);
  return after_minor;
end;
$$;

-- ---------------------------------------------------------------------------
-- New period: every 30 days the spend goes back to zero, alerts can fire again, and an agent that had
-- stopped at its limit starts working again. Returns how many members were reset.

create or replace function breadmaker.roll_budget_periods()
returns integer
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
declare
  rolled integer;
begin
  with due as (
    select email,
           budget_period_start + (((current_date - budget_period_start) / 30) * 30) as new_start
    from breadmaker.member_services
    where budget_period_start + 30 <= current_date
  )
  update breadmaker.member_services s
  set agent_spent_minor = 0,
      budget_period_start = due.new_start,
      usage_alert_80_for = null,
      usage_alert_100_for = null,
      agent_status = case when s.agent_status = 'limit' then 'active' else s.agent_status end,
      updated_at = now()
  from due
  where s.email = due.email;
  get diagnostics rolled = row_count;
  return rolled;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who needs a warning right now. "limit" when the budget is used up, "warn80" at 80% and over.

create or replace function breadmaker.usage_alerts()
returns table (email text, whatsapp_number text, spent_minor integer, budget_minor integer, kind text, resets_on date)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select s.email,
         case when s.whatsapp_verified_at is not null then s.whatsapp_number end,
         s.agent_spent_minor,
         s.agent_budget_minor,
         case when s.agent_spent_minor >= s.agent_budget_minor then 'limit' else 'warn80' end,
         s.budget_period_start + 30
  from breadmaker.member_services s
  where s.agent_budget_minor > 0
    and breadmaker.is_partner(s.email)
    and (
      (s.agent_spent_minor >= s.agent_budget_minor and s.usage_alert_100_for is distinct from s.budget_period_start)
      or (s.agent_spent_minor * 100 >= s.agent_budget_minor * 80 and s.agent_spent_minor < s.agent_budget_minor
          and s.usage_alert_80_for is distinct from s.budget_period_start)
    );
$$;

-- Marks a warning as sent for this period. Reaching the limit also moves an active agent to "limit".
create or replace function breadmaker.mark_usage_alert(for_email text, for_kind text)
returns void
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
begin
  if for_kind = 'limit' then
    update breadmaker.member_services
    set usage_alert_80_for = budget_period_start,
        usage_alert_100_for = budget_period_start,
        agent_status = case when agent_status = 'active' then 'limit' else agent_status end,
        updated_at = now()
    where email = lower(trim(for_email));
  else
    update breadmaker.member_services
    set usage_alert_80_for = budget_period_start, updated_at = now()
    where email = lower(trim(for_email));
  end if;
end;
$$;

revoke execute on function breadmaker.record_agent_usage(text, integer, text) from public, anon, authenticated;
revoke execute on function breadmaker.roll_budget_periods() from public, anon, authenticated;
revoke execute on function breadmaker.usage_alerts() from public, anon, authenticated;
revoke execute on function breadmaker.mark_usage_alert(text, text) from public, anon, authenticated;
grant execute on function breadmaker.record_agent_usage(text, integer, text) to service_role;
grant execute on function breadmaker.roll_budget_periods() to service_role;
grant execute on function breadmaker.usage_alerts() to service_role;
grant execute on function breadmaker.mark_usage_alert(text, text) to service_role;
