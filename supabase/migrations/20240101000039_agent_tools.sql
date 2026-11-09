-- Support for the Breadmaker chat agent (n8n + Claude, replying on WhatsApp through Kumoda).
--
-- The agent never reads tables directly. Everything it can see comes through the functions below, which only the
-- service role can run (the agent-tools edge function calls them):
--   agent_prices()               the live price list, so the agent never quotes a stale price
--   agent_customer_lookup(phone) what we hold for the person writing, found by their WhatsApp number
--   agent_turns                  one row per message the agent handled: the log, and the guard against answering twice
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- The turn log

create table if not exists breadmaker.agent_turns (
  id uuid primary key default gen_random_uuid(),
  -- Kumoda's message id. Unique, so a webhook that is delivered twice is answered once.
  message_id text not null unique,
  conversation_id text not null default '',
  phone text not null default '',
  user_text text not null default '',
  reply_text text not null default '',
  tools jsonb not null default '[]'::jsonb,
  -- Checks run on the reply before it was sent, for example {"blocked": ["amount_not_from_tools"]}.
  guards jsonb not null default '{}'::jsonb,
  handed_over boolean not null default false,
  model text not null default '',
  latency_ms integer,
  error text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists agent_turns_conversation_idx on breadmaker.agent_turns (conversation_id, created_at desc);
create index if not exists agent_turns_created_idx on breadmaker.agent_turns (created_at desc);

alter table breadmaker.agent_turns enable row level security;
drop policy if exists "Team read agent turns" on breadmaker.agent_turns;
create policy "Team read agent turns" on breadmaker.agent_turns for select to authenticated using (breadmaker.is_team_member());
grant select on breadmaker.agent_turns to authenticated;
grant select, insert, update on breadmaker.agent_turns to service_role;

-- ---------------------------------------------------------------------------
-- Live prices

create or replace function breadmaker.agent_prices()
returns jsonb
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select jsonb_build_object(
    'programs', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'program', t.program, 'level', t.tier, 'label', t.label,
        'price_minor', t.price_minor, 'currency', t.currency, 'alt_price_minor', t.alt_price_minor
      ) order by t.program, t.tier), '[]'::jsonb)
      from breadmaker.program_tiers t where t.active
    ),
    'leak_test', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'tier', p.tier, 'label', p.label,
        'price_minor', p.price_minor, 'currency', p.currency, 'alt_price_minor', p.alt_price_minor
      ) order by p.price_minor), '[]'::jsonb)
      from breadmaker.leak_test_prices p where p.active
    ),
    'prestige', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'plan', m.code, 'label', m.label,
        'price_minor', m.price_minor, 'currency', m.currency, 'alt_price_minor', m.alt_price_minor,
        'one_time', m.period_days >= 3650, 'on_sale', m.active
      ) order by m.code), '[]'::jsonb)
      from breadmaker.membership_plans m
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- What we hold for the person writing, found by their WhatsApp number.
--
-- The number must match a record we hold (the Leak Test, an application or a payment), compared on its last nine
-- digits so +234, 0 and spaces do not matter. Emails seen with that number then widen the search to the same
-- person's other records. No match returns found = false and nothing else, so an email typed into a chat cannot
-- be used to read someone else's records.

create or replace function breadmaker.agent_customer_lookup(p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_tail text;
  v_emails text[];
  v_name text;
begin
  if length(v_digits) < 9 then
    return jsonb_build_object('found', false, 'reason', 'no usable phone number');
  end if;
  v_tail := right(v_digits, 9);

  select coalesce(array_agg(distinct s.e), '{}') into v_emails
  from (
    select lower(email) as e from breadmaker.leak_test_submissions where right(regexp_replace(whatsapp, '\D', '', 'g'), 9) = v_tail
    union
    select lower(email) from breadmaker.applications where right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9) = v_tail
    union
    select lower(email) from breadmaker.payments where right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9) = v_tail
  ) s;

  if cardinality(v_emails) = 0 then
    return jsonb_build_object('found', false);
  end if;

  select name into v_name from (
    select name, created_at from breadmaker.leak_test_submissions where lower(email) = any (v_emails)
    union all
    select name, created_at from breadmaker.applications where lower(email) = any (v_emails)
  ) n where coalesce(name, '') <> '' order by created_at desc limit 1;

  return jsonb_build_object(
    'found', true,
    'name', coalesce(v_name, ''),
    'leak_tests', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'taken_on', l.created_at::date, 'score', l.total, 'band', l.band, 'archetype', l.archetype,
        'biggest_leak', l.leakiest, 'paid_tier', l.paid_tier, 'call_status', l.call_status
      ) order by l.created_at desc), '[]'::jsonb)
      from (select * from breadmaker.leak_test_submissions where lower(email) = any (v_emails) order by created_at desc limit 3) l
    ),
    'applications', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'program', a.program, 'level', a.tier, 'status', a.status, 'applied_on', a.created_at::date
      ) order by a.created_at desc), '[]'::jsonb)
      from (select * from breadmaker.applications where lower(email) = any (v_emails) order by created_at desc limit 5) a
    ),
    'payments', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'for', case when p.program = 'leaktest' then 'Leak Test report' when p.program = 'membership' then 'Prestige' else p.program end,
        'level', p.tier, 'status', p.status, 'amount_minor', p.amount_minor, 'currency', p.currency, 'paid_on', p.paid_at::date,
        'started_on', p.created_at::date
      ) order by p.created_at desc), '[]'::jsonb)
      from (select * from breadmaker.payments where lower(email) = any (v_emails) order by created_at desc limit 5) p
    ),
    'membership', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'plan', m.plan_code, 'active', m.current_period_end > now(),
        'lifetime', m.current_period_end > now() + interval '50 years',
        'ends_on', case when m.current_period_end > now() + interval '50 years' then null else m.current_period_end::date end
      )), '[]'::jsonb)
      from breadmaker.memberships m where m.email = any (v_emails)
    )
  );
end;
$$;

revoke execute on function breadmaker.agent_prices() from public, anon, authenticated;
revoke execute on function breadmaker.agent_customer_lookup(text) from public, anon, authenticated;
grant execute on function breadmaker.agent_prices() to service_role;
grant execute on function breadmaker.agent_customer_lookup(text) to service_role;
