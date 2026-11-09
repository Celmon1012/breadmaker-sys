-- Prices in both naira and dollars.
--
-- Every price keeps its main amount and currency (price_minor, currency) and gains
-- alt_price_minor: the amount in the OTHER currency. The visitor picks NGN or USD with the
-- currency switcher; a price with no amount in the chosen currency shows in its main currency.
-- Studio edits the pair as two boxes (NGN and USD). Checkout reads the amount from here for the
-- currency the visitor picked, never from the browser.
-- Safe to re-run.

alter table breadmaker.lms_courses add column if not exists alt_price_minor integer check (alt_price_minor is null or alt_price_minor >= 0);
alter table breadmaker.program_tiers add column if not exists alt_price_minor integer check (alt_price_minor is null or alt_price_minor >= 0);
alter table breadmaker.leak_test_prices add column if not exists alt_price_minor integer check (alt_price_minor is null or alt_price_minor >= 0);
alter table breadmaker.membership_plans add column if not exists alt_price_minor integer check (alt_price_minor is null or alt_price_minor >= 0);

-- ---------------------------------------------------------------------------
-- Public price lists (return type changes, so drop first)

drop function if exists breadmaker.program_tier_list();
create function breadmaker.program_tier_list()
returns table (program text, tier text, label text, price_minor integer, currency text, alt_price_minor integer)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select program, tier, label, price_minor, currency, alt_price_minor
  from breadmaker.program_tiers
  where active
  order by program, case tier when 'self-paced' then 1 when 'guided' then 2 else 3 end;
$$;

drop function if exists breadmaker.leak_test_price_list();
create function breadmaker.leak_test_price_list()
returns table (tier text, label text, description text, price_minor integer, currency text, alt_price_minor integer)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select tier, label, description, price_minor, currency, alt_price_minor
  from breadmaker.leak_test_prices
  where active
  order by price_minor;
$$;

drop function if exists breadmaker.kit_offers();
create function breadmaker.kit_offers()
returns table (system_id text, slug text, title text, price_minor integer, currency text, lesson_count integer, preview_count integer, alt_price_minor integer)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select c.kit_system_id, c.slug, c.title, c.price_minor, c.currency,
         (select count(*)::integer from breadmaker.lms_lessons l where l.course_id = c.id and l.status = 'Published'),
         (select count(*)::integer from breadmaker.lms_lessons l where l.course_id = c.id and l.status = 'Published' and l.is_preview),
         c.alt_price_minor
  from breadmaker.lms_courses c
  where c.kit_system_id is not null and c.status = 'Published' and c.price_minor is not null and c.price_minor > 0;
$$;

drop function if exists breadmaker.membership_offer();
create function breadmaker.membership_offer()
returns table (label text, description text, price_minor integer, currency text, period_days integer, discount_pct integer, discount_ends_at timestamptz, alt_price_minor integer)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select p.label, p.description, p.price_minor, p.currency, p.period_days,
         case when p.discount_ends_at is not null and p.discount_ends_at > now() then p.discount_pct else 0 end,
         case when p.discount_ends_at is not null and p.discount_ends_at > now() and p.discount_pct > 0 then p.discount_ends_at end,
         p.alt_price_minor
  from breadmaker.membership_plans p
  where p.code = 'hub' and p.active;
$$;

-- ---------------------------------------------------------------------------
-- Studio: Leak Test report prices

drop function if exists breadmaker.list_leak_test_prices_admin();
create function breadmaker.list_leak_test_prices_admin()
returns table (tier text, label text, description text, price_minor integer, currency text, active boolean, discount_pct integer, discount_hours integer, alt_price_minor integer)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select p.tier, p.label, p.description, p.price_minor, p.currency, p.active, p.discount_pct, p.discount_hours, p.alt_price_minor
  from breadmaker.leak_test_prices p
  where breadmaker.is_team_member()
  order by p.price_minor;
$$;

drop function if exists breadmaker.set_leak_test_price(text, integer, text, integer, integer, boolean);
drop function if exists breadmaker.set_leak_test_price(text, integer, text, integer, integer, integer, boolean);
create function breadmaker.set_leak_test_price(
  for_tier text, new_price_minor integer, new_currency text, new_alt_price_minor integer,
  new_discount_pct integer, new_discount_hours integer, new_active boolean
)
returns void
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
begin
  if not breadmaker.can_edit_content() then
    raise exception 'Only owners and coaches can change prices.' using errcode = '42501';
  end if;
  if new_price_minor < 0 or (new_alt_price_minor is not null and new_alt_price_minor < 0) then
    raise exception 'A price cannot be negative.' using errcode = '22023';
  end if;
  if new_currency not in ('NGN', 'USD') then
    raise exception 'Currency must be NGN or USD.' using errcode = '22023';
  end if;
  if new_discount_pct < 0 or new_discount_pct > 100 or new_discount_hours < 0 then
    raise exception 'The discount must be 0 to 100 percent, for 0 or more hours.' using errcode = '22023';
  end if;
  update breadmaker.leak_test_prices
     set price_minor = new_price_minor, currency = new_currency, alt_price_minor = new_alt_price_minor,
         discount_pct = new_discount_pct, discount_hours = new_discount_hours, active = new_active, updated_at = now()
   where tier = for_tier;
end;
$$;

-- ---------------------------------------------------------------------------
-- Studio: Breadmaker Hub price

drop function if exists breadmaker.list_membership_plans_admin();
create function breadmaker.list_membership_plans_admin()
returns table (code text, label text, description text, price_minor integer, currency text, period_days integer, discount_pct integer, discount_ends_at timestamptz, active boolean, alt_price_minor integer)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select p.code, p.label, p.description, p.price_minor, p.currency, p.period_days, p.discount_pct, p.discount_ends_at, p.active, p.alt_price_minor
  from breadmaker.membership_plans p
  where breadmaker.is_team_member();
$$;

drop function if exists breadmaker.set_membership_plan(text, integer, text, integer, integer, timestamptz, boolean);
drop function if exists breadmaker.set_membership_plan(text, integer, text, integer, integer, integer, timestamptz, boolean);
create function breadmaker.set_membership_plan(
  new_description text, new_price_minor integer, new_currency text, new_alt_price_minor integer, new_period_days integer,
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
  if new_price_minor < 0 or (new_alt_price_minor is not null and new_alt_price_minor < 0) or new_currency not in ('NGN', 'USD')
     or new_period_days < 1 or new_period_days > 366 or new_discount_pct < 0 or new_discount_pct > 100 then
    raise exception 'Check the price, currency, length and discount.' using errcode = '22023';
  end if;
  update breadmaker.membership_plans
     set description = coalesce(new_description, ''), price_minor = new_price_minor, currency = new_currency,
         alt_price_minor = new_alt_price_minor, period_days = new_period_days, discount_pct = new_discount_pct,
         discount_ends_at = new_discount_ends_at, active = new_active, updated_at = now()
   where code = 'hub';
end;
$$;

-- ---------------------------------------------------------------------------
-- Studio: program support-level prices (Launchpad, Foundry)

create or replace function breadmaker.list_program_tiers_admin()
returns table (program text, tier text, label text, price_minor integer, currency text, alt_price_minor integer, active boolean)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select t.program, t.tier, t.label, t.price_minor, t.currency, t.alt_price_minor, t.active
  from breadmaker.program_tiers t
  where breadmaker.is_team_member()
  order by t.program, case t.tier when 'self-paced' then 1 when 'guided' then 2 else 3 end;
$$;

create or replace function breadmaker.set_program_tier(
  for_program text, for_tier text, new_price_minor integer, new_currency text, new_alt_price_minor integer, new_active boolean
)
returns void
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
begin
  if not breadmaker.can_edit_content() then
    raise exception 'Only owners and coaches can change prices.' using errcode = '42501';
  end if;
  if new_price_minor < 0 or (new_alt_price_minor is not null and new_alt_price_minor < 0) or new_currency not in ('NGN', 'USD') then
    raise exception 'Check the price and currency.' using errcode = '22023';
  end if;
  update breadmaker.program_tiers
     set price_minor = new_price_minor, currency = new_currency, alt_price_minor = new_alt_price_minor,
         active = new_active, updated_at = now()
   where program = for_program and tier = for_tier;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants

grant execute on function breadmaker.program_tier_list() to anon, authenticated;
grant execute on function breadmaker.leak_test_price_list() to anon, authenticated;
grant execute on function breadmaker.kit_offers() to anon, authenticated;
grant execute on function breadmaker.membership_offer() to anon, authenticated;
grant execute on function breadmaker.list_leak_test_prices_admin() to authenticated;
grant execute on function breadmaker.set_leak_test_price(text, integer, text, integer, integer, integer, boolean) to authenticated;
grant execute on function breadmaker.list_membership_plans_admin() to authenticated;
grant execute on function breadmaker.set_membership_plan(text, integer, text, integer, integer, integer, timestamptz, boolean) to authenticated;
grant execute on function breadmaker.list_program_tiers_admin() to authenticated;
grant execute on function breadmaker.set_program_tier(text, text, integer, text, integer, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Courses and kits: the other-currency amount travels beside the course catalog and the course save.

create or replace function breadmaker.course_alt_prices()
returns table (course_id uuid, alt_price_minor integer)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select c.id, c.alt_price_minor
  from breadmaker.lms_courses c
  where c.alt_price_minor is not null and (c.status = 'Published' or breadmaker.is_team_member());
$$;

create or replace function breadmaker.set_course_alt_price(check_course_id uuid, new_alt_price_minor integer)
returns void
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
begin
  if not breadmaker.can_edit_content() then
    raise exception 'Only owners and coaches can change prices.' using errcode = '42501';
  end if;
  if new_alt_price_minor is not null and new_alt_price_minor < 0 then
    raise exception 'A price cannot be negative.' using errcode = '22023';
  end if;
  update breadmaker.lms_courses set alt_price_minor = new_alt_price_minor, updated_at = now() where id = check_course_id;
end;
$$;

grant execute on function breadmaker.course_alt_prices() to anon, authenticated;
grant execute on function breadmaker.set_course_alt_price(uuid, integer) to authenticated;
