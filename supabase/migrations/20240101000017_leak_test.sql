-- Business Leak Test: submissions, report access, prices and partner codes.
--
-- The free test collects a lead (name, email, WhatsApp, consent) and stores the
-- answers. The full report is a paid (or code-unlocked) product, and its
-- content lives in leak_test_report_content, which is only readable through
-- get_leak_test_report() once the submission is unlocked, so the paywall is
-- enforced by the database and not just by the page.
--
-- Public (anon) callers can submit a test, read back their own submission with
-- its secret token, redeem a code and read the price list. Everything else is
-- team-only. Payments reuse breadmaker.payments with program = 'leaktest'.
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Tables

create table if not exists breadmaker.leak_test_submissions (
  id uuid primary key default gen_random_uuid(),
  -- Secret that proves a caller owns this submission. Never listed publicly.
  access_token uuid not null default gen_random_uuid(),
  name text not null,
  email text not null,
  whatsapp text not null,
  consent boolean not null check (consent),
  consented_at timestamptz not null default now(),
  -- industry, business_age, team_size, revenue_band, main_goal (not scored)
  profile jsonb not null default '{}'::jsonb,
  -- 30 answers, 0-4 each, in question order.
  answers integer[] not null check (array_length(answers, 1) = 30),
  -- offer, sales, operations, cash, team, tech
  pillar_scores integer[] not null check (array_length(pillar_scores, 1) = 6),
  total integer not null check (total between 0 and 100),
  band text not null,
  archetype text not null default '',
  leakiest text not null default '',
  owner_dependence integer not null default 0,
  paid_tier text check (paid_tier in ('report', 'report_call')),
  paid_at timestamptz,
  code text,
  -- Set when the result email and lead webhook went out, so a retry never sends twice.
  notified_at timestamptz,
  report_notified_at timestamptz,
  created_at timestamptz not null default now()
);

-- For databases that already have the table from an earlier run.
alter table breadmaker.leak_test_submissions add column if not exists notified_at timestamptz;
alter table breadmaker.leak_test_submissions add column if not exists report_notified_at timestamptz;

create index if not exists leak_test_submissions_email_idx on breadmaker.leak_test_submissions (lower(email));
create index if not exists leak_test_submissions_created_idx on breadmaker.leak_test_submissions (created_at desc);

-- A payment can now buy a report.
alter table breadmaker.payments
  add column if not exists submission_id uuid references breadmaker.leak_test_submissions(id) on delete set null;

create table if not exists breadmaker.leak_test_prices (
  tier text primary key check (tier in ('report', 'report_call')),
  label text not null default '',
  description text not null default '',
  price_minor integer not null check (price_minor >= 0),
  currency text not null check (currency in ('NGN', 'USD')) default 'NGN',
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Starting prices. Validate before locking them; change with an update, no deploy needed.
insert into breadmaker.leak_test_prices (tier, label, description, price_minor, currency) values
  ('report', 'Full report', 'Your full report as a PDF and by email.', 400000, 'NGN'),
  ('report_call', 'Report + 30-minute review call', 'The full report plus a 30-minute call to walk through it.', 2000000, 'NGN')
on conflict (tier) do nothing;

-- Partner codes: accountants, incubators, banks and cooperatives buy these for their clients.
create table if not exists breadmaker.leak_test_codes (
  code text primary key,
  tier text not null check (tier in ('report', 'report_call')) default 'report',
  partner text not null default '',
  max_uses integer not null default 1 check (max_uses > 0),
  uses integer not null default 0 check (uses >= 0),
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- The paid report's text. Only returned by get_leak_test_report().
create table if not exists breadmaker.leak_test_report_content (
  key text primary key,
  body jsonb not null,
  updated_at timestamptz not null default now()
);

insert into breadmaker.leak_test_report_content (key, body) values
  ('pillar:offer', $j$
    {"low": "Customers cannot easily tell what you sell, who it is for or why you cost what you do. That shows up as price haggling, mixed-fit customers and revenue that depends on whoever happens to ask.",
     "ok": "Your offer is mostly clear. The gain now is in tightening it: one sentence, one price list and a firm habit of saying no to poor fits.",
     "plan": [
       "Days 1-3: Write your offer in one sentence: who it is for, the result they get and the price. Test it on three past customers.",
       "Days 4-10: Work out your cost to deliver and the value to the customer, then set or fix your prices from those numbers, not from competitors or mood.",
       "Days 11-20: List the customers who were hard, late or unprofitable. Write three rules for who you will not take on, and use them on the next enquiry.",
       "Days 21-30: Pick the one offer that brings most of your profit. Put it first on your page and in your messages, and stop promoting the rest for now."
     ]}$j$::jsonb),
  ('pillar:sales', $j$
    {"low": "Customers arrive by luck, by referrals you do not ask for, or by your own chasing. Leads go cold because nobody follows up quickly, and you cannot say which channel actually pays.",
     "ok": "Leads come in, but you can get more from them by tracking the numbers and following up faster.",
     "plan": [
       "Days 1-3: List where your last 10 customers came from. Circle the one channel that brought the most money.",
       "Days 4-10: Start a simple enquiry sheet: date, name, source and status. Log every enquiry, even the ones that go nowhere.",
       "Days 11-20: Set a rule to reply within 24 hours and follow up three times over two weeks. Write the follow-up messages once and reuse them.",
       "Days 21-30: Ask your five best customers for one referral each, then work out what share of enquiries became sales."
     ]}$j$::jsonb),
  ('pillar:operations', $j$
    {"low": "The work lives in your head and your chats. Quality changes with whoever does the job, mistakes repeat, and the business stops when you do.",
     "ok": "Delivery mostly holds. Write the process down and track the work in one place so it survives busy weeks.",
     "plan": [
       "Days 1-5: Write the steps of your core delivery, in order, as a checklist anyone could follow.",
       "Days 6-12: Move orders and tasks into one tracker, such as a spreadsheet or a board, and stop tracking them in chat.",
       "Days 13-22: Log every complaint with its cause. Fix the cause of the most common one in the process, not just for that customer.",
       "Days 23-30: Take one working day off and let the checklist run delivery. Fix whatever breaks."
     ]}$j$::jsonb),
  ('pillar:cash', $j$
    {"low": "You cannot say what you earn after costs, business and personal money are mixed, and one slow month could stop you. Money problems here make every other fix harder.",
     "ok": "Your money basics are partly in place. Seeing your profit and holding a buffer are the next gains.",
     "plan": [
       "Days 1-3: Open a separate business account and move all business income and costs through it.",
       "Days 4-10: List your costs and work out the cost to deliver each product or service. Calculate your profit per sale.",
       "Days 11-20: Invoice the day the work is done and chase every late payment on a fixed schedule. Write the reminder messages once.",
       "Days 21-30: Set a weekly transfer into a buffer until it covers one month of costs, and review money in, money out and money owed every Friday."
     ]}$j$::jsonb),
  ('pillar:team', $j$
    {"low": "The business runs through you. Decisions, delivery and fixing problems all wait on you, so growth means more hours and a week away is not possible.",
     "ok": "Some of the business runs without you. Delegating one more function removes the next bottleneck.",
     "plan": [
       "Days 1-3: List everything you did this week and mark what only you can do.",
       "Days 4-12: Pick one function to delegate fully. Write who owns it, what good looks like and what they can decide alone.",
       "Days 13-22: Write the rules for routine decisions, such as refunds and discounts, so they stop waiting on you.",
       "Days 23-30: Gather your materials into an onboarding pack and test it by walking one person through it."
     ]}$j$::jsonb),
  ('pillar:tech', $j$
    {"low": "Customers struggle to find or pay you, repetitive work is done by hand, and customer data sits in one place with no backup or consent, which is a risk under the NDPA.",
     "ok": "Your tools mostly work. Automation, backups and data consent are the next gains.",
     "plan": [
       "Days 1-5: Get a business domain and email, and make sure a customer can find you and pay online in one clear path. Test it yourself.",
       "Days 6-12: Put customer data in one place, back it up and test restoring one backup.",
       "Days 13-22: Automate the three tasks you repeat most, such as invoices, reminders and first replies.",
       "Days 23-30: Add a consent line wherever you collect customer data, write a short privacy notice and turn on two-step sign-in everywhere."
     ]}$j$::jsonb),
  ('archetype:hustler', $j$
    {"cover": "You sell well, so protect what you sell. Write the delivery process down and hand one function to someone else before you take on more customers."}$j$::jsonb),
  ('archetype:steward', $j$
    {"cover": "Your house is in order. Pick one channel, put weekly effort into getting leads, and track how many become customers."}$j$::jsonb),
  ('archetype:visionary', $j$
    {"cover": "Your offer pulls people in. Slow down enough to know your profit per sale and to track the work, so growth does not outrun the money."}$j$::jsonb),
  ('archetype:builder', $j$
    {"cover": "Your systems are strong. Spend the next month getting in front of buyers: pick a channel, follow up fast and track conversion."}$j$::jsonb),
  ('archetype:operator', $j$
    {"cover": "You are balanced. Choose the one pillar that would change the business most and push it hard for a quarter."}$j$::jsonb),
  ('owner_dependence', $j$
    {"title": "Owner dependence",
     "body": "These four answers show how much the business leans on you. A low total means decisions, delivery or both wait on you, which caps growth and makes time off risky.",
     "low": "Below 8 out of 16 is a warning. Delegate one function fully and write the rules for routine decisions first."}$j$::jsonb)
on conflict (key) do update set body = excluded.body, updated_at = now();

-- ---------------------------------------------------------------------------
-- Public RPCs

-- Stores a finished test and returns the id and secret token for reading it back.
create or replace function breadmaker.submit_leak_test(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
declare
  v_name text := trim(coalesce(payload->>'name', ''));
  v_email text := lower(trim(coalesce(payload->>'email', '')));
  v_whatsapp text := trim(coalesce(payload->>'whatsapp', ''));
  v_answers integer[];
  v_pillars integer[] := '{}';
  v_total integer;
  v_band text;
  v_owner integer;
  v_id uuid;
  v_token uuid;
  i integer;
begin
  if v_name = '' then
    raise exception 'Please add your name.' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then
    raise exception 'Please add a valid email address.' using errcode = '22023';
  end if;
  if length(regexp_replace(v_whatsapp, '\D', '', 'g')) < 7 then
    raise exception 'Please add your WhatsApp number.' using errcode = '22023';
  end if;
  if coalesce((payload->>'consent')::boolean, false) is not true then
    raise exception 'Please tick the consent box to see your result.' using errcode = '22023';
  end if;

  select array_agg(value::integer order by ord)
    into v_answers
    from jsonb_array_elements_text(coalesce(payload->'answers', '[]'::jsonb)) with ordinality as t(value, ord);
  if v_answers is null or array_length(v_answers, 1) <> 30
     or exists (select 1 from unnest(v_answers) a where a < 0 or a > 4) then
    raise exception 'The test needs 30 answers between 0 and 4.' using errcode = '22023';
  end if;

  for i in 0..5 loop
    v_pillars := v_pillars || round((
      v_answers[i * 5 + 1] + v_answers[i * 5 + 2] + v_answers[i * 5 + 3] + v_answers[i * 5 + 4] + v_answers[i * 5 + 5]
    )::numeric / 20 * 100)::integer;
  end loop;

  v_total := round((select avg(p) from unnest(v_pillars) p))::integer;
  v_band := case when v_total < 40 then 'firefighting' when v_total < 60 then 'surviving' when v_total < 80 then 'stabilising' else 'scaling' end;
  v_owner := v_answers[15] + v_answers[22] + v_answers[23] + v_answers[25];

  insert into breadmaker.leak_test_submissions
    (name, email, whatsapp, consent, profile, answers, pillar_scores, total, band, archetype, leakiest, owner_dependence)
  values (
    v_name, v_email, v_whatsapp, true,
    coalesce(payload->'profile', '{}'::jsonb),
    v_answers, v_pillars, v_total, v_band,
    left(coalesce(payload->>'archetype', ''), 60),
    left(coalesce(payload->>'leakiest', ''), 60),
    v_owner
  )
  returning id, access_token into v_id, v_token;

  return jsonb_build_object('id', v_id, 'token', v_token);
end;
$$;

-- A caller's own submission, proven by its token. Never includes the email.
create or replace function breadmaker.get_leak_test(sub_id uuid, sub_token uuid)
returns jsonb
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select jsonb_build_object(
    'id', s.id,
    'name', s.name,
    'answers', to_jsonb(s.answers),
    'profile', s.profile,
    'pillar_scores', to_jsonb(s.pillar_scores),
    'total', s.total,
    'band', s.band,
    'archetype', s.archetype,
    'leakiest', s.leakiest,
    'owner_dependence', s.owner_dependence,
    'paid_tier', s.paid_tier
  )
  from breadmaker.leak_test_submissions s
  where s.id = sub_id and s.access_token = sub_token;
$$;

-- The paid report's content and benchmark. Refuses until the submission is unlocked.
create or replace function breadmaker.get_leak_test_report(sub_id uuid, sub_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
declare
  s breadmaker.leak_test_submissions;
  v_content jsonb;
  v_total integer;
  v_scope integer;
  v_benchmark jsonb;
begin
  select * into s from breadmaker.leak_test_submissions where id = sub_id and access_token = sub_token;
  if s.id is null then
    raise exception 'We could not find that result.' using errcode = '42501';
  end if;
  if s.paid_tier is null then
    raise exception 'The full report is not unlocked for this result.' using errcode = '42501';
  end if;

  select jsonb_object_agg(key, body) into v_content from breadmaker.leak_test_report_content;

  select count(*)::integer into v_total from breadmaker.leak_test_submissions;
  select count(*)::integer into v_scope
    from breadmaker.leak_test_submissions
    where nullif(s.profile->>'industry', '') is not null and profile->>'industry' = s.profile->>'industry';

  -- Benchmarks only appear once there is enough data to mean something.
  if v_scope >= 30 then
    select jsonb_build_object('ready', true, 'scope', 'industry', 'industry', s.profile->>'industry', 'count', v_scope,
      'pillars', jsonb_build_array(
        round(avg(pillar_scores[1])), round(avg(pillar_scores[2])), round(avg(pillar_scores[3])),
        round(avg(pillar_scores[4])), round(avg(pillar_scores[5])), round(avg(pillar_scores[6]))),
      'total', round(avg(total)))
      into v_benchmark
      from breadmaker.leak_test_submissions
      where profile->>'industry' = s.profile->>'industry';
  elsif v_total >= 30 then
    select jsonb_build_object('ready', true, 'scope', 'all', 'count', v_total,
      'pillars', jsonb_build_array(
        round(avg(pillar_scores[1])), round(avg(pillar_scores[2])), round(avg(pillar_scores[3])),
        round(avg(pillar_scores[4])), round(avg(pillar_scores[5])), round(avg(pillar_scores[6]))),
      'total', round(avg(total)))
      into v_benchmark
      from breadmaker.leak_test_submissions;
  else
    v_benchmark := jsonb_build_object('ready', false, 'count', v_total);
  end if;

  return jsonb_build_object('content', coalesce(v_content, '{}'::jsonb), 'benchmark', v_benchmark, 'paid_tier', s.paid_tier);
end;
$$;

create or replace function breadmaker.leak_test_price_list()
returns table (tier text, label text, description text, price_minor integer, currency text)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select tier, label, description, price_minor, currency
  from breadmaker.leak_test_prices
  where active
  order by price_minor;
$$;

-- Unlocks the report with a partner code.
create or replace function breadmaker.redeem_leak_test_code(sub_id uuid, sub_token uuid, redeem_code text)
returns text
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
declare
  s breadmaker.leak_test_submissions;
  c breadmaker.leak_test_codes;
begin
  select * into s from breadmaker.leak_test_submissions where id = sub_id and access_token = sub_token;
  if s.id is null then
    raise exception 'We could not find that result.' using errcode = '42501';
  end if;
  -- Already unlocked: do not spend a code twice.
  if s.paid_tier is not null then
    return s.paid_tier;
  end if;

  select * into c from breadmaker.leak_test_codes where code = upper(trim(redeem_code)) for update;
  if c.code is null or not c.active or (c.expires_at is not null and c.expires_at < now()) or c.uses >= c.max_uses then
    raise exception 'That code is not valid.' using errcode = '22023';
  end if;

  update breadmaker.leak_test_codes set uses = uses + 1 where code = c.code;
  update breadmaker.leak_test_submissions set paid_tier = c.tier, paid_at = now(), code = c.code where id = s.id;
  return c.tier;
end;
$$;

-- ---------------------------------------------------------------------------
-- Service-role: settle a payment into an unlocked report. Called by the
-- Flutterwave edge functions after the transaction is verified.
-- Returns the submission id, or null if the payment is not a paid report.

create or replace function breadmaker.grant_leak_test_report(check_tx_ref text)
returns uuid
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
declare
  p breadmaker.payments;
  s breadmaker.leak_test_submissions;
begin
  select * into p from breadmaker.payments where tx_ref = check_tx_ref;
  if p.id is null or p.program <> 'leaktest' or p.status <> 'successful' or p.submission_id is null then
    return null;
  end if;
  select * into s from breadmaker.leak_test_submissions where id = p.submission_id;
  if s.id is null then
    return null;
  end if;
  -- Never downgrade: a call booking stays a call booking.
  update breadmaker.leak_test_submissions
     set paid_tier = case when s.paid_tier = 'report_call' then 'report_call' else p.tier end,
         paid_at = coalesce(paid_at, now())
   where id = s.id;
  return s.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Team

create or replace function breadmaker.list_leak_test_leads()
returns table (
  id uuid, created_at timestamptz, name text, email text, whatsapp text, profile jsonb,
  total integer, band text, archetype text, leakiest text, owner_dependence integer,
  paid_tier text, code text
)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select s.id, s.created_at, s.name, s.email, s.whatsapp, s.profile,
         s.total, s.band, s.archetype, s.leakiest, s.owner_dependence, s.paid_tier, s.code
  from breadmaker.leak_test_submissions s
  where breadmaker.is_team_member()
  order by s.created_at desc;
$$;

-- Makes a batch of partner codes, e.g. select * from breadmaker.create_leak_test_codes('Acme Accountants', 'report', 50);
create or replace function breadmaker.create_leak_test_codes(
  for_partner text, for_tier text, how_many integer, per_code_uses integer default 1, valid_until timestamptz default null
)
returns setof text
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
declare
  v_code text;
  made integer := 0;
begin
  if not breadmaker.can_edit_content() then
    raise exception 'Only owners and coaches can create codes.' using errcode = '42501';
  end if;
  if for_tier not in ('report', 'report_call') then
    raise exception 'Unknown tier.' using errcode = '22023';
  end if;
  if how_many < 1 or how_many > 500 then
    raise exception 'Create between 1 and 500 codes at a time.' using errcode = '22023';
  end if;
  while made < how_many loop
    v_code := 'BM-' || upper(substr(md5(gen_random_uuid()::text), 1, 8));
    insert into breadmaker.leak_test_codes (code, tier, partner, max_uses, expires_at)
    values (v_code, for_tier, coalesce(for_partner, ''), per_code_uses, valid_until)
    on conflict (code) do nothing;
    if found then
      made := made + 1;
      return next v_code;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security: nothing is readable directly; the RPCs above are the surface.

alter table breadmaker.leak_test_submissions enable row level security;
alter table breadmaker.leak_test_prices enable row level security;
alter table breadmaker.leak_test_codes enable row level security;
alter table breadmaker.leak_test_report_content enable row level security;

drop policy if exists "Team read leak test submissions" on breadmaker.leak_test_submissions;
create policy "Team read leak test submissions" on breadmaker.leak_test_submissions
  for select using (breadmaker.is_team_member());

drop policy if exists "Team manage leak test prices" on breadmaker.leak_test_prices;
create policy "Team manage leak test prices" on breadmaker.leak_test_prices
  for all using (breadmaker.is_team_member()) with check (breadmaker.can_edit_content());

drop policy if exists "Team manage leak test codes" on breadmaker.leak_test_codes;
create policy "Team manage leak test codes" on breadmaker.leak_test_codes
  for all using (breadmaker.is_team_member()) with check (breadmaker.can_edit_content());

drop policy if exists "Team manage leak test report content" on breadmaker.leak_test_report_content;
create policy "Team manage leak test report content" on breadmaker.leak_test_report_content
  for all using (breadmaker.is_team_member()) with check (breadmaker.can_edit_content());

-- ---------------------------------------------------------------------------
-- Grants

grant select on breadmaker.leak_test_submissions to authenticated;
grant select, insert, update on breadmaker.leak_test_prices to authenticated;
grant select, insert, update on breadmaker.leak_test_codes to authenticated;
grant select, insert, update on breadmaker.leak_test_report_content to authenticated;

grant execute on function breadmaker.submit_leak_test(jsonb) to anon, authenticated;
grant execute on function breadmaker.get_leak_test(uuid, uuid) to anon, authenticated;
grant execute on function breadmaker.get_leak_test_report(uuid, uuid) to anon, authenticated;
grant execute on function breadmaker.leak_test_price_list() to anon, authenticated;
grant execute on function breadmaker.redeem_leak_test_code(uuid, uuid, text) to anon, authenticated;
grant execute on function breadmaker.list_leak_test_leads() to authenticated;
grant execute on function breadmaker.create_leak_test_codes(text, text, integer, integer, timestamptz) to authenticated;
-- Called by the edge functions only, with the service role key. Postgres grants EXECUTE
-- to PUBLIC by default, so take it away from everyone else explicitly.
revoke execute on function breadmaker.grant_leak_test_report(text) from public, anon, authenticated;
grant execute on function breadmaker.grant_leak_test_report(text) to service_role;
