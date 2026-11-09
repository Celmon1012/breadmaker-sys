-- The funnel's page as editable blocks (the Puck editor in the Hub).
--
-- Until now a funnel's page was built straight from its brief. A member who opens the page editor gets the page as a
-- list of blocks (Hero, Section, Enquiry) in this column: they edit it by hand or by chatting, and the site is built
-- from it. A funnel with no page_data is built from the brief as before, so nothing changes for existing funnels.
--
-- Run after migration 52. Safe to re-run.

alter table breadmaker.build_jobs
  add column if not exists page_data jsonb;
