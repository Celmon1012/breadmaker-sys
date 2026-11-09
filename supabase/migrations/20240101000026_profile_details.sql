-- Extra profile details for learners (country, mobile, business, short bio).
--
-- These live in their own table, not on breadmaker.profiles: profiles is readable by everyone
-- ("Public profiles are viewable by everyone"), and a mobile number or bio should not be.
-- Here only the owner can read or change their row. Safe to re-run.

create table if not exists breadmaker.profile_details (
  user_id uuid primary key references breadmaker.profiles(id) on delete cascade,
  country text check (country is null or length(country) <= 80),
  city text check (city is null or length(city) <= 80),
  mobile text check (mobile is null or length(mobile) <= 40),
  business_name text check (business_name is null or length(business_name) <= 120),
  website text check (website is null or length(website) <= 200),
  bio text check (bio is null or length(bio) <= 500),
  updated_at timestamptz not null default now()
);

alter table breadmaker.profile_details enable row level security;

drop policy if exists "Owner reads own profile details" on breadmaker.profile_details;
create policy "Owner reads own profile details" on breadmaker.profile_details
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Owner inserts own profile details" on breadmaker.profile_details;
create policy "Owner inserts own profile details" on breadmaker.profile_details
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Owner updates own profile details" on breadmaker.profile_details;
create policy "Owner updates own profile details" on breadmaker.profile_details
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update on breadmaker.profile_details to authenticated;
grant all on breadmaker.profile_details to service_role;
