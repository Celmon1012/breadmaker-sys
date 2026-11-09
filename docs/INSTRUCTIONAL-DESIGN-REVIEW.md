# Instructional design review — Breadmaker Academy

Reviewed against the 26 live sessions, the Day-30 scorecard they map to, and what
the platform actually records (`supabase/migrations/20240101000012_lms.sql`).

## The short answer

The Academy is **outcome-designed, but only partly instructionally designed**.

It does the two hardest things right: it is built backwards from a scorecard of
demonstrable results, and every session ends in a real artifact in the learner's
own repository. That is genuine instructional design, and most programs do not
have it.

What is thin is the *instructional layer* between the goal and the build: stated
objectives, checks for understanding, retrieval, published criteria, and any
record of competence rather than completion. The platform today records a
checkbox — `lms_lesson_progress` is `(user_id, lesson_id, completed_at)` and
nothing else. A learner can tick all 26 sessions and never be assessed.

## Where it already follows instructional design

1. **Backward design** (Wiggins & McTighe). The Day-30 scorecard is the desired
   result; the 20 items are distributed into the weekly checklists; the sessions
   are the learning plan. The map from goal → evidence → activity is explicit and
   complete. This is the strongest part of the curriculum.
2. **Task-centred, not topic-centred** (Merrill's first principle). Nothing is a
   case study. Every session ends in the learner's own system — a live page, a
   secured table, a working webhook, a runbook.
3. **Worked example, then fading scaffolds.** Week 1 demonstrates the whole
   edit → stage → push loop and the learner repeats it. By Week 4 they push a
   deliberate bad change, roll it back and restore a backup unaided. The support
   is withdrawn on purpose.
4. **Criterion-referenced evidence.** Each done-when line is observable by looking
   at something — "Your page is live on your own domain", "A test payment is
   recorded as paid in your database by the webhook". Not "understand payments".
5. **A formative rhythm.** Monday plan, Wednesday nudge, Friday review. Feedback
   arrives weekly, before the summative Day-30 review, which is what formative
   assessment is for.
6. **Levels 3 and 4 of Kirkpatrick are instrumented.** The scorecard measures
   behaviour; "the day-0 target and the actual result are both written down"
   measures results. Very few programs measure either.
7. **Motivation is designed in** (self-determination theory). Autonomy — their
   system, their domain, their repository. Competence — a visible win every week.
   Relatedness — a named coach on live sessions.

## Where it departs from instructional design

1. **No stated objectives.** "Done when" describes the artifact, not the
   capability. There is no objective anywhere in the form *performance +
   condition + criterion* ("You can write and test a row-level security policy on
   your own tables so that a logged-out request returns nothing"), so neither the
   learner nor the coach has a definition of understanding to work from.
2. **Completion is recorded, competence is not.** Progress is a timestamp. No
   score, no evidence, no note, no reflection — and no certificate or rubric
   table exists in the schema at all.
3. **No checks for understanding.** Nothing sits between reading the session and
   building the thing: no recall prompt, no prediction, no short check. For a
   self-paced learner the first feedback may never arrive.
4. **No retrieval or spacing.** Week 1 concepts are never revisited. The weekly
   checklist is an inventory, not recall practice. Spaced retrieval is the
   cheapest retention lever available and it is unused.
5. **Assessment is self-reported against unpublished criteria.** Pass / not-yet is
   a coach's judgement with no rubric the learner can read in advance.
6. **No diagnostic gate.** Foundry assumes comfort with GitHub and a terminal.
   Nothing detects a learner who will struggle until Week 2 — the hardest week,
   where the tables, security and payments all land at once.
7. **No reflection or transfer ritual.** Nothing asks what they would do
   differently, and the Day-30 review marks items rather than consolidating what
   changed. The transformation story is never captured.
8. **Procedural skills are taught in text only.** Video is empty on all 26
   sessions. For console-and-terminal work, demonstration is the primary channel,
   and there is no plan for captions or transcripts either.

## What I would change, in order of leverage

| # | Change | Effort | Why it matters |
| --- | --- | --- | --- |
| 1 | A `capability` line per session — "By the end you can X, using Y, so that Z" | Content edit in Studio | Turns 26 activities into 26 objectives; gives coaches a shared standard |
| 2 | A 3-question check per week (one recall, one prediction, one diagnosis) | Small schema addition | First feedback arrives before the build, not after it |
| 3 | A published rubric per week — the evidence a coach accepts | Content edit in Studio | Makes pass/not-yet defensible and self-assessable |
| 4 | Record the live sessions; attach the transcript | Recording + one field | Demonstration for self-paced learners, captions for accessibility |
| 5 | A 2-minute diagnostic at enrollment (GitHub, terminal, domain) | Small schema addition | Routes the wrong-fit learner to Launchpad or a pre-week instead of losing them in Week 2 |
| 6 | A reflection prompt at each Friday review; a portfolio artifact at Day 30 | Content edit in Studio | Consolidates learning and produces the transformation evidence |
| 7 | A 60-second reaction prompt after each live session | Small schema addition | Kirkpatrick level 1 — shows which sessions actually land |

Items 1, 3 and 6 are content the team can write in the Studio this week. Items 2,
5 and 7 are a small migration. Item 4 is a recording decision, and it is the
single biggest lever for the self-paced tier, because it replaces the coach's
demonstration that a live learner gets for free.

## On "real working systems and transformation"

The artifact side of that promise is already well served — the learner leaves with
a live system they own, and the Day-30 scorecard is real evidence of it. That is
rare and it is the curriculum's core strength.

Transformation is the weaker half. It is currently visible in exactly three
places: the scorecard, the day-0-versus-actual number, and the learner's own
system. Nothing captures behaviour change after the program — what they shipped in
the following 30 days, what they stopped doing, what they now charge. For a
program whose promise is transformation, that is the evidence worth collecting,
and it is also the best marketing asset the business has.
