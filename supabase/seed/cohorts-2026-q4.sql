-- Dated cohorts for Launchpad and Foundry. Run in the Supabase SQL editor; change the dates and
-- capacity to what you can actually deliver first. Safe to re-run: it dates the existing undated
-- cohort row for each program, then adds a second Launchpad start only if it is missing.
--
-- Launchpad is 7 days, so each run ends 6 days after it starts. Foundry is 30 days, so it ends 29 days
-- after it starts. Both start on a Monday. The program pages and the apply form read the next open
-- cohort that still has places, so the dates and "places left" appear on their own.

update breadmaker.program_cohorts
   set label = 'Foundry · November 2026', starts_on = date '2026-11-09', ends_on = date '2026-12-08',
       capacity = 6, status = 'open', updated_at = now()
 where program = 'foundry' and starts_on is null;

update breadmaker.program_cohorts
   set label = 'Launchpad · 26 October 2026', starts_on = date '2026-10-26', ends_on = date '2026-11-01',
       capacity = 8, status = 'open', updated_at = now()
 where program = 'launchpad' and starts_on is null;

insert into breadmaker.program_cohorts (program, course_id, label, starts_on, ends_on, capacity, status)
select 'launchpad', (select id from breadmaker.lms_courses where slug = 'launchpad'),
       'Launchpad · 23 November 2026', date '2026-11-23', date '2026-11-29', 8, 'open'
where not exists (select 1 from breadmaker.program_cohorts where program = 'launchpad' and starts_on = date '2026-11-23');

select program, label, starts_on, ends_on, capacity, status from breadmaker.program_cohorts order by program, starts_on;
