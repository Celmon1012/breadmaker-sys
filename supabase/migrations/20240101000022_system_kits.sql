-- Systems as kits, programs as bundles.
--
-- A KIT is the Academy course for one system: sessions, a checklist and a definition of done,
-- bought on its own. A PROGRAM (Launchpad, Foundry) bundles several kits and adds the person,
-- so enrolling in a program also enrolls the learner in the kits it builds.
--
--   * lms_courses.kit_system_id links a course to the system it teaches (ids from src/lib/systems.ts).
--   * program_kit_bundles says which kits each program includes.
--   * kit_offers() lists the published, priced kits for the public pages.
--   * Six kit courses are seeded as DRAFTS from the pillar plans, with no price. Fill in the
--     content, set the price and publish them in the Studio; nothing shows until then.
--   * A trigger on lms_enrollments enrolls the bundled kits whenever someone is enrolled in a program.
--
-- Safe to re-run.

alter table breadmaker.lms_courses add column if not exists kit_system_id text;
create unique index if not exists lms_courses_kit_system_idx
  on breadmaker.lms_courses (kit_system_id) where kit_system_id is not null;

-- ---------------------------------------------------------------------------
-- Which kits a program includes

create table if not exists breadmaker.program_kit_bundles (
  program text not null check (program in ('foundry', 'launchpad')),
  kit_system_id text not null,
  primary key (program, kit_system_id)
);

insert into breadmaker.program_kit_bundles (program, kit_system_id) values
  ('launchpad', 'offer-and-pricing-sheet'),
  ('launchpad', 'lead-capture-and-follow-up'),
  ('launchpad', 'invoicing-and-cash-tracker'),
  ('foundry', 'delivery-checklist-and-tracker'),
  ('foundry', 'invoicing-and-cash-tracker'),
  ('foundry', 'delegation-pack'),
  ('foundry', 'automation-and-data-safety')
on conflict do nothing;

alter table breadmaker.program_kit_bundles enable row level security;
drop policy if exists "Team manage kit bundles" on breadmaker.program_kit_bundles;
create policy "Team manage kit bundles" on breadmaker.program_kit_bundles
  for all using (breadmaker.is_team_member()) with check (breadmaker.can_edit_content());
grant select, insert, update, delete on breadmaker.program_kit_bundles to authenticated;

-- ---------------------------------------------------------------------------
-- Public list of kits that can be bought: published, with a price.

create or replace function breadmaker.kit_offers()
returns table (system_id text, slug text, title text, price_minor integer, currency text, lesson_count integer, preview_count integer)
language sql
security definer
set search_path = breadmaker, pg_temp
stable
as $$
  select c.kit_system_id, c.slug, c.title, c.price_minor, c.currency,
         (select count(*)::integer from breadmaker.lms_lessons l where l.course_id = c.id and l.status = 'Published'),
         (select count(*)::integer from breadmaker.lms_lessons l where l.course_id = c.id and l.status = 'Published' and l.is_preview)
  from breadmaker.lms_courses c
  where c.kit_system_id is not null and c.status = 'Published' and c.price_minor is not null and c.price_minor > 0;
$$;

grant execute on function breadmaker.kit_offers() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enrolling in a program also enrolls the kits it includes. A trigger on lms_enrollments, so every
-- way of enrolling (a payment, the Studio, a free enrollment) brings the kits along, and it keeps
-- working if an earlier migration that defines an enroll function is run again.

create or replace function breadmaker.enroll_bundled_kits()
returns trigger
language plpgsql
security definer
set search_path = breadmaker, pg_temp
as $$
begin
  insert into breadmaker.lms_enrollments (user_id, course_id, source, note)
  select new.user_id, kit.id, new.source, 'Included with ' || program_course.slug
  from breadmaker.lms_courses program_course
  join breadmaker.program_kit_bundles b on b.program = program_course.slug
  join breadmaker.lms_courses kit on kit.kit_system_id = b.kit_system_id
  where program_course.id = new.course_id
  on conflict (user_id, course_id) do nothing;
  return new;
end;
$$;

revoke all on function breadmaker.enroll_bundled_kits() from public, anon, authenticated;

drop trigger if exists lms_enrollments_bundle_kits on breadmaker.lms_enrollments;
create trigger lms_enrollments_bundle_kits
  after insert on breadmaker.lms_enrollments
  for each row execute function breadmaker.enroll_bundled_kits();

-- ---------------------------------------------------------------------------
-- Seed the six kit courses as drafts. Each session is one step of the pillar's 30-day plan
-- (from leak_test_report_content), ending with a "definition of done" session. No price, not
-- published: edit them in the Studio, then price and publish.

do $$
declare
  kit record;
  v_course uuid;
  v_module uuid;
  v_plan jsonb;
  v_step record;
  v_pos integer;
  v_lesson uuid;
  v_days text;
  v_text text;
  v_done text;
begin
  for kit in
    select * from (values
      ('offer-and-pricing-sheet', 'offer', 'Offer and pricing sheet', 'Say what you sell, to whom and for how much, in one sentence',
        array['You can say your offer in one sentence: who it is for, what they get and the price','Your prices come from your costs and sit on a one-page menu','You have three written rules for customers you will not take on','Your top offer is first on your page and in your messages']),
      ('lead-capture-and-follow-up', 'sales', 'Lead capture and follow-up', 'Never lose an enquiry to a slow reply',
        array['Every enquiry goes into one list with date, source and status','You reply to every new enquiry within one working day','A written follow-up goes out three times over two weeks','You know which channel brought your last 10 customers']),
      ('delivery-checklist-and-tracker', 'operations', 'Delivery checklist and tracker', 'Run delivery from a written process, not from memory',
        array['Your core job is written as a checklist anyone could follow','Orders and tasks live in one tracker, not in chats','Every complaint is logged with its cause','Someone else has run a job from the checklist alone']),
      ('invoicing-and-cash-tracker', 'cash', 'Invoicing and cash tracker', 'Know your profit and get paid on time',
        array['Business money moves through its own account','You know your profit on each sale','Invoices go out the day the work is done and late payments are chased on a schedule','A weekly review of money in, out and owed is in your calendar']),
      ('delegation-pack', 'team', 'Delegation pack', 'Hand work off without it coming back to you',
        array['Everything only you can do is listed, and the rest is marked to hand off','One function is fully handed over with a named owner and a written standard','Rules for routine decisions are written down','A new person has walked through the onboarding pack']),
      ('automation-and-data-safety', 'tech', 'Automation and data safety', 'Automate the repeat work and protect customer data',
        array['A customer can find you and pay you online in one clear path','Customer data is in one place with a backup you have tested','Your three most repeated tasks run automatically','Consent is collected wherever you collect data and two-step sign-in is on'])
    ) as t(system_id, pillar, title, subtitle, done_list)
  loop
    -- Link an existing course by slug, or create the draft once.
    select id into v_course from breadmaker.lms_courses where kit_system_id = kit.system_id or slug = kit.system_id limit 1;
    if v_course is not null then
      update breadmaker.lms_courses set kit_system_id = kit.system_id where id = v_course and kit_system_id is null;
      continue;
    end if;

    insert into breadmaker.lms_courses (slug, title, subtitle, description, program, audience, status, currency, kit_system_id)
    values (
      kit.system_id, kit.title, kit.subtitle,
      'A kit that fixes one leak in your business. Each session is one step, with one action to finish and a clear definition of done.',
      'general', 'Owners whose Business Leak Test shows a ' || kit.pillar || ' leak', 'Draft', 'ngn', kit.system_id
    )
    returning id into v_course;

    insert into breadmaker.lms_modules (course_id, title, summary, position, done_when)
    values (v_course, 'The ' || kit.title || ' kit', kit.subtitle, 1, kit.done_list)
    returning id into v_module;

    select body->'plan' into v_plan from breadmaker.leak_test_report_content where key = 'pillar:' || kit.pillar;
    v_pos := 0;
    for v_step in select value, ordinality from jsonb_array_elements_text(coalesce(v_plan, '[]'::jsonb)) with ordinality loop
      v_pos := v_pos + 1;
      v_days := nullif(btrim(split_part(v_step.value, ':', 1)), '');
      v_text := btrim(substr(v_step.value, position(':' in v_step.value) + 1));
      insert into breadmaker.lms_lessons (course_id, module_id, title, session_type, duration_minutes, position, status, is_preview)
      values (v_course, v_module, 'Step ' || v_pos || ' · ' || coalesce(v_days, 'Do this'), 'lesson', 15, v_pos, 'Published', v_pos = 1)
      returning id into v_lesson;
      insert into breadmaker.lms_lesson_content (lesson_id, body, action, done_when)
      values (v_lesson, v_text, v_text, '');
    end loop;

    v_pos := v_pos + 1;
    v_done := array_to_string(array(select '- ' || d from unnest(kit.done_list) d), E'\n');
    insert into breadmaker.lms_lessons (course_id, module_id, title, session_type, duration_minutes, position, status, is_preview)
    values (v_course, v_module, 'Your definition of done', 'lesson', 10, v_pos, 'Published', false)
    returning id into v_lesson;
    insert into breadmaker.lms_lesson_content (lesson_id, body, action, done_when)
    values (v_lesson, E'The system is working when all of these are true:\n\n' || v_done,
            'Check each line. Fix the first one that is not true yet, then check again.',
            'Every line above is true for your business.');
  end loop;
end $$;
