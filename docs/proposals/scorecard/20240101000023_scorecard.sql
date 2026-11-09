-- The Day-30 Scorecard: a public 20-check self-assessment, its gap report and its fixes.
--
-- Twenty checks in four weeks: the same items the Foundry curriculum grades against
-- (docs/ACADEMY-CURRICULUM.md). A visitor scores themselves in about three minutes and sees the
-- number immediately; the email is traded for the gap report, which lists the failed checks in
-- order with the fix for each.
--
--   * The questions live in src/lib/scorecard.ts (one source of truth, synced to the edge runtime by
--     npm run sync:questions). This migration holds the fixes, which the team edits without a deploy.
--   * scorecard_submissions stores one row per attempt, with the score recomputed in the database,
--     so a lying browser is ignored.
--   * get_scorecard_result() and get_scorecard_gaps() need the submission's secret token.
--   * Re-scoring is a new row, so day-0 versus day-30 is measurable (scorecard_progress()).
--   * Nothing here is paid: the scorecard is a lead magnet. The paid products are the kits and the
--     programs, which are untouched by this migration.
--
-- Apply by name:  node run-migrations.js 20240101000023_scorecard.sql
-- Safe to re-run: every statement is guarded, and an edited fix is never overwritten.
--
-- Naming note: the check number is always called check_position, never position. "position" is a
-- col_name_keyword in Postgres, so it is legal as a table column but illegal as a function
-- parameter or OUT name: "returns table (position integer, ...)" fails with 42601.

-- ---------------------------------------------------------------------------
-- Tables

-- What to do about each failed check. One row per check position (1-20).
create table if not exists breadmaker.scorecard_fixes (
  check_position integer primary key check (check_position between 1 and 20),
  fix text not null default '',
  fix_label text not null default '',
  fix_route text not null default '',
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

-- One row per attempt. Anyone may add a row through submit_scorecard(); nobody may read the table.
create table if not exists breadmaker.scorecard_submissions (
  id uuid primary key default gen_random_uuid(),
  -- Secret that proves a caller owns this attempt. Never listed publicly.
  access_token uuid not null default gen_random_uuid(),
  name text not null default '',
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  whatsapp text not null default '',
  company text not null default '',
  -- Unscored segmentation: role, stage, technical comfort, source page.
  profile jsonb not null default '{}'::jsonb,
  -- 1 for a first check, 2 for a re-score, and so on.
  attempt integer not null default 1 check (attempt between 1 and 99),
  -- Twenty yes/no answers, in check order.
  checks boolean[] not null check (array_length(checks, 1) = 20),
  yes_count integer not null check (yes_count between 0 and 20),
  band text not null check (band in ('not-started', 'building', 'almost', 'operating')),
  weakest_week integer not null check (weakest_week between 1 and 4),
  -- The positions answered "not yet", for the gap report and the aggregate stats.
  failed integer[] not null default '{}',
  consent boolean not null check (consent),
  consented_at timestamptz not null default now(),
  source text not null default 'scorecard',
  -- Set when the gap-report email and the lead webhook went out, so a retry never sends twice.
  emailed_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz not null default now()
);

-- For a database that already has the table from an earlier run of this file.
alter table breadmaker.scorecard_submissions add column if not exists whatsapp text not null default '';
alter table breadmaker.scorecard_submissions add column if not exists company text not null default '';
alter table breadmaker.scorecard_submissions add column if not exists profile jsonb not null default '{}'::jsonb;
alter table breadmaker.scorecard_submissions add column if not exists source text not null default 'scorecard';
alter table breadmaker.scorecard_submissions add column if not exists emailed_at timestamptz;
alter table breadmaker.scorecard_submissions add column if not exists notified_at timestamptz;

create index if not exists scorecard_submissions_email_idx on breadmaker.scorecard_submissions (lower(email));
create index if not exists scorecard_submissions_created_idx on breadmaker.scorecard_submissions (created_at desc);
create index if not exists scorecard_submissions_band_idx on breadmaker.scorecard_submissions (band);

-- The Foundry application can carry the applicant's score, so the team sees fit before the call.
-- Guarded, so this file still runs on a database that has not applied migration 15 yet.
do $$
begin
  if to_regclass('breadmaker.applications') is not null then
    alter table breadmaker.applications
      add column if not exists scorecard_id uuid references breadmaker.scorecard_submissions(id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Row level security: the team reads, nobody else does.

alter table breadmaker.scorecard_fixes enable row level security;
alter table breadmaker.scorecard_submissions enable row level security;

drop policy if exists "Team manage scorecard fixes" on breadmaker.scorecard_fixes;
create policy "Team manage scorecard fixes" on breadmaker.scorecard_fixes
  for all using (breadmaker.is_team_member()) with check (breadmaker.can_edit_content());

drop policy if exists "Team read scorecard submissions" on breadmaker.scorecard_submissions;
create policy "Team read scorecard submissions" on breadmaker.scorecard_submissions
  for select using (breadmaker.is_team_member());

grant select, insert, update, delete on breadmaker.scorecard_fixes to authenticated;
grant select on breadmaker.scorecard_submissions to authenticated;
grant all on breadmaker.scorecard_fixes to service_role;
grant all on breadmaker.scorecard_submissions to service_role;

-- ---------------------------------------------------------------------------
-- The score, the band and the weakest week, in one place.

create or replace function breadmaker.scorecard_score(p_checks boolean[])
returns table (yes_count integer, band text, weakest_week integer, failed integer[])
language plpgsql
immutable
as $$
declare
  v_yes integer := 0;
  v_failed integer[] := '{}'::integer[];
  v_week_fails integer[] := array[0, 0, 0, 0];
  -- Checks per week. Week 4 has eight, so weeks are compared by their share of failures, not the count.
  v_week_size integer[] := array[4, 4, 4, 8];
  v_week integer;
  v_best integer := 1;
  i integer;
begin
  if p_checks is null or array_length(p_checks, 1) is distinct from 20 then
    raise exception 'The scorecard needs all twenty checks.' using errcode = '22023';
  end if;

  for i in 1..20 loop
    if coalesce(p_checks[i], false) then
      v_yes := v_yes + 1;
    else
      v_failed := v_failed || i;
      -- The four weeks: checks 1-4, 5-8, 9-12, 13-20. The same grouping as the curriculum.
      v_week := case when i <= 4 then 1 when i <= 8 then 2 when i <= 12 then 3 else 4 end;
      v_week_fails[v_week] := v_week_fails[v_week] + 1;
    end if;
  end loop;

  for i in 2..4 loop
    if v_week_fails[i]::numeric / v_week_size[i] > v_week_fails[v_best]::numeric / v_week_size[v_best] then
      v_best := i;
    end if;
  end loop;

  return query select
    v_yes,
    case when v_yes <= 7 then 'not-started'
         when v_yes <= 14 then 'building'
         when v_yes <= 18 then 'almost'
         else 'operating' end,
    v_best,
    v_failed;
end;
$$;

-- Internal: the public RPCs call it, nobody else may.
revoke all on function breadmaker.scorecard_score(boolean[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public: submit a score, get the token back.

create or replace function breadmaker.submit_scorecard(
  p_email text,
  p_name text default '',
  p_company text default '',
  p_profile jsonb default '{}'::jsonb,
  p_checks boolean[] default null,
  p_consent boolean default false,
  p_whatsapp text default '',
  p_source text default 'scorecard'
)
returns table (id uuid, access_token uuid, attempt integer, yes_count integer, band text, weakest_week integer, failed integer[])
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
declare
  v_score record;
  v_id uuid;
  v_token uuid;
  v_attempt integer;
  v_recent integer;
begin
  if p_email is null or btrim(p_email) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;
  if p_consent is not true then
    raise exception 'Please agree to us emailing your report.' using errcode = '22023';
  end if;

  -- A light guard, because anyone can call this. Ten checks a day from one address is already
  -- far past normal use, and it stops the table being used as a free inbox.
  select count(*) into v_recent
  from breadmaker.scorecard_submissions s
  where lower(s.email) = lower(btrim(p_email)) and s.created_at > now() - interval '24 hours';
  if v_recent >= 10 then
    raise exception 'That email has already been checked ten times today. Try again tomorrow.' using errcode = '22023';
  end if;

  select * into v_score from breadmaker.scorecard_score(p_checks);

  select coalesce(max(s.attempt), 0) + 1 into v_attempt
  from breadmaker.scorecard_submissions s
  where lower(s.email) = lower(btrim(p_email));
  if v_attempt > 99 then
    raise exception 'That email has reached the limit of checks.' using errcode = '22023';
  end if;

  -- The target is aliased so the RETURNING clause cannot be confused with the OUT parameter "id".
  insert into breadmaker.scorecard_submissions as s
    (email, name, whatsapp, company, profile, attempt, checks, yes_count, band, weakest_week, failed, consent, source)
  values
    (lower(btrim(p_email)), left(btrim(coalesce(p_name, '')), 120), left(btrim(coalesce(p_whatsapp, '')), 40),
     left(btrim(coalesce(p_company, '')), 160), coalesce(p_profile, '{}'::jsonb), v_attempt, p_checks,
     v_score.yes_count, v_score.band, v_score.weakest_week, v_score.failed, true,
     left(btrim(coalesce(p_source, 'scorecard')), 40))
  returning s.id, s.access_token into v_id, v_token;

  return query select v_id, v_token, v_attempt, v_score.yes_count, v_score.band, v_score.weakest_week, v_score.failed;
end;
$$;

revoke all on function breadmaker.submit_scorecard(text, text, text, jsonb, boolean[], boolean, text, text) from public;
grant execute on function breadmaker.submit_scorecard(text, text, text, jsonb, boolean[], boolean, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public: the result header and the gap report, both behind the token.

create or replace function breadmaker.get_scorecard_result(p_id uuid, p_token uuid)
returns table (
  id uuid, name text, attempt integer, created_at timestamptz,
  yes_count integer, band text, weakest_week integer,
  previous_yes_count integer, previous_at timestamptz
)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select s.id, s.name, s.attempt, s.created_at, s.yes_count, s.band, s.weakest_week,
         prev.yes_count, prev.created_at
  from breadmaker.scorecard_submissions s
  left join lateral (
    select s2.yes_count, s2.created_at
    from breadmaker.scorecard_submissions s2
    where lower(s2.email) = lower(s.email) and s2.attempt < s.attempt
    order by s2.attempt desc
    limit 1
  ) prev on true
  where s.id = p_id and s.access_token = p_token;
$$;

revoke all on function breadmaker.get_scorecard_result(uuid, uuid) from public;
grant execute on function breadmaker.get_scorecard_result(uuid, uuid) to anon, authenticated;

create or replace function breadmaker.get_scorecard_gaps(p_id uuid, p_token uuid)
returns table (check_position integer, fix text, fix_label text, fix_route text)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select f.check_position, f.fix, f.fix_label, f.fix_route
  from breadmaker.scorecard_submissions s
  join breadmaker.scorecard_fixes f on f.check_position = any (s.failed) and f.active
  where s.id = p_id and s.access_token = p_token
  order by f.check_position;
$$;

revoke all on function breadmaker.get_scorecard_gaps(uuid, uuid) from public;
grant execute on function breadmaker.get_scorecard_gaps(uuid, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Team only: the lead list and the three numbers that decide what to write next.

create or replace function breadmaker.list_scorecard_leads()
returns table (
  created_at timestamptz, name text, email text, company text, whatsapp text,
  attempt integer, yes_count integer, band text, weakest_week integer, source text
)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select s.created_at, s.name, s.email, s.company, s.whatsapp,
         s.attempt, s.yes_count, s.band, s.weakest_week, s.source
  from breadmaker.scorecard_submissions s
  where breadmaker.is_team_member()
  order by s.created_at desc;
$$;

create or replace function breadmaker.scorecard_bands()
returns table (band text, people integer, attempts integer, average_score numeric)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select s.band,
         count(distinct lower(s.email))::integer,
         count(*)::integer,
         round(avg(s.yes_count), 1)
  from breadmaker.scorecard_submissions s
  where breadmaker.is_team_member()
  group by s.band
  order by min(s.yes_count);
$$;

-- Which checks people fail most. This is the content brief: lead with the checks nobody passes.
create or replace function breadmaker.scorecard_check_pass_rates()
returns table (check_position integer, attempts integer, passed integer, pass_rate numeric)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select c.check_position,
         count(s.id)::integer,
         count(*) filter (where s.checks[c.check_position])::integer,
         round(100.0 * count(*) filter (where s.checks[c.check_position]) / nullif(count(s.id), 0), 1)
  from generate_series(1, 20) as c(check_position)
  left join breadmaker.scorecard_submissions s on true
  where breadmaker.is_team_member()
  group by c.check_position
  order by 4 nulls last, c.check_position;
$$;

-- First score versus latest, for everyone who came back.
create or replace function breadmaker.scorecard_progress()
returns table (email text, name text, attempts integer, first_score integer, latest_score integer, delta integer)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select t.email, t.name, t.attempts, t.first_score, t.latest_score, t.latest_score - t.first_score
  from (
    select lower(s.email) as email,
           max(s.name) as name,
           count(*)::integer as attempts,
           (array_agg(s.yes_count order by s.attempt asc))[1] as first_score,
           (array_agg(s.yes_count order by s.attempt desc))[1] as latest_score
    from breadmaker.scorecard_submissions s
    where breadmaker.is_team_member()
    group by lower(s.email)
    having count(*) > 1
  ) t
  order by (t.latest_score - t.first_score) desc, t.email;
$$;

-- One call for the Studio screen: totals, the band mix, the pass rates and the re-score progress.
create or replace function breadmaker.scorecard_overview()
returns jsonb
language plpgsql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
declare
  v jsonb;
begin
  if not breadmaker.is_team_member() then
    raise exception 'Team only.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'attempts', count(*)::integer,
        'people', count(distinct lower(s.email))::integer,
        'average_score', coalesce(round(avg(s.yes_count), 1), 0),
        'last_at', max(s.created_at)
      )
      from breadmaker.scorecard_submissions s
    ),
    'bands', (
      select coalesce(jsonb_agg(to_jsonb(b) order by array_position(array['not-started', 'building', 'almost', 'operating'], b.band)), '[]'::jsonb)
      from breadmaker.scorecard_bands() b
    ),
    'pass_rates', (
      select coalesce(jsonb_agg(to_jsonb(p) order by p.pass_rate nulls last, p.check_position), '[]'::jsonb)
      from breadmaker.scorecard_check_pass_rates() p
    ),
    'progress', (
      select coalesce(jsonb_agg(to_jsonb(g) order by g.delta desc), '[]'::jsonb)
      from breadmaker.scorecard_progress() g
    )
  ) into v;

  return v;
end;
$$;

revoke all on function breadmaker.list_scorecard_leads() from public, anon;
revoke all on function breadmaker.scorecard_bands() from public, anon;
revoke all on function breadmaker.scorecard_check_pass_rates() from public, anon;
revoke all on function breadmaker.scorecard_progress() from public, anon;
revoke all on function breadmaker.scorecard_overview() from public, anon;

grant execute on function breadmaker.list_scorecard_leads() to authenticated;
grant execute on function breadmaker.scorecard_bands() to authenticated;
grant execute on function breadmaker.scorecard_check_pass_rates() to authenticated;
grant execute on function breadmaker.scorecard_progress() to authenticated;
grant execute on function breadmaker.scorecard_overview() to authenticated;

-- ---------------------------------------------------------------------------
-- Seed the fixes. Edit them in the Studio later; a re-run leaves the existing rows alone.

insert into breadmaker.scorecard_fixes (check_position, fix, fix_label, fix_route) values
  (1,  'Put the site on your own domain with HTTPS. If it is on a builder subdomain, move it: your domain is the asset, the host is not.', 'How we do it', '/guides/own-the-systems-your-business-runs-on'),
  (2,  'Write one sentence: who it is for, what they get, the price. Show it to three strangers and ask them to repeat it back.', 'The offer kit', '/systems'),
  (3,  'Open it on a real phone, on mobile data, and submit the form. Fix what breaks before anything else.', 'The Launchpad program', '/launchpad'),
  (4,  'Install one analytics script and confirm a visit and a form submission both appear as events.', 'The kit for this', '/systems'),
  (5,  'Create three tables: leads, customers, payments. Ten sensible fields each beats fifty you never read.', 'Foundry, week 2', '/foundry'),
  (6,  'Turn on row-level security on every table, then run the logged-out test: a signed-out request must return nothing.', 'Foundry, week 2', '/foundry'),
  (7,  'Take one test payment and confirm your database records it as paid from the provider webhook, not from the browser.', 'How we take payments', '/guides/own-the-systems-your-business-runs-on'),
  (8,  'Build one protected page that shows leads, customers and payments together. This is the view you will actually use daily.', 'Foundry, week 2', '/foundry'),
  (9,  'Wire the trigger: form submitted, confirmation sent, follow-up scheduled. Then submit a test lead and watch it happen.', 'The follow-up kit', '/systems'),
  (10, 'Send yourself a notification on a new lead. If you find out a day later, you have already lost the reply race.', 'The follow-up kit', '/systems'),
  (11, 'Give one AI agent one real task with a human approval step, and log what it received and produced.', 'The automation kit', '/systems'),
  (12, 'Make a job fail on purpose and confirm an alert reaches you. Silent failure is the expensive kind.', 'The automation kit', '/systems'),
  (13, 'Use staging for every change and promote at least three. If you edit production directly, you have no rollback.', 'Foundry, week 4', '/foundry'),
  (14, 'Push a deliberate bad change, roll it back, and write down how long it took.', 'Foundry, week 4', '/foundry'),
  (15, 'Restore a backup into a test copy and check that the data is really there. An untested backup is a hope.', 'Foundry, week 4', '/foundry'),
  (16, 'Turn on an uptime check and one alert channel you actually read.', 'Foundry, week 4', '/foundry'),
  (17, 'Turn on 2FA everywhere, move secrets out of the repository, and rotate anything that was ever committed.', 'Foundry, week 4', '/foundry'),
  (18, 'Write one page: how to deploy, how to roll back, how to restore, and who to call.', 'Foundry, week 4', '/foundry'),
  (19, 'Check that you could export your data and move hosts without rebuilding. Own the exit before you need it.', 'The systems guide', '/guides/own-the-systems-your-business-runs-on'),
  (20, 'Write down what you expected this to earn or save, then write down what it actually did. That number is the whole point.', 'The systems guide', '/guides/own-the-systems-your-business-runs-on')
on conflict (check_position) do nothing;
