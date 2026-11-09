-- The Breadmaker WhatsApp community: who joins which group.
--
--   community          the community itself (members also get its Announcements group)
--   community_general  the General group inside it
--   prestige_private   the private group for Prestige Partners
--   cohort_xxxxxxxx    one group per Foundry cohort, e.g. "Foundry Cohort#1_10-26" (see set_cohort_group)
--
-- Who gets what:
--   Prestige Community member (plan hub)  -> community + general
--   Prestige Partner (plan partner)       -> community + general + prestige_private
--   Foundry buyer                         -> their cohort's group; community + general only if they opt in
--   Launchpad buyer                       -> community + general only if they opt in
-- The opt-in is asked on the learner dashboard after payment. Lapsed members are queued for review, never removed
-- automatically. Replaces the hub / launchpad / foundry keys from migration 45. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Groups

insert into breadmaker.whatsapp_groups (key, label, group_jid) values
  ('community', 'Breadmaker Community', '120363431546241630@g.us'),
  ('community_general', 'General', '120363431251676744@g.us'),
  ('prestige_private', 'Partners', '120363430724035231@g.us')
on conflict (key) do update set label = excluded.label, group_jid = excluded.group_jid, updated_at = now();

-- Anyone already queued under the old Hub key joins the community instead.
insert into breadmaker.group_queue (group_key, email, action, status)
select v.k, q.email, 'add', 'pending'
from breadmaker.group_queue q
cross join (values ('community'), ('community_general')) v(k)
where q.group_key = 'hub' and q.action = 'add' and q.status = 'pending'
on conflict (group_key, lower(email), action) where status in ('pending', 'review') do nothing;

delete from breadmaker.group_queue where group_key in ('hub', 'launchpad', 'foundry') and status in ('pending', 'review');
delete from breadmaker.whatsapp_groups w
where w.key in ('hub', 'launchpad', 'foundry')
  and not exists (select 1 from breadmaker.group_queue q where q.group_key = w.key);

-- A Foundry cohort's own group.
alter table breadmaker.program_cohorts
  add column if not exists whatsapp_group_key text references breadmaker.whatsapp_groups(key) on delete set null;

-- ---------------------------------------------------------------------------
-- Opt-in for Launchpad and Foundry buyers

create table if not exists breadmaker.community_optin (
  email text primary key,
  opted_in boolean not null,
  updated_at timestamptz not null default now()
);
alter table breadmaker.community_optin enable row level security;

-- ---------------------------------------------------------------------------
-- Queueing

create or replace function breadmaker.group_enqueue_community(p_email text)
returns void
language plpgsql
security definer
set search_path = breadmaker, public
as $$
begin
  perform breadmaker.group_enqueue('community', p_email, 'add');
  perform breadmaker.group_enqueue('community_general', p_email, 'add');
end;
$$;

create or replace function breadmaker.group_on_payment()
returns trigger
language plpgsql
security definer
set search_path = breadmaker, public
as $$
declare
  v_key text;
begin
  -- Prestige payments are handled by the membership trigger, which knows the plan.
  if new.status = 'successful' and new.program in ('launchpad', 'foundry')
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    if new.program = 'foundry' then
      select c.whatsapp_group_key into v_key
      from breadmaker.program_cohorts c
      where c.id = coalesce(new.cohort_id, (select a.cohort_id from breadmaker.applications a where a.id = new.application_id));
      if v_key is not null then
        perform breadmaker.group_enqueue(v_key, new.email, 'add');
      end if;
    end if;
    if exists (select 1 from breadmaker.community_optin o where o.email = lower(new.email) and o.opted_in) then
      perform breadmaker.group_enqueue_community(new.email);
    end if;
  end if;
  return new;
end;
$$;

create or replace function breadmaker.group_on_membership()
returns trigger
language plpgsql
security definer
set search_path = breadmaker, public
as $$
begin
  if new.current_period_end > now() then
    perform breadmaker.group_enqueue_community(new.email);
    if new.plan_code = 'partner' then
      perform breadmaker.group_enqueue('prestige_private', new.email, 'add');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists group_membership_change on breadmaker.memberships;
create trigger group_membership_change after insert or update of current_period_end, plan_code on breadmaker.memberships
  for each row execute function breadmaker.group_on_membership();

-- Daily: members whose period ended more than 3 days ago are queued for a person to review.
create or replace function breadmaker.group_queue_lapses()
returns integer
language plpgsql
security definer
set search_path = breadmaker, public
as $$
declare n integer := 0; r record;
begin
  for r in select email, plan_code from breadmaker.memberships where current_period_end < now() - interval '3 days' loop
    perform breadmaker.group_enqueue('community', r.email, 'remove', 'review');
    perform breadmaker.group_enqueue('community_general', r.email, 'remove', 'review');
    if r.plan_code = 'partner' then
      perform breadmaker.group_enqueue('prestige_private', r.email, 'remove', 'review');
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Learner-facing: the opt-in question

-- 'ask' (paid for Launchpad or Foundry, not answered yet), 'yes', 'no', or 'na' (nothing to ask).
create or replace function breadmaker.community_optin_status()
returns text
language plpgsql
security definer
set search_path = breadmaker, public
stable
as $$
declare
  v_email text := breadmaker.my_email();
  v_opt boolean;
begin
  if v_email is null then return 'na'; end if;
  if exists (select 1 from breadmaker.memberships m where m.email = v_email and m.current_period_end > now()) then return 'na'; end if;
  if not exists (
    select 1 from breadmaker.payments p
    where lower(p.email) = v_email and p.status = 'successful' and p.program in ('launchpad', 'foundry')
  ) then return 'na'; end if;
  select o.opted_in into v_opt from breadmaker.community_optin o where o.email = v_email;
  return case when v_opt is null then 'ask' when v_opt then 'yes' else 'no' end;
end;
$$;

create or replace function breadmaker.set_community_optin(opt boolean)
returns void
language plpgsql
security definer
set search_path = breadmaker, public
as $$
declare
  v_email text := breadmaker.my_email();
begin
  if v_email is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  insert into breadmaker.community_optin (email, opted_in) values (v_email, opt)
  on conflict (email) do update set opted_in = excluded.opted_in, updated_at = now();
  if opt and exists (
    select 1 from breadmaker.payments p
    where lower(p.email) = v_email and p.status = 'successful' and p.program in ('launchpad', 'foundry')
  ) then
    perform breadmaker.group_enqueue_community(v_email);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Team: give a Foundry cohort its group
--
--   select breadmaker.set_cohort_group('<cohort id>', 'Foundry Cohort#1_10-26', '1203630xxxxxxxxx@g.us');
--
-- Everyone who has already paid for that cohort is queued to join it.
create or replace function breadmaker.set_cohort_group(p_cohort uuid, p_label text, p_jid text)
returns text
language plpgsql
security definer
set search_path = breadmaker, public
as $$
declare
  v_key text := 'cohort_' || substr(replace(p_cohort::text, '-', ''), 1, 8);
begin
  if not exists (select 1 from breadmaker.program_cohorts where id = p_cohort) then
    raise exception 'No such cohort.' using errcode = '22023';
  end if;
  insert into breadmaker.whatsapp_groups (key, label, group_jid) values (v_key, p_label, p_jid)
  on conflict (key) do update set label = excluded.label, group_jid = excluded.group_jid, updated_at = now();
  update breadmaker.program_cohorts set whatsapp_group_key = v_key, updated_at = now() where id = p_cohort;
  perform breadmaker.group_enqueue(v_key, p.email, 'add')
  from breadmaker.payments p
  where p.program = 'foundry' and p.status = 'successful'
    and coalesce(p.cohort_id, (select a.cohort_id from breadmaker.applications a where a.id = p.application_id)) = p_cohort;
  return v_key;
end;
$$;

revoke execute on function breadmaker.group_enqueue_community(text) from public, anon, authenticated;
revoke execute on function breadmaker.set_cohort_group(uuid, text, text) from public, anon, authenticated;
revoke execute on function breadmaker.community_optin_status() from public, anon;
revoke execute on function breadmaker.set_community_optin(boolean) from public, anon;
grant execute on function breadmaker.community_optin_status() to authenticated;
grant execute on function breadmaker.set_community_optin(boolean) to authenticated;
