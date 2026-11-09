-- Referral program: members share a link and earn a cash commission on what the people they refer pay.
--
-- 1. referral_codes: one short code per member, created the first time they open the Referrals page.
-- 2. referrals: who referred whom. A person can be referred once, only by someone else, only if their
--    account is new (7 days) and they have not paid us before. The site calls claim_referral() after sign-in
--    with the code it kept from the ?ref= link.
-- 3. referral_payouts: money the team has paid out. Commission is NOT stored: it is worked out from the
--    referred person's successful payments (referral_commission_rows), so it can never drift from payments.
-- 4. my_referral_summary() is everything the Referrals page shows. It never reveals who a referral is.
-- 5. referral_ledger_admin() and record_referral_payout() are for the Owner, to pay referrers by bank transfer.
--
-- The rate and the window are set in referral_rate_pct() and referral_window_months(). The page reads them from
-- the summary, so changing them here changes the page too. Run after migration 53. Safe to re-run.

create table if not exists breadmaker.referral_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique check (code = lower(code) and length(code) between 6 and 16),
  created_at timestamptz not null default now()
);

create table if not exists breadmaker.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users(id) on delete cascade,
  referee_id uuid not null unique references auth.users(id) on delete cascade,
  code text not null,
  created_at timestamptz not null default now(),
  check (referrer_id <> referee_id)
);
create index if not exists referrals_referrer_idx on breadmaker.referrals (referrer_id, created_at desc);

create table if not exists breadmaker.referral_payouts (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users(id) on delete cascade,
  currency text not null check (currency in ('NGN', 'USD')),
  amount_minor bigint not null check (amount_minor > 0),
  note text not null default '',
  paid_at timestamptz not null default now()
);
create index if not exists referral_payouts_referrer_idx on breadmaker.referral_payouts (referrer_id);

alter table breadmaker.referral_codes enable row level security;
alter table breadmaker.referrals enable row level security;
alter table breadmaker.referral_payouts enable row level security;
revoke all on breadmaker.referral_codes, breadmaker.referrals, breadmaker.referral_payouts from anon, authenticated;
grant all on breadmaker.referral_codes, breadmaker.referrals, breadmaker.referral_payouts to service_role;

-- The terms. Change them here; the page follows.
create or replace function breadmaker.referral_rate_pct() returns integer language sql immutable as $$ select 20 $$;
create or replace function breadmaker.referral_window_months() returns integer language sql immutable as $$ select 12 $$;

-- Commission per referral and currency: the rate on every successful payment the referred person made after
-- joining through the link, inside the window. Internal: callers go through the functions below.
create or replace function breadmaker.referral_commission_rows(p_referrer uuid default null)
returns table (referral_id uuid, referrer_id uuid, currency text, commission_minor bigint)
language sql
stable
security definer
set search_path = breadmaker, pg_temp
as $$
  select r.id, r.referrer_id, upper(p.currency), sum(floor(p.amount_minor * breadmaker.referral_rate_pct() / 100.0))::bigint
  from breadmaker.referrals r
  join auth.users u on u.id = r.referee_id
  join breadmaker.payments p
    on p.status = 'successful'
   and (p.user_id = r.referee_id or lower(p.email) = lower(u.email))
   and coalesce(p.paid_at, p.created_at) >= r.created_at
   and coalesce(p.paid_at, p.created_at) < r.created_at + make_interval(months => breadmaker.referral_window_months())
  where p_referrer is null or r.referrer_id = p_referrer
  group by r.id, r.referrer_id, upper(p.currency)
$$;
revoke all on function breadmaker.referral_commission_rows(uuid) from public, anon, authenticated;

-- The caller's own code, made on first use.
create or replace function breadmaker.my_referral_code()
returns text
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
declare
  v_me uuid := auth.uid();
  v_code text;
begin
  if v_me is null then
    raise exception 'Sign in first';
  end if;
  select code into v_code from breadmaker.referral_codes where user_id = v_me;
  if v_code is not null then
    return v_code;
  end if;
  loop
    v_code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    begin
      insert into breadmaker.referral_codes (user_id, code) values (v_me, v_code);
      return v_code;
    exception when unique_violation then
      select code into v_code from breadmaker.referral_codes where user_id = v_me;
      if v_code is not null then
        return v_code;
      end if;
    end;
  end loop;
end;
$$;

-- Called by the site after sign-in with the code from the visitor's link. Returns whether the referral was
-- recorded; it never says why not (a wrong guess teaches an abuser nothing).
create or replace function breadmaker.claim_referral(p_code text)
returns boolean
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
declare
  v_me uuid := auth.uid();
  v_referrer uuid;
  v_joined timestamptz;
  v_email text;
  v_code text := lower(btrim(coalesce(p_code, '')));
begin
  if v_me is null or v_code = '' or length(v_code) > 16 then
    return false;
  end if;
  select user_id into v_referrer from breadmaker.referral_codes where code = v_code;
  if v_referrer is null or v_referrer = v_me then
    return false;
  end if;
  if exists (select 1 from breadmaker.referrals where referee_id = v_me) then
    return false;
  end if;
  select created_at, email into v_joined, v_email from auth.users where id = v_me;
  -- Only new accounts count, and only people who have not paid us before.
  if v_joined is null or v_joined < now() - interval '7 days' then
    return false;
  end if;
  if exists (
    select 1 from breadmaker.payments p
    where p.status = 'successful' and (p.user_id = v_me or lower(p.email) = lower(coalesce(v_email, '')))
  ) then
    return false;
  end if;
  insert into breadmaker.referrals (referrer_id, referee_id, code) values (v_referrer, v_me, v_code)
  on conflict (referee_id) do nothing;
  return found;
end;
$$;

-- Everything the Referrals page needs. Referred people stay anonymous: only the date they joined and what
-- they earned the member.
create or replace function breadmaker.my_referral_summary()
returns jsonb
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
declare
  v_me uuid := auth.uid();
  v_code text;
begin
  if v_me is null then
    raise exception 'Sign in first';
  end if;
  v_code := breadmaker.my_referral_code();
  return jsonb_build_object(
    'code', v_code,
    'rate_pct', breadmaker.referral_rate_pct(),
    'window_months', breadmaker.referral_window_months(),
    'earned', coalesce((
      select jsonb_agg(jsonb_build_object('currency', c.currency, 'amount_minor', c.total) order by c.currency)
      from (select currency, sum(commission_minor)::bigint total from breadmaker.referral_commission_rows(v_me) group by currency) c
    ), '[]'::jsonb),
    'paid', coalesce((
      select jsonb_agg(jsonb_build_object('currency', x.currency, 'amount_minor', x.total) order by x.currency)
      from (select currency, sum(amount_minor)::bigint total from breadmaker.referral_payouts where referrer_id = v_me group by currency) x
    ), '[]'::jsonb),
    'referrals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'joined_at', r.created_at,
        'earned', coalesce((
          select jsonb_agg(jsonb_build_object('currency', c.currency, 'amount_minor', c.commission_minor) order by c.currency)
          from breadmaker.referral_commission_rows(v_me) c where c.referral_id = r.id
        ), '[]'::jsonb)
      ) order by r.created_at desc)
      from breadmaker.referrals r where r.referrer_id = v_me
    ), '[]'::jsonb)
  );
end;
$$;

-- Owner: what each referrer has earned, been paid and is still owed, per currency.
create or replace function breadmaker.referral_ledger_admin()
returns table (referrer_id uuid, email text, currency text, referrals bigint, earned_minor bigint, paid_minor bigint, owed_minor bigint)
language plpgsql
stable
security definer
set search_path = breadmaker, pg_temp
as $$
begin
  if not breadmaker.is_owner() then
    raise exception 'Owner only';
  end if;
  return query
  with earned as (
    select c.referrer_id, c.currency, sum(c.commission_minor)::bigint total, count(distinct c.referral_id) people
    from breadmaker.referral_commission_rows(null) c group by c.referrer_id, c.currency
  ), paid as (
    select p.referrer_id, p.currency, sum(p.amount_minor)::bigint total from breadmaker.referral_payouts p group by p.referrer_id, p.currency
  )
  select e.referrer_id, u.email::text, e.currency, e.people, e.total, coalesce(p.total, 0), e.total - coalesce(p.total, 0)
  from earned e
  join auth.users u on u.id = e.referrer_id
  left join paid p on p.referrer_id = e.referrer_id and p.currency = e.currency
  order by (e.total - coalesce(p.total, 0)) desc;
end;
$$;

-- Owner: records a bank transfer to a referrer. Refuses to pay more than is owed.
create or replace function breadmaker.record_referral_payout(p_referrer uuid, p_currency text, p_amount_minor bigint, p_note text default '')
returns uuid
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
declare
  v_currency text := upper(btrim(coalesce(p_currency, '')));
  v_owed bigint;
  v_id uuid;
begin
  if not breadmaker.is_owner() then
    raise exception 'Owner only';
  end if;
  if v_currency not in ('NGN', 'USD') or p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'Give a currency (NGN or USD) and an amount above zero';
  end if;
  select coalesce(sum(c.commission_minor), 0) - coalesce((select sum(amount_minor) from breadmaker.referral_payouts where referrer_id = p_referrer and currency = v_currency), 0)
    into v_owed
  from breadmaker.referral_commission_rows(p_referrer) c
  where c.currency = v_currency;
  if p_amount_minor > v_owed then
    raise exception 'That is more than is owed (% minor units)', v_owed;
  end if;
  insert into breadmaker.referral_payouts (referrer_id, currency, amount_minor, note)
  values (p_referrer, v_currency, p_amount_minor, left(coalesce(p_note, ''), 500))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function breadmaker.my_referral_code() from public, anon;
revoke all on function breadmaker.claim_referral(text) from public, anon;
revoke all on function breadmaker.my_referral_summary() from public, anon;
revoke all on function breadmaker.referral_ledger_admin() from public, anon;
revoke all on function breadmaker.record_referral_payout(uuid, text, bigint, text) from public, anon;
grant execute on function breadmaker.my_referral_code() to authenticated;
grant execute on function breadmaker.claim_referral(text) to authenticated;
grant execute on function breadmaker.my_referral_summary() to authenticated;
grant execute on function breadmaker.referral_ledger_admin() to authenticated;
grant execute on function breadmaker.record_referral_payout(uuid, text, bigint, text) to authenticated;
