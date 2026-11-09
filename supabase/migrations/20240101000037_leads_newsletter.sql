-- Tracks who has agreed to the email list itself. A Leak Test submitter is a lead from the moment they
-- finish the test, but their tick-box covered their result and related messages, not the newsletter.
-- newsletter_consented_at is set only when someone ticks the signup box on a guide or the Tools page.
-- Safe to re-run.

alter table breadmaker.leads add column if not exists newsletter_consented_at timestamptz;
