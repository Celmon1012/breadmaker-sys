-- Support tickets (in-app form for signed-in learners) and the Prestige WhatsApp community link.
-- Safe to re-run.

create table if not exists breadmaker.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  email text not null,
  name text not null default '',
  category text not null default 'other' check (category in ('billing', 'access', 'course', 'technical', 'other')),
  subject text not null check (char_length(subject) between 3 and 160),
  message text not null check (char_length(message) between 5 and 5000),
  status text not null default 'open' check (status in ('open', 'in-progress', 'resolved')),
  team_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_tickets_user_idx on breadmaker.support_tickets (user_id, created_at desc);
create index if not exists support_tickets_status_idx on breadmaker.support_tickets (status, created_at desc);

alter table breadmaker.support_tickets enable row level security;

drop policy if exists "Send own ticket" on breadmaker.support_tickets;
create policy "Send own ticket" on breadmaker.support_tickets for insert to authenticated
  with check (user_id = auth.uid() and status = 'open');
drop policy if exists "Read own tickets" on breadmaker.support_tickets;
create policy "Read own tickets" on breadmaker.support_tickets for select to authenticated
  using (user_id = auth.uid() or breadmaker.is_team_member());
drop policy if exists "Team update tickets" on breadmaker.support_tickets;
create policy "Team update tickets" on breadmaker.support_tickets for update to authenticated
  using (breadmaker.is_team_member()) with check (breadmaker.is_team_member());

grant select, insert on breadmaker.support_tickets to authenticated;
grant update (status, team_note, updated_at) on breadmaker.support_tickets to authenticated;
grant select, insert, update on breadmaker.support_tickets to service_role;

-- WhatsApp community link: one value on the Prestige plan, shown only to active members.
alter table breadmaker.membership_plans add column if not exists community_url text not null default '';

create or replace function breadmaker.my_community_link()
returns text
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select p.community_url
  from breadmaker.membership_plans p
  where p.code = 'hub'
    and (
      breadmaker.is_team_member(auth.uid())
      or exists (
        select 1 from breadmaker.memberships m
        join auth.users u on lower(u.email) = m.email
        where u.id = auth.uid() and m.current_period_end > now()
      )
    );
$$;

create or replace function breadmaker.set_community_link(new_url text)
returns void
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
begin
  if not breadmaker.is_team_member(auth.uid()) then
    raise exception 'Only the team can change this.';
  end if;
  update breadmaker.membership_plans set community_url = coalesce(trim(new_url), ''), updated_at = now() where code = 'hub';
end;
$$;

grant execute on function breadmaker.my_community_link() to authenticated;
grant execute on function breadmaker.set_community_link(text) to authenticated;
