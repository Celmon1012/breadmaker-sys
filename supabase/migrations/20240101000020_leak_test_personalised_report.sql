-- Business Leak Test: a report that is specific to the business.
--
--   1. Profile-aware content: notes and extra plan actions chosen from the five profile
--      answers (goal, team size, revenue, age, industry). Stored in leak_test_report_content
--      as rows keyed profile:<dimension>, so they can be edited with no deploy.
--   2. Intake: three short questions asked after the report is unlocked.
--   3. AI-written section: generated once by the leak-test-generate function from the
--      scores, profile and intake, then stored on the submission. Report-only buyers get it
--      straight away. Report + call buyers get it after the team reviews and releases it.
--   4. Call tracking for the Report + call tier.
--
-- Safe to re-run.

alter table breadmaker.leak_test_submissions
  add column if not exists intake jsonb,
  add column if not exists intake_at timestamptz,
  add column if not exists ai_status text not null default 'none',
  add column if not exists ai_started_at timestamptz,
  add column if not exists ai_generated_at timestamptz,
  add column if not exists ai_report jsonb,
  add column if not exists ai_released boolean not null default false,
  add column if not exists call_status text,
  add column if not exists call_booked_at timestamptz,
  add column if not exists call_notes text;

alter table breadmaker.leak_test_submissions drop constraint if exists leak_test_ai_status_check;
alter table breadmaker.leak_test_submissions
  add constraint leak_test_ai_status_check check (ai_status in ('none', 'pending', 'generating', 'ready', 'failed'));
alter table breadmaker.leak_test_submissions drop constraint if exists leak_test_call_status_check;
alter table breadmaker.leak_test_submissions
  add constraint leak_test_call_status_check check (call_status is null or call_status in ('to_book', 'booked', 'done'));

-- ---------------------------------------------------------------------------
-- Profile-aware content. Each row is { "<option label>": { "note": text, "focus": pillar id,
-- "boost": { "<pillar id>": extra action } } }. "focus" (main goal only) names the pillar the
-- goal points at; "boost" adds one action to that pillar's plan when it is in the top two.

insert into breadmaker.leak_test_report_content (key, body) values
  ('profile:main_goal', $j$
    {"Get more customers": {"focus": "sales", "note": "Your goal is more customers, so the Sales plan matters to you even where another pillar scores lower. More leads into a leaky business only makes the leak bigger, so fix the leaks below while you build lead flow.", "boost": {"sales": "Choose one channel for your goal of more customers and put a fixed weekly slot into it, such as two hours of outreach every Tuesday."}},
     "Make more profit": {"focus": "cash", "note": "Your goal is profit, which comes from price, cost and waste before it comes from more sales. Know your profit on each sale first.", "boost": {"cash": "For your goal of more profit, work out profit per sale for your top three offers and raise the price or cut the cost on the weakest one."}},
     "Spend less time working in the business": {"focus": "team", "note": "Your goal is time back. That means getting work out of your head and into checklists and other hands, in that order.", "boost": {"operations": "To free your time, record yourself doing your most repeated task once, then turn the recording into a checklist someone else can follow.", "team": "To free your time, pick the task that takes most of your week and hand it over with a written checklist and a check-in after the first week."}},
     "Hire and delegate": {"focus": "team", "note": "You plan to hire, so the process has to exist before the person arrives. Hiring into a business with no written process produces confusion, not relief.", "boost": {"team": "Before you hire, write the job's weekly tasks, how you will judge good work and what the person can decide alone.", "operations": "Write the steps of the role you will hire for, so a new person can follow them from day one."}},
     "Systemise and automate": {"focus": "operations", "note": "You want systems and automation. Order matters: write the process, run it by hand, then automate the parts that never change.", "boost": {"operations": "For your goal of systems, write the process first, run it by hand twice, then list the steps that never change as your automation candidates.", "tech": "Automate one step that never changes, such as the confirmation message after an order, before touching anything harder."}},
     "Prepare to raise money": {"focus": "cash", "note": "Investors and lenders read your numbers before they read your pitch. Clean records, a clear offer and a business that does not depend only on you all raise your chances.", "boost": {"cash": "Prepare a one-page summary: the problem you solve, who pays, your income and costs for the last 12 months, and what the money will be used for.", "offer": "Write down your offer, your buyers and your price in one page. Lenders and investors need to repeat it back to someone else."}}}
  $j$::jsonb),
  ('profile:team_size', $j$
    {"Just me": {"note": "You are the whole team, so every hour on admin is an hour not selling or delivering. Systems matter more for you than for almost anyone.", "boost": {"operations": "As a solo owner, book two fixed hours a week for admin and treat them like a client meeting.", "team": "Before hiring, list the three tasks that eat most of your week and find a tool, template or freelancer for the first one."}},
     "2 to 5": {"note": "A small team runs on shared habits. Who does what, and who decides what, should be written down before one more person joins.", "boost": {"team": "Hold a 15-minute meeting every Monday: what each person owns this week and what is blocked.", "operations": "Put every job in one shared tracker so nobody asks you where things stand."}},
     "6 to 15": {"note": "At this size you become the bottleneck unless leads own parts of the business. Growth now depends on who you trust with decisions.", "boost": {"team": "Name one lead per function and write the limit of what each can decide without you, such as refunds up to a set amount."}},
     "16 to 50": {"note": "With this many people, undocumented processes show up as weekly rework and mistakes. Consistency is the next gain.", "boost": {"operations": "Document your three most error-prone processes and give each an owner who reviews it every month."}},
     "Over 50": {"note": "At your size the business needs figures it can read weekly without asking you. Reporting and consistency matter most.", "boost": {"cash": "Set up a one-page weekly view: money in, money out, money owed and orders in progress.", "operations": "Choose one process that varies most between teams or branches and standardise it first."}}}
  $j$::jsonb),
  ('profile:business_age', $j$
    {"Under 1 year": {"note": "You are still finding what works. Do not over-build yet: prove one offer and one way of finding customers before adding more.", "boost": {"offer": "Pick one offer and one channel and run them for 30 days before adding anything new."}},
     "1 to 2 years": {"note": "The first rush of customers has probably passed. This is the time to see who came back and why.", "boost": {"sales": "List your repeat customers and ask your best three why they came back. Use their words in your messages."}},
     "3 to 5 years": {"note": "Your habits are set by now, good and bad. Writing down what you actually do shows which to keep.", "boost": {"operations": "Write down how a typical job runs from enquiry to payment, as it is done today, before you change anything."}},
     "6 to 10 years": {"note": "Years of workarounds build up. Look for manual steps that nobody has questioned in a long time.", "boost": {"tech": "List the manual steps you repeat every week and automate the one that takes the most time."}},
     "Over 10 years": {"note": "Established businesses can drift from how buyers now find and pay. The risk is being easy to ignore, not being bad at the work.", "boost": {"tech": "Pretend to be a new customer on your phone: find you, contact you and pay. Fix the first thing that is hard.", "sales": "Ask your five longest customers how they would find a business like yours today, and check you show up there."}}}
  $j$::jsonb),
  ('profile:revenue_band', $j$
    {"Under ₦200,000": {"note": "At this level one lost customer or one late payment is felt at once, so cash habits matter most.", "boost": {"cash": "Track every naira in and out for 30 days in one sheet, with your personal spending kept separate."}},
     "₦200,000 to ₦1 million": {"note": "You have proof that people pay. The next step is knowing your profit on each sale.", "boost": {"cash": "Work out cost to deliver and profit for each product or service, and mark the one that earns least for its effort."}},
     "₦1 million to ₦5 million": {"note": "Mistakes now cost real money, yet one person can still hold everything together. That is the moment to start writing things down.", "boost": {"operations": "Write the checklist for your most common job and use it for the next five jobs, fixing it each time something is missing."}},
     "₦5 million to ₦20 million": {"note": "Growth here needs systems more than effort. What works at one million tends to break at ten.", "boost": {"team": "List the decisions that wait on you each week and hand over the three most routine ones with written limits."}},
     "Over ₦20 million": {"note": "At this scale the risk is concentration: one customer, one supplier or one person that everything depends on.", "boost": {"cash": "List your top five customers and what share of income each brings. If one is above a third, plan how to reduce that dependence."}},
     "Prefer not to say": {"note": "You chose not to share your revenue, so the money notes in this report are general."}}
  $j$::jsonb),
  ('profile:industry', $j$
    {"Retail and e-commerce": {"note": "Stock, delivery and repeat buyers decide your margin. Many shops sell well and still lose money on returns and delivery.", "boost": {"cash": "Calculate profit per product after delivery, packaging and returns, then reprice or drop the three worst."}},
     "Food and hospitality": {"note": "Waste and busy-hour chaos are your hidden costs. Standard recipes and prep lists protect both quality and margin.", "boost": {"operations": "Write a standard recipe card and prep list for your five best sellers."}},
     "Professional services": {"note": "You sell time and trust. Unclear scope, loose pricing and late payment are where services businesses leak.", "boost": {"offer": "Write a one-page scope for your main service: what is included, what is not and what triggers an extra charge."}},
     "Beauty and wellness": {"note": "Missed appointments and empty slots are the leak. Online booking and reminders usually pay for themselves.", "boost": {"tech": "Move bookings online with an automatic reminder the day before, and ask for a deposit on long appointments."}},
     "Fashion": {"note": "Fashion ties money up in stock and custom orders. Deposits and clear lead times protect your cash.", "boost": {"cash": "Take a deposit on every custom order and state the delivery date in writing."}},
     "Agriculture": {"note": "Timing, storage and buyer terms decide your margin. Knowing your cost per unit lets you sell ahead with confidence.", "boost": {"cash": "Work out cost per unit for each crop or product and agree buyer terms before harvest, not after."}},
     "Education and training": {"note": "Your product can be repeated, so it can be standardised and sold again without rebuilding it each time.", "boost": {"operations": "Package your best class as a fixed outline with set sessions, so it is delivered the same way every time."}},
     "Construction and real estate": {"note": "Big tickets and long cycles mean cash flow depends on payment milestones and fast follow-up.", "boost": {"cash": "Tie every job to written payment milestones and invoice the day each one is reached."}},
     "Tech and digital": {"note": "Scope creep and undefined offers are the usual leaks. Productising what you sell makes both pricing and delivery easier.", "boost": {"offer": "Turn your most common project into a fixed-scope, fixed-price package with a written list of what is not included."}},
     "Health care": {"note": "Trust, records and consent come first. Patient data must be protected and handled the same way every time.", "boost": {"tech": "Keep patient or client records in one secure place with restricted access and a tested backup, and record consent in writing."}},
     "Logistics and transport": {"note": "Margins are thin and late payment hurts. Cost per trip and fixed customer terms decide whether you profit.", "boost": {"cash": "Track cost per trip and invoice at delivery with written payment terms."}},
     "Manufacturing": {"note": "Process consistency and wasted stock decide your margin, so the process needs to be written, not remembered.", "boost": {"operations": "Write the production steps for your top product and record waste for one month."}},
     "Other": {"note": "Your industry is not listed, so these notes follow your team size, age, revenue and goal."}}
  $j$::jsonb)
on conflict (key) do update set body = excluded.body, updated_at = now();

-- ---------------------------------------------------------------------------
-- The report, now with profile notes, intake state, the AI section and call details.

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
  v_notes jsonb;
  v_ai jsonb;
  v_ai_status text;
begin
  select * into s from breadmaker.leak_test_submissions where id = sub_id and access_token = sub_token;
  if s.id is null then
    raise exception 'We could not find that result.' using errcode = '42501';
  end if;
  if s.paid_tier is null then
    raise exception 'The full report is not unlocked for this result.' using errcode = '42501';
  end if;

  select jsonb_object_agg(key, body) into v_content
    from breadmaker.leak_test_report_content where key not like 'profile:%';

  select coalesce(jsonb_agg(
           jsonb_build_object('dimension', d.dim, 'option', s.profile->>d.dim) || (rc.body -> (s.profile->>d.dim))
           order by d.ord), '[]'::jsonb)
    into v_notes
    from unnest(array['main_goal', 'team_size', 'revenue_band', 'business_age', 'industry']) with ordinality as d(dim, ord)
    join breadmaker.leak_test_report_content rc on rc.key = 'profile:' || d.dim
    where rc.body -> (s.profile->>d.dim) is not null;

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

  -- The AI section is shown when it is ready, except that Report + call buyers wait for the
  -- team to review it ("review"), and nothing shows until the intake questions are answered.
  v_ai_status := s.ai_status;
  if s.ai_status = 'ready' then
    if s.paid_tier = 'report_call' and not s.ai_released then
      v_ai_status := 'review';
    else
      v_ai := s.ai_report;
    end if;
  end if;

  return jsonb_build_object(
    'content', coalesce(v_content, '{}'::jsonb),
    'benchmark', v_benchmark,
    'paid_tier', s.paid_tier,
    'profile_notes', v_notes,
    'intake_done', s.intake is not null,
    'ai_status', v_ai_status,
    'ai', v_ai,
    'contact', jsonb_build_object('name', s.name, 'email', s.email),
    'call', case when s.paid_tier = 'report_call'
                 then jsonb_build_object('status', coalesce(s.call_status, 'to_book'), 'booked_at', s.call_booked_at)
                 else null end
  );
end;
$$;

-- Stores the three intake answers once the report is unlocked and queues the AI section.
-- Returns the AI status. A report that is already generating or ready is left alone.
create or replace function breadmaker.save_leak_intake(sub_id uuid, sub_token uuid, payload jsonb)
returns text
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
declare
  s breadmaker.leak_test_submissions;
  v jsonb;
begin
  select * into s from breadmaker.leak_test_submissions where id = sub_id and access_token = sub_token;
  if s.id is null then
    raise exception 'We could not find that result.' using errcode = '42501';
  end if;
  if s.paid_tier is null then
    raise exception 'The full report is not unlocked for this result.' using errcode = '42501';
  end if;
  if s.ai_status in ('generating', 'ready') then
    return s.ai_status;
  end if;

  v := jsonb_build_object(
    'about', left(btrim(coalesce(payload->>'about', '')), 1200),
    'frustration', left(btrim(coalesce(payload->>'frustration', '')), 1200),
    'tried', left(btrim(coalesce(payload->>'tried', '')), 1200)
  );
  if v->>'about' = '' then
    raise exception 'Tell us a little about the business first.' using errcode = '22023';
  end if;

  update breadmaker.leak_test_submissions
     set intake = v, intake_at = now(), ai_status = 'pending'
   where id = s.id;
  return 'pending';
end;
$$;

-- ---------------------------------------------------------------------------
-- Team tools: leads with AI and call state, one lead in detail, review and release, call notes.

drop function if exists breadmaker.list_leak_test_leads();
create or replace function breadmaker.list_leak_test_leads()
returns table (
  id uuid, created_at timestamptz, name text, email text, whatsapp text, profile jsonb,
  total integer, band text, archetype text, leakiest text, owner_dependence integer,
  paid_tier text, code text, ai_status text, ai_released boolean, call_status text, call_booked_at timestamptz
)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select s.id, s.created_at, s.name, s.email, s.whatsapp, s.profile,
         s.total, s.band, s.archetype, s.leakiest, s.owner_dependence, s.paid_tier, s.code,
         s.ai_status, s.ai_released, s.call_status, s.call_booked_at
  from breadmaker.leak_test_submissions s
  where breadmaker.is_team_member()
  order by s.created_at desc;
$$;

create or replace function breadmaker.leak_test_lead_detail(sub_id uuid)
returns jsonb
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select jsonb_build_object(
    'id', s.id, 'name', s.name, 'email', s.email, 'whatsapp', s.whatsapp, 'profile', s.profile,
    'pillar_scores', to_jsonb(s.pillar_scores), 'total', s.total, 'archetype', s.archetype, 'leakiest', s.leakiest,
    'paid_tier', s.paid_tier, 'intake', s.intake, 'ai_status', s.ai_status, 'ai_report', s.ai_report,
    'ai_released', s.ai_released, 'call_status', s.call_status, 'call_booked_at', s.call_booked_at, 'call_notes', s.call_notes
  )
  from breadmaker.leak_test_submissions s
  where s.id = sub_id and breadmaker.is_team_member();
$$;

-- Saves an edited AI section (when `report` is given) and sets whether the customer can see it.
create or replace function breadmaker.set_leak_ai_report(sub_id uuid, report jsonb, release boolean)
returns void
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
begin
  if not breadmaker.can_edit_content() then
    raise exception 'Only the team can do that.' using errcode = '42501';
  end if;
  update breadmaker.leak_test_submissions
     set ai_report = coalesce(report, ai_report),
         ai_status = case when report is not null then 'ready' else ai_status end,
         ai_released = release
   where id = sub_id;
end;
$$;

-- Puts a report back in the queue so the generator writes it again.
create or replace function breadmaker.requeue_leak_ai(sub_id uuid)
returns void
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
begin
  if not breadmaker.can_edit_content() then
    raise exception 'Only the team can do that.' using errcode = '42501';
  end if;
  update breadmaker.leak_test_submissions
     set ai_status = 'pending', ai_released = false
   where id = sub_id and intake is not null;
end;
$$;

create or replace function breadmaker.set_leak_call(sub_id uuid, new_status text, new_booked_at timestamptz, new_notes text)
returns void
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
begin
  if not breadmaker.can_edit_content() then
    raise exception 'Only the team can do that.' using errcode = '42501';
  end if;
  update breadmaker.leak_test_submissions
     set call_status = nullif(new_status, ''), call_booked_at = new_booked_at, call_notes = new_notes
   where id = sub_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants

grant execute on function breadmaker.get_leak_test_report(uuid, uuid) to anon, authenticated;
grant execute on function breadmaker.save_leak_intake(uuid, uuid, jsonb) to anon, authenticated;
grant execute on function breadmaker.list_leak_test_leads() to authenticated;
grant execute on function breadmaker.leak_test_lead_detail(uuid) to authenticated;
grant execute on function breadmaker.set_leak_ai_report(uuid, jsonb, boolean) to authenticated;
grant execute on function breadmaker.requeue_leak_ai(uuid) to authenticated;
grant execute on function breadmaker.set_leak_call(uuid, text, timestamptz, text) to authenticated;
