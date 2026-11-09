-- Breadmaker programs: cohorts, applications, waitlists and payments.
--
-- Turns the bracketed copy on the program pages ([DATE], [5-8], [X] places)
-- into real data the team controls from the Studio:
--   * program_cohorts  - a dated, capacity-limited run of a program.
--   * applications     - Foundry applications and Launchpad start-call bookings.
--   * cohort_waitlist  - people to call when a cohort fills up.
--   * payments         - Flutterwave transactions and what they bought.
--
-- Public (anon) callers can only submit an application, join a waitlist, and
-- read the aggregate program status that the marketing pages render. Everything
-- else is team-only. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Cohorts

create table if not exists breadmaker.program_cohorts (
  id uuid primary key default gen_random_uuid(),
  program text not null check (program in ('foundry', 'launchpad')),
  course_id uuid references breadmaker.lms_courses(id) on delete set null,
  label text not null default '',
  starts_on date,
  ends_on date,
  -- Places in this run. null = no fixed limit.
  capacity integer check (capacity is null or capacity > 0),
  -- 'open' accepts applications, 'running' is in progress, 'closed' is done.
  status text not null check (status in ('open', 'running', 'closed')) default 'open',
  timezone text not null default 'Africa/Lagos',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists program_cohorts_program_idx on breadmaker.program_cohorts (program, starts_on);

create table if not exists breadmaker.cohort_waitlist (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid references breadmaker.program_cohorts(id) on delete set null,
  program text not null check (program in ('foundry', 'launchpad', 'general')) default 'general',
  name text not null,
  email text not null,
  phone text,
  note text not null default '',
  notified_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists cohort_waitlist_unique_email
  on breadmaker.cohort_waitlist (coalesce(cohort_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(email));

-- ---------------------------------------------------------------------------
-- Applications (Foundry application, Launchpad start call, Done-with-you brief)

create table if not exists breadmaker.applications (
  id uuid primary key default gen_random_uuid(),
  program text not null check (program in ('foundry', 'launchpad', 'general')) default 'general',
  -- Support level they picked: self-paced | guided | done-with-you.
  tier text not null default '',
  cohort_id uuid references breadmaker.program_cohorts(id) on delete set null,
  name text not null,
  email text not null,
  phone text,
  company text,
  -- Program-specific questions and answers, so the form can change without a migration.
  answers jsonb not null default '{}'::jsonb,
  status text not null check (status in ('new', 'reviewed', 'accepted', 'invoiced', 'paid', 'enrolled', 'declined')) default 'new',
  note text not null default '',
  user_id uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists applications_status_idx on breadmaker.applications (status, created_at desc);
create index if not exists applications_email_idx on breadmaker.applications (lower(email));
create index if not exists applications_cohort_idx on breadmaker.applications (cohort_id);

-- ---------------------------------------------------------------------------
-- Payments (Flutterwave). One row per checkout attempt, keyed by our own tx_ref.

create table if not exists breadmaker.payments (
  id uuid primary key default gen_random_uuid(),
  tx_ref text not null unique,
  provider text not null default 'flutterwave',
  application_id uuid references breadmaker.applications(id) on delete set null,
  course_id uuid references breadmaker.lms_courses(id) on delete set null,
  cohort_id uuid references breadmaker.program_cohorts(id) on delete set null,
  program text not null default '',
  tier text not null default '',
  email text not null,
  name text not null default '',
  phone text,
  amount_minor integer not null check (amount_minor >= 0),
  currency text not null check (currency in ('NGN', 'USD', 'usd', 'ngn')) default 'NGN',
  status text not null check (status in ('pending', 'successful', 'failed', 'cancelled')) default 'pending',
  provider_tx_id text,
  provider_ref text,
  failure_reason text,
  raw jsonb,
  user_id uuid references auth.users(id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_status_idx on breadmaker.payments (status, created_at desc);
create index if not exists payments_email_idx on breadmaker.payments (lower(email));

-- ---------------------------------------------------------------------------
-- Helpers

-- What each support level costs. The checkout function reads the price from
-- here, never from the browser, so a tampered request cannot change the amount.
create table if not exists breadmaker.program_tiers (
  program text not null check (program in ('foundry', 'launchpad')),
  tier text not null check (tier in ('self-paced', 'guided', 'done-with-you')),
  label text not null default '',
  price_minor integer not null check (price_minor >= 0),
  currency text not null check (currency in ('NGN', 'USD')) default 'NGN',
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (program, tier)
);

insert into breadmaker.program_tiers (program, tier, label, price_minor, currency) values
  ('launchpad', 'self-paced', 'Launchpad Self-paced', 3500000, 'NGN'),
  ('launchpad', 'guided', 'Launchpad Guided', 18000000, 'NGN'),
  ('launchpad', 'done-with-you', 'Launchpad Done-with-you', 35000000, 'NGN'),
  ('foundry', 'self-paced', 'Foundry Self-paced', 15000000, 'NGN'),
  ('foundry', 'guided', 'Foundry Guided', 60000000, 'NGN'),
  ('foundry', 'done-with-you', 'Foundry Done-with-you', 250000000, 'NGN')
on conflict (program, tier) do update
  set label = excluded.label, price_minor = excluded.price_minor, currency = excluded.currency, updated_at = now();

create or replace function breadmaker.program_tier_list()
returns table (program text, tier text, label text, price_minor integer, currency text)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select program, tier, label, price_minor, currency
  from breadmaker.program_tiers
  where active
  order by program, case tier when 'self-paced' then 1 when 'guided' then 2 else 3 end;
$$;

-- Places taken by a cohort: anyone accepted, invoiced, paid or enrolled.
create or replace function breadmaker.cohort_taken(check_cohort_id uuid)
returns integer
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select count(*)::integer
  from breadmaker.applications
  where cohort_id = check_cohort_id
    and status in ('accepted', 'invoiced', 'paid', 'enrolled');
$$;

-- The run the marketing pages should talk about: the soonest open cohort,
-- earliest start date first, undated runs last.
create or replace function breadmaker.next_cohort(check_program text)
returns breadmaker.program_cohorts
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select c.*
  from breadmaker.program_cohorts c
  where c.program = check_program
    and c.status = 'open'
    and (c.capacity is null or breadmaker.cohort_taken(c.id) < c.capacity)
  order by c.starts_on nulls last, c.created_at
  limit 1;
$$;

-- Everything the program pages and the apply form need, in one call.
create or replace function breadmaker.program_status(check_program text)
returns jsonb
language plpgsql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
declare
  v_cohort breadmaker.program_cohorts;
  v_open integer;
  v_waiting integer;
begin
  v_cohort := breadmaker.next_cohort(check_program);
  select count(*)::integer into v_open
  from breadmaker.program_cohorts
  where program = check_program and status = 'open';
  select count(*)::integer into v_waiting
  from breadmaker.cohort_waitlist w
  where w.program = check_program and w.notified_at is null;

  return jsonb_build_object(
    'program', check_program,
    'open_cohorts', v_open,
    'waitlist_count', v_waiting,
    'cohort_id', v_cohort.id,
    'label', coalesce(v_cohort.label, ''),
    'starts_on', v_cohort.starts_on,
    'ends_on', v_cohort.ends_on,
    'capacity', v_cohort.capacity,
    'taken', case when v_cohort.id is null then 0 else breadmaker.cohort_taken(v_cohort.id) end,
    'remaining', case
      when v_cohort.id is null then null
      when v_cohort.capacity is null then null
      else greatest(v_cohort.capacity - breadmaker.cohort_taken(v_cohort.id), 0)
    end,
    'accepting', v_cohort.id is not null
  );
end;
$$;

-- The open cohorts an applicant can pick from.
create or replace function breadmaker.open_cohorts(check_program text)
returns table (id uuid, label text, starts_on date, capacity integer, remaining integer)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select c.id, c.label, c.starts_on, c.capacity,
         case when c.capacity is null then null else greatest(c.capacity - breadmaker.cohort_taken(c.id), 0) end
  from breadmaker.program_cohorts c
  where c.program = check_program
    and c.status = 'open'
    and (c.capacity is null or breadmaker.cohort_taken(c.id) < c.capacity)
  order by c.starts_on nulls last, c.created_at;
$$;

-- ---------------------------------------------------------------------------
-- Public submissions

-- Submits an application or booking. Callable signed out.
create or replace function breadmaker.submit_application(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
declare
  v_program text := coalesce(nullif(trim(payload->>'program'), ''), 'general');
  v_email text := lower(trim(coalesce(payload->>'email', '')));
  v_name text := trim(coalesce(payload->>'name', ''));
  v_cohort uuid;
  v_id uuid;
begin
  if v_name = '' then
    raise exception 'Please add your name.' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then
    raise exception 'Please add a valid email address.' using errcode = '22023';
  end if;
  if v_program not in ('foundry', 'launchpad', 'general') then
    raise exception 'Unknown program.' using errcode = '22023';
  end if;

  -- Honour an explicit cohort only when it is still open with room.
  if nullif(trim(coalesce(payload->>'cohort_id', '')), '') is not null then
    select c.id into v_cohort
    from breadmaker.program_cohorts c
    where c.id = (payload->>'cohort_id')::uuid
      and c.status = 'open'
      and (c.capacity is null or breadmaker.cohort_taken(c.id) < c.capacity);
  end if;
  if v_cohort is null then
    v_cohort := (breadmaker.next_cohort(v_program)).id;
  end if;

  insert into breadmaker.applications (program, tier, cohort_id, name, email, phone, company, answers, user_id)
  values (
    v_program,
    coalesce(nullif(trim(payload->>'tier'), ''), ''),
    v_cohort,
    v_name,
    v_email,
    nullif(trim(coalesce(payload->>'phone', '')), ''),
    nullif(trim(coalesce(payload->>'company', '')), ''),
    coalesce(payload->'answers', '{}'::jsonb),
    auth.uid()
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- Joins the waitlist for a program (optionally a specific full cohort).
create or replace function breadmaker.join_waitlist(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
declare
  v_program text := coalesce(nullif(trim(payload->>'program'), ''), 'general');
  v_email text := lower(trim(coalesce(payload->>'email', '')));
  v_name text := trim(coalesce(payload->>'name', ''));
  v_cohort uuid;
  v_id uuid;
begin
  if v_name = '' then
    raise exception 'Please add your name.' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then
    raise exception 'Please add a valid email address.' using errcode = '22023';
  end if;
  if v_program not in ('foundry', 'launchpad', 'general') then
    raise exception 'Unknown program.' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(payload->>'cohort_id', '')), '') is not null then
    v_cohort := (payload->>'cohort_id')::uuid;
  end if;

  insert into breadmaker.cohort_waitlist (cohort_id, program, name, email, phone, note)
  values (v_cohort, v_program, v_name, v_email, nullif(trim(coalesce(payload->>'phone', '')), ''), coalesce(payload->>'note', ''))
  on conflict (coalesce(cohort_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(email))
    do update set name = excluded.name, phone = excluded.phone, note = excluded.note, notified_at = null
  returning id into v_id;
  return v_id;
end;
$$;

-- Safe payment status for the return page: no amounts beyond what the payer paid.
create or replace function breadmaker.payment_status(check_tx_ref text)
returns jsonb
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select jsonb_build_object(
    'tx_ref', p.tx_ref,
    'status', p.status,
    'program', p.program,
    'tier', p.tier,
    'amount_minor', p.amount_minor,
    'currency', p.currency,
    'email', p.email
  )
  from breadmaker.payments p
  where p.tx_ref = check_tx_ref;
$$;

-- ---------------------------------------------------------------------------
-- Team reads and writes

create or replace function breadmaker.list_applications(check_status text default null, check_program text default null)
returns table (
  id uuid, program text, tier text, cohort_id uuid, cohort_label text, starts_on date,
  name text, email text, phone text, company text, answers jsonb,
  status text, note text, payment_status text, created_at timestamptz, updated_at timestamptz
)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select a.id, a.program, a.tier, a.cohort_id, coalesce(c.label, ''), c.starts_on,
         a.name, a.email, a.phone, a.company, a.answers,
         a.status, a.note, pay.status, a.created_at, a.updated_at
  from breadmaker.applications a
  left join breadmaker.program_cohorts c on c.id = a.cohort_id
  left join lateral (
    select p.status
    from breadmaker.payments p
    where lower(p.email) = lower(a.email)
    order by (p.status = 'successful') desc, p.created_at desc
    limit 1
  ) pay on true
  where breadmaker.is_team_member()
    and (check_status is null or check_status = 'all' or a.status = check_status)
    and (check_program is null or check_program = 'all' or a.program = check_program)
  order by a.created_at desc;
$$;

create or replace function breadmaker.set_application_status(app_id uuid, new_status text, new_note text default null)
returns void
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
begin
  if not breadmaker.can_edit_content() then
    raise exception 'Only owners and coaches can work the applications queue.' using errcode = '42501';
  end if;
  if new_status not in ('new', 'reviewed', 'accepted', 'invoiced', 'paid', 'enrolled', 'declined') then
    raise exception 'Unknown status %', new_status using errcode = '22023';
  end if;
  update breadmaker.applications
     set status = new_status,
         note = coalesce(new_note, note),
         decided_at = case when new_status in ('accepted', 'declined') then coalesce(decided_at, now()) else decided_at end,
         updated_at = now()
   where id = app_id;
end;
$$;

create or replace function breadmaker.list_cohorts()
returns table (
  id uuid, program text, label text, starts_on date, ends_on date,
  capacity integer, taken integer, remaining integer, waitlist integer,
  status text, timezone text, notes text
)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select c.id, c.program, c.label, c.starts_on, c.ends_on, c.capacity,
         breadmaker.cohort_taken(c.id),
         case when c.capacity is null then null else greatest(c.capacity - breadmaker.cohort_taken(c.id), 0) end,
         (select count(*)::integer from breadmaker.cohort_waitlist w where w.cohort_id = c.id),
         c.status, c.timezone, c.notes
  from breadmaker.program_cohorts c
  where breadmaker.is_team_member()
  order by c.program, c.starts_on nulls last, c.created_at;
$$;

create or replace function breadmaker.save_cohort(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
declare
  v_id uuid := nullif(trim(coalesce(payload->>'id', '')), '')::uuid;
  v_program text := coalesce(nullif(trim(payload->>'program'), ''), 'foundry');
  v_status text := coalesce(nullif(trim(payload->>'status'), ''), 'open');
begin
  if not breadmaker.can_edit_content() then
    raise exception 'Only owners and coaches can change cohorts.' using errcode = '42501';
  end if;
  if v_program not in ('foundry', 'launchpad') then
    raise exception 'Unknown program.' using errcode = '22023';
  end if;
  if v_status not in ('open', 'running', 'closed') then
    raise exception 'Unknown cohort status.' using errcode = '22023';
  end if;

  if v_id is null then
    insert into breadmaker.program_cohorts (program, course_id, label, starts_on, ends_on, capacity, status, timezone, notes)
    values (
      v_program,
      nullif(trim(coalesce(payload->>'course_id', '')), '')::uuid,
      coalesce(payload->>'label', ''),
      nullif(trim(coalesce(payload->>'starts_on', '')), '')::date,
      nullif(trim(coalesce(payload->>'ends_on', '')), '')::date,
      nullif(trim(coalesce(payload->>'capacity', '')), '')::integer,
      v_status,
      coalesce(nullif(trim(payload->>'timezone'), ''), 'Africa/Lagos'),
      coalesce(payload->>'notes', '')
    )
    returning id into v_id;
  else
    update breadmaker.program_cohorts
       set program = v_program,
           course_id = nullif(trim(coalesce(payload->>'course_id', '')), '')::uuid,
           label = coalesce(payload->>'label', ''),
           starts_on = nullif(trim(coalesce(payload->>'starts_on', '')), '')::date,
           ends_on = nullif(trim(coalesce(payload->>'ends_on', '')), '')::date,
           capacity = nullif(trim(coalesce(payload->>'capacity', '')), '')::integer,
           status = v_status,
           timezone = coalesce(nullif(trim(payload->>'timezone'), ''), 'Africa/Lagos'),
           notes = coalesce(payload->>'notes', ''),
           updated_at = now()
     where id = v_id;
  end if;
  return v_id;
end;
$$;

create or replace function breadmaker.delete_cohort(check_cohort_id uuid)
returns void
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
begin
  if not breadmaker.can_edit_content() then
    raise exception 'Only owners and coaches can delete cohorts.' using errcode = '42501';
  end if;
  delete from breadmaker.program_cohorts where id = check_cohort_id;
end;
$$;

create or replace function breadmaker.list_waitlist(check_cohort_id uuid default null, check_program text default null)
returns table (id uuid, cohort_id uuid, cohort_label text, program text, name text, email text, phone text, note text, created_at timestamptz)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select w.id, w.cohort_id, coalesce(c.label, ''), w.program, w.name, w.email, w.phone, w.note, w.created_at
  from breadmaker.cohort_waitlist w
  left join breadmaker.program_cohorts c on c.id = w.cohort_id
  where breadmaker.is_team_member()
    and (check_cohort_id is null or w.cohort_id = check_cohort_id)
    and (check_program is null or w.program = check_program)
  order by w.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Row level security. Nothing is readable by anon: the public surface is the
-- RPCs above, which return aggregates only.

alter table breadmaker.program_cohorts enable row level security;
alter table breadmaker.applications enable row level security;
alter table breadmaker.cohort_waitlist enable row level security;
alter table breadmaker.payments enable row level security;
alter table breadmaker.program_tiers enable row level security;

drop policy if exists "Team manage cohorts" on breadmaker.program_cohorts;
create policy "Team manage cohorts" on breadmaker.program_cohorts
  for all using (breadmaker.is_team_member()) with check (breadmaker.can_edit_content());

drop policy if exists "Team read applications" on breadmaker.applications;
create policy "Team read applications" on breadmaker.applications
  for select using (breadmaker.is_team_member());
drop policy if exists "Team update applications" on breadmaker.applications;
create policy "Team update applications" on breadmaker.applications
  for update using (breadmaker.can_edit_content()) with check (breadmaker.can_edit_content());

drop policy if exists "Team read waitlist" on breadmaker.cohort_waitlist;
create policy "Team read waitlist" on breadmaker.cohort_waitlist
  for select using (breadmaker.is_team_member());

drop policy if exists "Team read tiers" on breadmaker.program_tiers;
create policy "Team read tiers" on breadmaker.program_tiers
  for select using (breadmaker.is_team_member());
drop policy if exists "Team manage tiers" on breadmaker.program_tiers;
create policy "Team manage tiers" on breadmaker.program_tiers
  for all using (breadmaker.is_team_member()) with check (breadmaker.can_edit_content());

drop policy if exists "Team read payments" on breadmaker.payments;
create policy "Team read payments" on breadmaker.payments
  for select using (breadmaker.is_team_member());

-- ---------------------------------------------------------------------------
-- Payment -> enrollment. Called by the Flutterwave edge functions with the
-- service role, after the transaction has been verified with Flutterwave.
-- Returns: enrolled | no-account | not-paid | unknown.

create or replace function breadmaker.enroll_from_payment(check_tx_ref text)
returns text
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
declare
  v_payment breadmaker.payments;
  v_user uuid;
  v_course uuid;
begin
  select * into v_payment from breadmaker.payments where tx_ref = check_tx_ref;
  if v_payment.id is null then
    return 'unknown';
  end if;
  if v_payment.status <> 'successful' then
    return 'not-paid';
  end if;

  select id into v_user from auth.users where lower(email) = lower(v_payment.email);
  if v_user is null then
    -- They paid before creating an account: keep the payment, enroll on first sign-in.
    return 'no-account';
  end if;

  v_course := v_payment.course_id;
  if v_course is null then
    select id into v_course from breadmaker.lms_courses where slug = v_payment.program;
  end if;
  if v_course is not null then
    insert into breadmaker.lms_enrollments (user_id, course_id, source, note)
    values (v_user, v_course, 'purchase', v_payment.tx_ref)
    on conflict (user_id, course_id) do nothing;
  end if;

  update breadmaker.payments set user_id = v_user, updated_at = now() where id = v_payment.id;
  update breadmaker.applications
     set status = 'enrolled', updated_at = now()
   where lower(email) = lower(v_payment.email)
     and status in ('accepted', 'invoiced', 'paid');
  return 'enrolled';
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants

grant select, insert, update, delete on breadmaker.program_cohorts to authenticated;
grant select, insert, update on breadmaker.applications to authenticated;
grant select, insert, update on breadmaker.cohort_waitlist to authenticated;
grant select on breadmaker.payments to authenticated;
grant select on breadmaker.program_tiers to authenticated;

grant execute on function breadmaker.program_tier_list() to anon, authenticated;
grant execute on function breadmaker.program_status(text) to anon, authenticated;
grant execute on function breadmaker.open_cohorts(text) to anon, authenticated;
grant execute on function breadmaker.submit_application(jsonb) to anon, authenticated;
grant execute on function breadmaker.join_waitlist(jsonb) to anon, authenticated;
grant execute on function breadmaker.payment_status(text) to anon, authenticated;
grant execute on function breadmaker.next_cohort(text) to anon, authenticated;
grant execute on function breadmaker.cohort_taken(uuid) to anon, authenticated;
grant execute on function breadmaker.list_applications(text, text) to authenticated;
grant execute on function breadmaker.set_application_status(uuid, text, text) to authenticated;
grant execute on function breadmaker.list_cohorts() to authenticated;
grant execute on function breadmaker.save_cohort(jsonb) to authenticated;
grant execute on function breadmaker.delete_cohort(uuid) to authenticated;
grant execute on function breadmaker.list_waitlist(uuid, text) to authenticated;
-- Called by the edge functions only, with the service role key.
grant execute on function breadmaker.enroll_from_payment(text) to service_role;

-- ---------------------------------------------------------------------------
-- Course prices now match the Self-paced support level (the Academy catalog is
-- the self-paced product). Prices are in minor units: kobo for NGN.
-- 20240101000013_seed_programs.sql left these null/usd and skipped rows that
-- already existed, so the catalog showed a stale USD figure.

update breadmaker.lms_courses set price_minor = 15000000, currency = 'ngn', updated_at = now() where slug = 'foundry';
update breadmaker.lms_courses set price_minor = 3500000, currency = 'ngn', updated_at = now() where slug = 'launchpad';

-- One open, undated cohort per program so the pages can talk about capacity
-- before the team fills the dates in. Dates stay null until set in the Studio.
insert into breadmaker.program_cohorts (program, course_id, label, capacity, status)
select 'foundry', (select id from breadmaker.lms_courses where slug = 'foundry'), 'Next Foundry cohort', 6, 'open'
where not exists (select 1 from breadmaker.program_cohorts where program = 'foundry');

insert into breadmaker.program_cohorts (program, course_id, label, capacity, status)
select 'launchpad', (select id from breadmaker.lms_courses where slug = 'launchpad'), 'Launchpad weekly start', 8, 'open'
where not exists (select 1 from breadmaker.program_cohorts where program = 'launchpad');
