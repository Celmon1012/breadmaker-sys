-- Breadmaker Hub: a monthly membership.
--
-- A member opens every published kit and every published course that is not a program
-- (Launchpad and Foundry are joined by application and paid separately). Each payment buys
-- period_days of membership; paying again before it ends adds to the end date, so renewing
-- early loses nothing. The price, discount and length are one editable row, read by the
-- checkout function, never taken from the browser.
--
-- Members are keyed by email, so someone who pays before creating an account is a member the
-- moment they sign up with that email. Safe to re-run.
--
-- This file redefines has_course_access() from migration 12. If migration 12 is ever re-run on
-- its own, run this file again afterwards or members lose access.

-- ---------------------------------------------------------------------------
-- Tables

create table if not exists breadmaker.membership_plans (
  code text primary key,
  label text not null default 'Breadmaker Hub',
  description text not null default '',
  price_minor integer not null check (price_minor >= 0),
  currency text not null check (currency in ('NGN', 'USD')) default 'NGN',
  period_days integer not null default 30 check (period_days between 1 and 366),
  discount_pct integer not null default 0 check (discount_pct between 0 and 100),
  discount_ends_at timestamptz,
  active boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Starts switched off at a placeholder price: set the real price in Studio, then turn it on.
insert into breadmaker.membership_plans (code, label, description, price_minor, currency, active) values
  ('hub', 'Breadmaker Hub', 'Every kit and course in the Hub, for one month at a time.', 500000, 'NGN', false)
on conflict (code) do nothing;

create table if not exists breadmaker.memberships (
  email text primary key,
  plan_code text not null default 'hub',
  started_at timestamptz not null default now(),
  current_period_end timestamptz not null,
  source text not null default 'purchase' check (source in ('purchase', 'manual')),
  note text not null default '',
  -- Set once the "ends soon" and "ended" emails have gone out for the current period.
  reminder_sent_for timestamptz,
  lapsed_sent_for timestamptz,
  updated_at timestamptz not null default now()
);

-- One row per payment that has been applied, so a payment can never extend the period twice.
create table if not exists breadmaker.membership_payments (
  tx_ref text primary key,
  email text not null,
  days integer not null,
  applied_at timestamptz not null default now()
);

alter table breadmaker.membership_plans enable row level security;
alter table breadmaker.memberships enable row level security;
alter table breadmaker.membership_payments enable row level security;

drop policy if exists "Team read memberships" on breadmaker.memberships;
create policy "Team read memberships" on breadmaker.memberships for select using (breadmaker.is_team_member());
drop policy if exists "Team read membership payments" on breadmaker.membership_payments;
create policy "Team read membership payments" on breadmaker.membership_payments for select using (breadmaker.is_team_member());
drop policy if exists "Team read membership plans" on breadmaker.membership_plans;
create policy "Team read membership plans" on breadmaker.membership_plans for select using (breadmaker.is_team_member());

-- ---------------------------------------------------------------------------
-- Access

create or replace function breadmaker.is_hub_member()
returns boolean
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select exists (
    select 1
    from breadmaker.memberships m
    join auth.users u on lower(u.email) = m.email
    where u.id = auth.uid() and m.current_period_end > now()
  );
$$;

-- Kits and standalone courses are covered; programs are not.
create or replace function breadmaker.has_course_access(check_course_id uuid)
returns boolean
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select breadmaker.is_team_member(auth.uid())
    or exists (select 1 from breadmaker.lms_enrollments where user_id = auth.uid() and course_id = check_course_id)
    or exists (select 1 from breadmaker.lms_courses where id = check_course_id and status = 'Published' and price_minor = 0)
    or (
      breadmaker.is_hub_member()
      and exists (
        select 1 from breadmaker.lms_courses
        where id = check_course_id and status = 'Published' and (kit_system_id is not null or program = 'general')
      )
    );
$$;

-- ---------------------------------------------------------------------------
-- What the public and the signed-in member see

-- Migration 29 changes these signatures, so a re-run starts from a clean slate.
drop function if exists breadmaker.membership_offer();
drop function if exists breadmaker.list_membership_plans_admin();
drop function if exists breadmaker.set_membership_plan(text, integer, text, integer, integer, timestamptz, boolean);
drop function if exists breadmaker.set_membership_plan(text, integer, text, integer, integer, integer, timestamptz, boolean);
create function breadmaker.membership_offer()
returns table (label text, description text, price_minor integer, currency text, period_days integer, discount_pct integer, discount_ends_at timestamptz)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select p.label, p.description, p.price_minor, p.currency, p.period_days,
         case when p.discount_ends_at is not null and p.discount_ends_at > now() then p.discount_pct else 0 end,
         case when p.discount_ends_at is not null and p.discount_ends_at > now() and p.discount_pct > 0 then p.discount_ends_at end
  from breadmaker.membership_plans p
  where p.code = 'hub' and p.active;
$$;

create or replace function breadmaker.my_membership()
returns table (active boolean, current_period_end timestamptz, started_at timestamptz)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select m.current_period_end > now(), m.current_period_end, m.started_at
  from breadmaker.memberships m
  join auth.users u on lower(u.email) = m.email
  where u.id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Payment -> membership. Service role only, after the payment is confirmed.
-- Returns: activated | already | not-paid | unknown.

create or replace function breadmaker.grant_membership(check_tx_ref text)
returns text
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
declare
  v_payment breadmaker.payments;
  v_days integer;
  v_email text;
  v_inserted integer;
begin
  select * into v_payment from breadmaker.payments where tx_ref = check_tx_ref and program = 'membership';
  if v_payment.id is null then return 'unknown'; end if;
  if v_payment.status <> 'successful' then return 'not-paid'; end if;

  select period_days into v_days from breadmaker.membership_plans where code = 'hub';
  v_days := coalesce(v_days, 30);
  v_email := lower(v_payment.email);

  insert into breadmaker.membership_payments (tx_ref, email, days) values (v_payment.tx_ref, v_email, v_days)
  on conflict (tx_ref) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return 'already'; end if;

  insert into breadmaker.memberships (email, current_period_end, source)
  values (v_email, now() + make_interval(days => v_days), 'purchase')
  on conflict (email) do update
    set current_period_end = greatest(breadmaker.memberships.current_period_end, now()) + make_interval(days => v_days),
        source = 'purchase',
        updated_at = now();
  return 'activated';
end;
$$;

-- ---------------------------------------------------------------------------
-- Team tools

create or replace function breadmaker.list_memberships()
returns table (email text, current_period_end timestamptz, started_at timestamptz, source text, note text, active boolean, name text)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select m.email, m.current_period_end, m.started_at, m.source, m.note, m.current_period_end > now(),
         coalesce((select p.name from breadmaker.payments p where lower(p.email) = m.email and p.program = 'membership' and p.name <> '' order by p.created_at desc limit 1), '')
  from breadmaker.memberships m
  where breadmaker.is_team_member()
  order by m.current_period_end desc;
$$;

create function breadmaker.list_membership_plans_admin()
returns table (code text, label text, description text, price_minor integer, currency text, period_days integer, discount_pct integer, discount_ends_at timestamptz, active boolean)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select p.code, p.label, p.description, p.price_minor, p.currency, p.period_days, p.discount_pct, p.discount_ends_at, p.active
  from breadmaker.membership_plans p
  where breadmaker.is_team_member();
$$;

create function breadmaker.set_membership_plan(
  new_description text, new_price_minor integer, new_currency text, new_period_days integer,
  new_discount_pct integer, new_discount_ends_at timestamptz, new_active boolean
)
returns void
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
begin
  if not breadmaker.can_edit_content() then
    raise exception 'Only owners and coaches can change the Hub price.' using errcode = '42501';
  end if;
  if new_price_minor < 0 or new_currency not in ('NGN', 'USD') or new_period_days < 1 or new_period_days > 366
     or new_discount_pct < 0 or new_discount_pct > 100 then
    raise exception 'Check the price, currency, length and discount.' using errcode = '22023';
  end if;
  update breadmaker.membership_plans
     set description = coalesce(new_description, ''), price_minor = new_price_minor, currency = new_currency,
         period_days = new_period_days, discount_pct = new_discount_pct, discount_ends_at = new_discount_ends_at,
         active = new_active, updated_at = now()
   where code = 'hub';
end;
$$;

-- Gives (or takes away) membership by hand. days > 0 adds that many days; days = 0 ends it now.
create or replace function breadmaker.set_membership(for_email text, add_days integer, new_note text default '')
returns void
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
declare
  v_email text := lower(trim(for_email));
begin
  if not breadmaker.can_edit_content() then
    raise exception 'Only owners and coaches can change memberships.' using errcode = '42501';
  end if;
  if v_email = '' or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then
    raise exception 'Enter a valid email.' using errcode = '22023';
  end if;
  if add_days < 0 or add_days > 3660 then
    raise exception 'Days must be between 0 and 3660.' using errcode = '22023';
  end if;
  if add_days = 0 then
    update breadmaker.memberships set current_period_end = now(), note = coalesce(new_note, ''), updated_at = now() where email = v_email;
  else
    insert into breadmaker.memberships (email, current_period_end, source, note)
    values (v_email, now() + make_interval(days => add_days), 'manual', coalesce(new_note, ''))
    on conflict (email) do update
      set current_period_end = greatest(breadmaker.memberships.current_period_end, now()) + make_interval(days => add_days),
          note = coalesce(new_note, ''), updated_at = now();
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reminders (service role, called by the memberships-remind function)

-- Members whose period ends within 5 days, or who lapsed in the last 3 days, and have not been told yet.
create or replace function breadmaker.membership_notices()
returns table (email text, current_period_end timestamptz, kind text)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select m.email, m.current_period_end, 'ending'
  from breadmaker.memberships m
  where m.current_period_end > now() and m.current_period_end <= now() + interval '5 days'
    and m.reminder_sent_for is distinct from m.current_period_end
  union all
  select m.email, m.current_period_end, 'ended'
  from breadmaker.memberships m
  where m.current_period_end <= now() and m.current_period_end > now() - interval '3 days'
    and m.lapsed_sent_for is distinct from m.current_period_end;
$$;

create or replace function breadmaker.mark_membership_notice(for_email text, for_kind text, for_period_end timestamptz)
returns void
language sql
security definer
set search_path = breadmaker, pg_temp
as $$
  update breadmaker.memberships
     set reminder_sent_for = case when for_kind = 'ending' then for_period_end else reminder_sent_for end,
         lapsed_sent_for = case when for_kind = 'ended' then for_period_end else lapsed_sent_for end
   where email = lower(for_email);
$$;

-- ---------------------------------------------------------------------------
-- Grants

grant select on breadmaker.memberships, breadmaker.membership_payments, breadmaker.membership_plans to authenticated;
grant execute on function breadmaker.is_hub_member() to anon, authenticated;
grant execute on function breadmaker.membership_offer() to anon, authenticated;
grant execute on function breadmaker.my_membership() to authenticated;
grant execute on function breadmaker.list_memberships() to authenticated;
grant execute on function breadmaker.list_membership_plans_admin() to authenticated;
grant execute on function breadmaker.set_membership_plan(text, integer, text, integer, integer, timestamptz, boolean) to authenticated;
grant execute on function breadmaker.set_membership(text, integer, text) to authenticated;
revoke execute on function breadmaker.grant_membership(text) from public, anon, authenticated;
revoke execute on function breadmaker.membership_notices() from public, anon, authenticated;
revoke execute on function breadmaker.mark_membership_notice(text, text, timestamptz) from public, anon, authenticated;
grant execute on function breadmaker.grant_membership(text) to service_role;
grant execute on function breadmaker.membership_notices() to service_role;
grant execute on function breadmaker.mark_membership_notice(text, text, timestamptz) to service_role;
grant select, insert, update on breadmaker.memberships, breadmaker.membership_payments, breadmaker.membership_plans to service_role;
