# Breadmaker Academy — where the content stands, and the plan

Checked against the live database (db.restart.ng, `breadmaker` schema) and the
repository on 1 October 2026.

## Where it stands

**The structure is complete and the written content is already in.**

| Course | Weeks/modules | Sessions | Free previews | Catalog price |
| --- | --- | --- | --- | --- |
| Breadmaker Foundry | 4 (Frontend, Backend, Automation, Launch and operate) | 20 | 1 (Kickoff) | ₦150,000 after migration 15 (was `$497`) |
| Breadmaker Launchpad | 3 (Plan, Build, Launch) | 6 | 1 (Day 1: Start call) | ₦35,000 after migration 15 |

Every one of the 26 sessions has three things written for it by
`20240101000013_seed_programs.sql`, and both preview sessions were read back from
the live database to confirm the rows are really there:

- **body** — the session itself, 180–300+ words (e.g. Foundry Kickoff: "A tour of the console, your repository, staging and production. We run the edit, stage, push loop once end to end…")
- **action** — the one thing the learner does ("Point your domain at your server through Cloudflare…")
- **done_when** — how they know it is finished ("Your domain points at your server, your goal is written down…")

Each week also carries a summary and a checklist of done-when items that map to
the Day-30 scorecard.

**What is missing is video, and only video.** Every `lms_lesson_content.video_url`
is empty, and no media has been uploaded. The Academy is text-only today.

The player is ready for it: `describeVideo()` in `src/lib/lms.ts` already embeds
YouTube, Vimeo and Loom and plays direct video files, with a graceful notice for
links it cannot embed. Studio → Courses has a video field per session and a
separate "Explainer video" for the course page. So this is a **data fill, not a
build**.

**Also worth knowing**

- No learner is enrolled yet, so nothing is being held up by the missing videos.
- Two database copy problems are fixed but not yet applied: the Foundry catalog
  price (`$497`) and the Launchpad subtitle (`live in [7] days`). Migrations 15
  and 16 handle both.
- Only one session per course is a free preview. That is a marketing decision, not
  a content gap.

Run this in the Supabase SQL editor to see coverage at any time:

```sql
select c.slug,
       count(l.id) as sessions,
       count(lc.lesson_id) filter (where coalesce(lc.body, '') <> '') as with_body,
       count(lc.video_url) as with_video,
       count(*) filter (where l.is_preview) as previews
from breadmaker.lms_courses c
join breadmaker.lms_lessons l on l.course_id = c.id
left join breadmaker.lms_lesson_content lc on lc.lesson_id = l.id
group by c.slug;
```

## The plan

**1. Apply the migrations first** (15 then 16). Until they are applied the Studio
has no Cohorts or Applications section and the catalog still shows the old price.
Nothing else here depends on them, but the order avoids confusion.

**2. Decide the video format before recording anything.** Three options, in the
order I would try them:

- *Screen recordings per session, 3–6 minutes.* Highest value for Foundry, where
  the learner is following along in a terminal. One take, no editing.
- *One explainer per course, on the course page.* Cheapest credible improvement:
  a 2–3 minute "what this is and how it works" that also serves as the VSL.
- *Live session replays.* The editor hint already suggests using the replay link
  for live sessions, so recording the Monday plan calls and pasting the replay
  link is nearly free.

**3. Record in the order the learner meets them.** Foundry Kickoff → Your offer →
Build the page first; those three carry the free preview and the first
impressions. Then the Launchpad Day 1–2 sessions, which are the shorter course.

**4. Fill the data from Studio → Courses.** Edit the session, paste the link, save.
The player picks it up immediately — no deploy.

**5. Keep the free preview honest.** The preview session should be one that shows
the teaching quality, not the least valuable session. Right now Foundry's preview
is Kickoff, which is a tour — good. Launchpad's is Day 1, also good.

**6. Then invite the first cohort in.** Enrollment is manual from Studio →
Learners, or automatic once a Flutterwave payment settles. A first cohort of 5–6
against real sessions is the only way to find out which of the 26 need rewriting.
