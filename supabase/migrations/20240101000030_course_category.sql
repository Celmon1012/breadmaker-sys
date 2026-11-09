-- Product category: course, build or other (uncategorised).
--
-- Launchpad and Foundry are builds (run as cohorts); kits and ordinary courses are courses; anything else
-- the team adds is "other". The category lives on the course row. Two small functions read and set it,
-- so the existing course functions and views stay exactly as they are. Safe to re-run.

alter table breadmaker.lms_courses
  add column if not exists category text not null default 'course'
  check (category in ('course', 'build', 'other'));

-- Launchpad and Foundry are builds.
update breadmaker.lms_courses set category = 'build' where slug in ('foundry', 'launchpad') and category = 'course';

-- id and category for every course the caller can see (RLS decides which).
create or replace function breadmaker.course_categories()
returns table (course_id uuid, category text)
language sql
stable
security invoker
set search_path = breadmaker, pg_temp
as $$
  select c.id, c.category from breadmaker.lms_courses c;
$$;

-- Content editors set a product's category (row-level security still applies: only editors can update).
create or replace function breadmaker.set_course_category(check_course_id uuid, new_category text)
returns void
language plpgsql
security invoker
set search_path = breadmaker, pg_temp
as $$
begin
  if new_category is null or new_category not in ('course', 'build', 'other') then
    raise exception 'Category must be course, build or other.' using errcode = '22023';
  end if;
  update breadmaker.lms_courses set category = new_category where id = check_course_id;
end;
$$;

revoke all on function breadmaker.course_categories() from public, anon;
revoke all on function breadmaker.set_course_category(uuid, text) from public, anon;
grant execute on function breadmaker.course_categories() to authenticated;
grant execute on function breadmaker.set_course_category(uuid, text) to authenticated;
