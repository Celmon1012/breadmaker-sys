-- Auto-add paying members to the Breadmaker WhatsApp community groups.
--
-- 1. whatsapp_groups maps a product (hub, launchpad, foundry, ...) to a WhatsApp group id. Rows are inserted
--    by the team; a group with no id yet is skipped, and its queued members wait.
-- 2. A successful payment, or a Hub membership that is in date, queues an "add" for that product's group.
--    Nothing is queued for people who already existed when this migration ran: backfill by hand if wanted.
-- 3. The group-sync edge function (every minute) adds the person through Evolution API. When WhatsApp refuses
--    a direct add (privacy settings) it sends them the group invite link instead.
-- 4. Lapsed Hub members are queued for REVIEW, never removed automatically.
--
-- Service role only: row level security is on and there are no policies.

create table if not exists breadmaker.whatsapp_groups (
  key text primary key check (key ~ '^[a-z0-9_]+$'),
  label text not null,
  -- Looks like 1203630xxxxxxxxx@g.us. Leave null until the group exists.
  group_jid text check (group_jid is null or group_jid like '%@g.us'),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into breadmaker.whatsapp_groups (key, label) values
  ('hub', 'Breadmaker Hub'),
  ('launchpad', 'Breadmaker Launchpad'),
  ('foundry', 'Breadmaker Foundry')
on conflict (key) do nothing;

create table if not exists breadmaker.group_queue (
  id bigserial primary key,
  group_key text not null references breadmaker.whatsapp_groups(key),
  email text not null,
  action text not null check (action in ('add', 'remove')),
  -- pending: to be done. review: needs a person (lapses). done / invited / failed: finished.
  status text not null default 'pending' check (status in ('pending', 'review', 'done', 'invited', 'failed')),
  tries integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  done_at timestamptz
);

create unique index if not exists group_queue_open_uniq
  on breadmaker.group_queue (group_key, lower(email), action)
  where status in ('pending', 'review');
create index if not exists group_queue_due_idx on breadmaker.group_queue (next_attempt_at) where status = 'pending';

alter table breadmaker.whatsapp_groups enable row level security;
alter table breadmaker.group_queue enable row level security;

create or replace function breadmaker.group_enqueue(p_key text, p_email text, p_action text, p_status text default 'pending')
returns void
language plpgsql
security definer
set search_path = breadmaker, public
as $$
begin
  if coalesce(p_email, '') = '' then return; end if;
  insert into breadmaker.group_queue (group_key, email, action, status)
  values (p_key, lower(p_email), p_action, p_status)
  on conflict (group_key, lower(email), action) where status in ('pending', 'review') do nothing;
exception when others then
  -- A queue problem must never block a payment or a membership.
  raise warning 'group_enqueue failed: %', sqlerrm;
end;
$$;

create or replace function breadmaker.group_on_payment()
returns trigger
language plpgsql
security definer
set search_path = breadmaker, public
as $$
begin
  if new.status = 'successful' and new.program in ('membership', 'launchpad', 'foundry')
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform breadmaker.group_enqueue(
      case new.program when 'membership' then 'hub' when 'launchpad' then 'launchpad' when 'foundry' then 'foundry' end,
      new.email, 'add');
  end if;
  return new;
end;
$$;

drop trigger if exists group_payment_insert on breadmaker.payments;
create trigger group_payment_insert after insert on breadmaker.payments
  for each row when (new.status = 'successful') execute function breadmaker.group_on_payment();
drop trigger if exists group_payment_update on breadmaker.payments;
create trigger group_payment_update after update of status on breadmaker.payments
  for each row when (new.status = 'successful') execute function breadmaker.group_on_payment();

create or replace function breadmaker.group_on_membership()
returns trigger
language plpgsql
security definer
set search_path = breadmaker, public
as $$
begin
  if new.current_period_end > now() then
    perform breadmaker.group_enqueue('hub', new.email, 'add');
  end if;
  return new;
end;
$$;

drop trigger if exists group_membership_change on breadmaker.memberships;
create trigger group_membership_change after insert or update of current_period_end on breadmaker.memberships
  for each row execute function breadmaker.group_on_membership();

-- Daily: Hub members whose period ended more than 3 days ago are queued for a person to review.
create or replace function breadmaker.group_queue_lapses()
returns integer
language plpgsql
security definer
set search_path = breadmaker, public
as $$
declare n integer := 0; r record;
begin
  for r in select email from breadmaker.memberships where current_period_end < now() - interval '3 days' loop
    perform breadmaker.group_enqueue('hub', r.email, 'remove', 'review');
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function breadmaker.group_enqueue(text, text, text, text) from public, anon, authenticated;
revoke execute on function breadmaker.group_queue_lapses() from public, anon, authenticated;

-- Every minute, run the group-sync function. Reuses the crm-sync secret; set the URL once:
--   alter database postgres set app.settings.group_sync_url = 'https://db.restart.ng/functions/v1/group-sync';
select cron.unschedule(jobid) from cron.job where jobname = 'group-sync';
select cron.schedule(
  'group-sync',
  '* * * * *',
  $$
  select net.http_post(
    url := current_setting('app.settings.group_sync_url', true),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', current_setting('app.settings.crm_sync_secret', true)),
    body := '{}'::jsonb
  )
  where current_setting('app.settings.group_sync_url', true) is not null;
  $$
);

select cron.unschedule(jobid) from cron.job where jobname = 'group-lapses';
select cron.schedule('group-lapses', '15 6 * * *', $$ select breadmaker.group_queue_lapses(); $$);
