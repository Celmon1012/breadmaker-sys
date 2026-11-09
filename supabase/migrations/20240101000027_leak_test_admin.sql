-- Leak Test admin: delete a result, edit the report prices and the launch discount from Studio.
-- Safe to re-run.

-- The launch discount (also set up by migration 19, repeated so this file stands alone).
alter table breadmaker.leak_test_prices add column if not exists discount_pct integer not null default 0 check (discount_pct between 0 and 100);
alter table breadmaker.leak_test_prices add column if not exists discount_hours integer not null default 0 check (discount_hours >= 0);

-- Every price row, including switched-off ones, for the Studio editor.
-- Later migrations change these signatures, so a re-run starts from a clean slate.
drop function if exists breadmaker.list_leak_test_prices_admin();
drop function if exists breadmaker.set_leak_test_price(text, integer, text, integer, integer, boolean);
drop function if exists breadmaker.set_leak_test_price(text, integer, text, integer, integer, integer, boolean);
create function breadmaker.list_leak_test_prices_admin()
returns table (tier text, label text, description text, price_minor integer, currency text, active boolean, discount_pct integer, discount_hours integer)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select p.tier, p.label, p.description, p.price_minor, p.currency, p.active, p.discount_pct, p.discount_hours
  from breadmaker.leak_test_prices p
  where breadmaker.is_team_member()
  order by p.price_minor;
$$;

create function breadmaker.set_leak_test_price(
  for_tier text, new_price_minor integer, new_currency text, new_discount_pct integer, new_discount_hours integer, new_active boolean
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
  if new_price_minor < 0 then
    raise exception 'The price cannot be negative.' using errcode = '22023';
  end if;
  if new_currency not in ('NGN', 'USD') then
    raise exception 'Currency must be NGN or USD.' using errcode = '22023';
  end if;
  if new_discount_pct < 0 or new_discount_pct > 100 or new_discount_hours < 0 then
    raise exception 'The discount must be 0 to 100 percent, for 0 or more hours.' using errcode = '22023';
  end if;
  update breadmaker.leak_test_prices
     set price_minor = new_price_minor, currency = new_currency, discount_pct = new_discount_pct,
         discount_hours = new_discount_hours, active = new_active, updated_at = now()
   where tier = for_tier;
end;
$$;

-- Permanently removes a result. Payments keep their record (submission_id is set to null).
create or replace function breadmaker.delete_leak_test(sub_id uuid)
returns void
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
begin
  if not breadmaker.can_edit_content() then
    raise exception 'Only owners and coaches can delete a result.' using errcode = '42501';
  end if;
  delete from breadmaker.leak_test_submissions where id = sub_id;
end;
$$;

grant execute on function breadmaker.list_leak_test_prices_admin() to authenticated;
grant execute on function breadmaker.set_leak_test_price(text, integer, text, integer, integer, boolean) to authenticated;
grant execute on function breadmaker.delete_leak_test(uuid) to authenticated;
