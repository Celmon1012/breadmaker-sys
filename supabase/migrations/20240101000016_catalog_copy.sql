-- Catalog copy that lives in the database.
--
-- The Launchpad course row still carried a bracketed placeholder from the seed,
-- so /courses advertised "live in [7] days" even after the program pages were
-- cleaned up. Copy the site quotes belongs in the database, so it is fixed here
-- rather than hidden in the component.

update breadmaker.lms_courses
   set subtitle = 'Your first working online page, live in 7 days.',
       updated_at = now()
 where slug = 'launchpad'
   and subtitle like '%[7]%';
