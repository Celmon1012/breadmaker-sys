-- Courses are free. Every course in the "course" category costs nothing, so anyone signed in can open it
-- (has_course_access already lets everyone into a published course priced at 0). Safe to re-run.

update breadmaker.lms_courses
set price_minor = 0, alt_price_minor = null
where category = 'course' and (price_minor is distinct from 0 or alt_price_minor is not null);
