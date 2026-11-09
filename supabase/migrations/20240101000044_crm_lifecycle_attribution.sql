-- CRM sync, part 2: the customer lifecycle and where leads come from.
--
-- 1. Sign-ups, course enrolments, Breadmaker Hub memberships and support tickets are queued for
--    crm-sync like the form submissions (migration 43), so one contact card shows the whole story.
--    Ticket bodies are never queued, only the subject, category and status.
-- 2. breadmaker.lead_attribution keeps first-touch and last-touch marketing data (utm_*, referrer,
--    landing page) per email. The site records it through record_touch() after a form is sent;
--    crm-sync reads it when it writes the contact.
-- 3. breadmaker.crm_sync_state remembers when an alert last went out, so a stuck queue emails once
--    an hour instead of every minute.
-- Run as supabase_admin. Safe to re-run.

create table if not exists breadmaker.lead_attribution (
  email text primary key check (email = lower(email)),
  first_touch jsonb not null default '{}'::jsonb,
  last_touch jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table breadmaker.lead_attribution enable row level security;
revoke all on breadmaker.lead_attribution from anon, authenticated;
grant all on breadmaker.lead_attribution to service_role;

create table if not exists breadmaker.crm_sync_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table breadmaker.crm_sync_state enable row level security;
revoke all on breadmaker.crm_sync_state from anon, authenticated;
grant all on breadmaker.crm_sync_state to service_role;

-- Called by the browser after a form is sent. Only whitelisted keys are kept, each capped in length,
-- and the first touch is written once. The caller cannot read anything back.
create or replace function breadmaker.record_touch(p_email text, p_touch jsonb)
returns void
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_clean jsonb := '{}'::jsonb;
  k text;
begin
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 200 then
    return;
  end if;
  if p_touch is null or jsonb_typeof(p_touch) <> 'object' then
    return;
  end if;
  foreach k in array array['source', 'medium', 'campaign', 'term', 'content', 'referrer', 'landing', 'at'] loop
    if p_touch ? k and jsonb_typeof(p_touch -> k) = 'string' then
      v_clean := v_clean || jsonb_build_object(k, left(p_touch ->> k, 300));
    end if;
  end loop;
  if v_clean = '{}'::jsonb then
    return;
  end if;
  insert into breadmaker.lead_attribution (email, first_touch, last_touch)
  values (v_email, v_clean, v_clean)
  on conflict (email) do update
    set last_touch = excluded.last_touch,
        updated_at = now();
end;
$$;

grant execute on function breadmaker.record_touch(text, jsonb) to anon, authenticated;

-- Lifecycle events. The email is not on every table, so this function finds it.
create or replace function breadmaker.crm_enqueue_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
declare
  v_payload jsonb;
  v_email text;
  v_id text;
begin
  begin
    if tg_table_name = 'profiles' then
      select u.email into v_email from auth.users u where u.id = new.id;
      v_payload := to_jsonb(new) || jsonb_build_object('email', v_email);
      v_id := new.id::text;
    elsif tg_table_name = 'lms_enrollments' then
      select u.email into v_email from auth.users u where u.id = new.user_id;
      v_payload := to_jsonb(new) || jsonb_build_object(
        'email', v_email,
        'course_title', (select c.title from breadmaker.lms_courses c where c.id = new.course_id));
      v_id := new.id::text;
    elsif tg_table_name = 'memberships' then
      v_payload := to_jsonb(new);
      v_email := new.email;
      v_id := new.email;
    elsif tg_table_name = 'support_tickets' then
      v_payload := to_jsonb(new) - 'message' - 'team_note';
      v_email := new.email;
      v_id := new.id::text;
    end if;
    if v_email is not null and v_email <> '' then
      insert into breadmaker.crm_outbox (source_table, source_id, event, payload)
      values (tg_table_name, v_id, lower(tg_op), v_payload);
    end if;
  exception when others then
    raise warning 'crm_enqueue_lifecycle failed for %: %', tg_table_name, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists crm_sync_insert on breadmaker.profiles;
create trigger crm_sync_insert after insert on breadmaker.profiles
  for each row execute function breadmaker.crm_enqueue_lifecycle();

drop trigger if exists crm_sync_insert on breadmaker.lms_enrollments;
create trigger crm_sync_insert after insert on breadmaker.lms_enrollments
  for each row execute function breadmaker.crm_enqueue_lifecycle();

drop trigger if exists crm_sync_insert on breadmaker.memberships;
create trigger crm_sync_insert after insert on breadmaker.memberships
  for each row execute function breadmaker.crm_enqueue_lifecycle();

drop trigger if exists crm_sync_period on breadmaker.memberships;
create trigger crm_sync_period after update on breadmaker.memberships
  for each row when (old.current_period_end is distinct from new.current_period_end or old.plan_code is distinct from new.plan_code)
  execute function breadmaker.crm_enqueue_lifecycle();

drop trigger if exists crm_sync_insert on breadmaker.support_tickets;
create trigger crm_sync_insert after insert on breadmaker.support_tickets
  for each row execute function breadmaker.crm_enqueue_lifecycle();

drop trigger if exists crm_sync_status on breadmaker.support_tickets;
create trigger crm_sync_status after update on breadmaker.support_tickets
  for each row when (old.status is distinct from new.status) execute function breadmaker.crm_enqueue_lifecycle();

-- One-time backfill of the lifecycle history. Skipped once any lifecycle row is queued.
do $$
begin
  if not exists (select 1 from breadmaker.crm_outbox where source_table in ('profiles', 'lms_enrollments', 'memberships', 'support_tickets')) then
    insert into breadmaker.crm_outbox (source_table, source_id, event, payload, created_at)
      select 'profiles', p.id::text, 'insert', to_jsonb(p) || jsonb_build_object('email', u.email), coalesce(p.created_at, now())
      from breadmaker.profiles p join auth.users u on u.id = p.id where u.email is not null;
    insert into breadmaker.crm_outbox (source_table, source_id, event, payload, created_at)
      select 'lms_enrollments', e.id::text, 'insert',
             to_jsonb(e) || jsonb_build_object('email', u.email, 'course_title', c.title), e.created_at
      from breadmaker.lms_enrollments e
      join auth.users u on u.id = e.user_id
      left join breadmaker.lms_courses c on c.id = e.course_id
      where u.email is not null;
    insert into breadmaker.crm_outbox (source_table, source_id, event, payload, created_at)
      select 'memberships', m.email, 'insert', to_jsonb(m), m.started_at from breadmaker.memberships m;
    insert into breadmaker.crm_outbox (source_table, source_id, event, payload, created_at)
      select 'support_tickets', t.id::text, 'insert', to_jsonb(t) - 'message' - 'team_note', t.created_at
      from breadmaker.support_tickets t;
  end if;
end $$;
