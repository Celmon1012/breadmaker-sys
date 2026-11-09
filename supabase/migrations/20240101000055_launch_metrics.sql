-- Launch measurement: the numbers that show whether the funnel works.
--
-- Most of the funnel is already stored: Leak Test completions (leak_test_submissions), report purchases
-- (payments with program = 'leaktest'), applications and paid enrolments (payments for any other program
-- except the Hub membership). What is not stored is the top of each funnel: who started the Leak Test and
-- who opened an application form. site_events keeps those, one row per visitor session per event per day.
--
-- track_event() is the only way in: anon callers can add one of a fixed list of events and read nothing back.
-- launch_metrics() is the only way out: team members only, current period against the one before it.
-- Run as supabase_admin. Safe to re-run.

create table if not exists breadmaker.site_events (
  id bigserial primary key,
  name text not null check (name in ('leaktest_start', 'foundry_apply_start', 'launchpad_apply_start')),
  session_id text not null check (length(session_id) between 8 and 64),
  day date not null default ((now() at time zone 'utc')::date),
  created_at timestamptz not null default now(),
  unique (name, session_id, day)
);

create index if not exists site_events_name_created_idx on breadmaker.site_events (name, created_at desc);

alter table breadmaker.site_events enable row level security;
revoke all on breadmaker.site_events from anon, authenticated;
grant all on breadmaker.site_events to service_role;

-- A visitor counts once per event per day, however many times they press the button. Unknown names and
-- malformed sessions are ignored quietly: a tracking call must never break a page.
create or replace function breadmaker.track_event(p_name text, p_session text)
returns void
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
begin
  if p_name is null or p_session is null then
    return;
  end if;
  if p_name not in ('leaktest_start', 'foundry_apply_start', 'launchpad_apply_start') then
    return;
  end if;
  if length(p_session) < 8 or length(p_session) > 64 then
    return;
  end if;
  insert into breadmaker.site_events (name, session_id) values (p_name, p_session)
  on conflict (name, session_id, day) do nothing;
end;
$$;

revoke all on function breadmaker.track_event(text, text) from public;
grant execute on function breadmaker.track_event(text, text) to anon, authenticated;

-- One row per metric: the last p_days days, and the p_days before that for comparison.
create or replace function breadmaker.launch_metrics(p_days integer default 30)
returns table (metric text, current_count bigint, previous_count bigint)
language plpgsql
stable
security definer
set search_path = breadmaker, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_from timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
  v_prev timestamptz := now() - make_interval(days => 2 * greatest(1, least(coalesce(p_days, 30), 365)));
begin
  if not breadmaker.is_team_member() then
    raise exception 'Only the team can read launch metrics.' using errcode = '42501';
  end if;

  return query
  with events as (
    select name as metric, created_at as at from breadmaker.site_events
    union all select 'leaktest_complete', created_at from breadmaker.leak_test_submissions
    union all select 'report_purchase', coalesce(paid_at, created_at) from breadmaker.payments
      where status = 'successful' and program = 'leaktest'
    union all select 'application_foundry', created_at from breadmaker.applications where program = 'foundry'
    union all select 'application_launchpad', created_at from breadmaker.applications where program = 'launchpad'
    union all select 'paid_enrolment', coalesce(paid_at, created_at) from breadmaker.payments
      where status = 'successful' and program not in ('leaktest', 'membership')
  ),
  names (metric) as (
    values ('leaktest_start'), ('leaktest_complete'), ('report_purchase'),
           ('foundry_apply_start'), ('application_foundry'),
           ('launchpad_apply_start'), ('application_launchpad'),
           ('paid_enrolment')
  )
  select n.metric,
         count(*) filter (where e.at >= v_from and e.at <= v_now)::bigint,
         count(*) filter (where e.at >= v_prev and e.at < v_from)::bigint
  from names n
  left join events e on e.metric = n.metric
  group by n.metric;
end;
$$;

revoke all on function breadmaker.launch_metrics(integer) from public, anon;
grant execute on function breadmaker.launch_metrics(integer) to authenticated;
