-- New price list (decided 2026-10-22), all in US dollars:
--   Prestige Community   $97 one time, lifetime access, includes every kit
--   Prestige Partner     $300 a month
--   Launchpad            $297, Done-with-you only
--   Foundry              $997, Done-with-you only
--   Leak Test report     $27; report + 30-minute review call $97
--   Kits                 free for Prestige Community members (no longer sold one by one)
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Prestige: Community is a one-time payment. A plan whose period is 36500 days (100 years) is lifetime.

-- Drop whatever check limits period_days (found by its definition, so its name does not matter), then allow 100 years.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'breadmaker.membership_plans'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%period_days%'
  loop
    execute format('alter table breadmaker.membership_plans drop constraint %I', c.conname);
  end loop;
end
$$;
alter table breadmaker.membership_plans add constraint membership_plans_period_days_check check (period_days between 1 and 36500);

create or replace function breadmaker.set_membership_plan(
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
     or new_period_days < 1 or new_period_days > 36500 or new_discount_pct < 0 or new_discount_pct > 100 then
    raise exception 'Check the price, currency, length and discount.' using errcode = '22023';
  end if;
  update breadmaker.membership_plans
     set description = coalesce(new_description, ''), price_minor = new_price_minor, currency = new_currency,
         alt_price_minor = new_alt_price_minor, period_days = new_period_days, discount_pct = new_discount_pct,
         discount_ends_at = new_discount_ends_at, active = new_active, updated_at = now()
   where code = 'hub';
end;
$$;

update breadmaker.membership_plans
   set price_minor = 9700, currency = 'USD', alt_price_minor = null, period_days = 36500, updated_at = now()
 where code = 'hub';

update breadmaker.membership_plans
   set price_minor = 30000, currency = 'USD', alt_price_minor = null, updated_at = now()
 where code = 'partner';

-- ---------------------------------------------------------------------------
-- Launchpad and Foundry: one level, Done-with-you.

update breadmaker.program_tiers
   set price_minor = 29700, currency = 'USD', alt_price_minor = null, active = true, updated_at = now()
 where program = 'launchpad' and tier = 'done-with-you';

update breadmaker.program_tiers
   set price_minor = 99700, currency = 'USD', alt_price_minor = null, active = true, updated_at = now()
 where program = 'foundry' and tier = 'done-with-you';

update breadmaker.program_tiers
   set active = false, updated_at = now()
 where tier in ('self-paced', 'guided');

-- ---------------------------------------------------------------------------
-- Leak Test report

update breadmaker.leak_test_prices
   set price_minor = 2700, currency = 'USD', alt_price_minor = null, updated_at = now()
 where tier = 'report';

update breadmaker.leak_test_prices
   set price_minor = 9700, currency = 'USD', alt_price_minor = null, updated_at = now()
 where tier = 'report_call';

-- ---------------------------------------------------------------------------
-- Kits are listed whether or not they have a price: they are free with Prestige Community.

create or replace function breadmaker.kit_offers()
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
  where c.kit_system_id is not null and c.status = 'Published';
$$;

grant execute on function breadmaker.set_membership_plan(text, integer, text, integer, integer, integer, timestamptz, boolean) to authenticated;
grant execute on function breadmaker.kit_offers() to anon, authenticated;
