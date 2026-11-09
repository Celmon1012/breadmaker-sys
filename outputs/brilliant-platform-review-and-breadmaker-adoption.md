[9]: https://brilliant.org/coding-skills/ ""

Home page read. Now pricing, topics, and schools pages.

Reading Brilliant's feature help page, then I'll write up the comparison.

Brilliant is an interactive math and coding platform that has recently repositioned around Koji, an AI tutor. Breadmaker already has a similar course structure, so the gaps are mostly in how learners practise and stay engaged.

I couldn't load `/pricing` and `/courses` (one 404'd, the other rendered blank). The pricing below comes from Brilliant's own resource page, found through search. The topic lists are from the home page.

## What Brilliant is

**Positioning:** "Your personal tutor for math and coding." They say it's built by experts from MIT and Harvard, and is accredited by ACS WASC and certified by kidSAFE. They claim 10M+ learners and 100,000+ five-star app reviews.

**Koji, the AI tutor** (launched around June 2026)

- It works on a shared interactive canvas. It asks guiding questions, sketches on your screen and gives hints by voice or chat.

- It never just gives the answer. They pitch it against "cheating machine" chatbots.

- It tracks what you've mastered and missed, then builds the plan around the gaps. It speeds up or slows down as needed.

- You can ask a question in your own words from the Home tab, and Koji routes you to the right lesson.

- Free users get a limited preview. Full access needs Premium.

- It covers foundational courses now, with advanced ones such as calculus planned for later in 2026.

**Learning format**

- Lessons are short (5–15 minutes) interactive problems, not videos. Drag-and-drop and a math keyboard are part of this.

- Learning Paths take you from core ideas to advanced ones, with practice checkpoints.

- Personalised practice and review sessions follow the same gap tracking.

- Mastery assessments appear on the home page. I couldn't confirm them from other sources.

- You can reset a concept or a whole unit.

**Topics:** Math (35+ topics, from fractions to derivatives), Computer Science (Python, algorithms, neural networks), Science (circuits, quantum computing) and Data Analysis.

**Engagement mechanics**

- A streak needs 3 problems or one finished concept per day. Streak Charges protect it when you miss a day (max 2).

- XP feeds weekly Leagues of 30 learners across 10 levels, with leaderboards.

- There's an iOS home-screen widget showing your streak.

**Audiences**

- **Parents:** a progress dashboard shows how often the learner practises and what they study, plus regular summary notifications.

- **Teachers:** free for individual classrooms, with district pricing on request. There are also Homeschools and K–5 Math Practice (beta) pages.

- **Accessibility:** a page on dyscalculia support.

- **Gifting:** Gift Brilliant is in the main navigation.

**Pricing** (US web, checked August 2026)

- **Premium:** about $30 a month or $240 a year.

- **Family plan:** reported at around $300 a year for up to six accounts. Sources disagree on this.

- **Free tier:** a small daily allowance of practice.

- **Trial:** reports mention a 7-day free trial and annual auto-renewal.

**Marketing style:** testimonials from learners, parents and teachers. They compare cost against in-person tutoring: "a year of tutoring for the price of a few sessions."

## What Breadmaker already has

Checked in `src/components/lms` and the memory notes:

- Course catalogue, course detail pages and a lesson player with sidebar progress ("X of Y sessions done").

- Manual lesson completion and a "Continue / Up next" card on the dashboard.

- Studio course editor, cohorts and applications. Brilliant has no equivalent of the cohorts.

- Dual-currency pricing and Flutterwave/Lago payments.

- Hub and Prestige memberships.

- A Leak Test as a lead magnet.

- Profile photos, onboarding, support and billing.

- A RAG tutor schema (`course_chunks`, `tutor_sessions`) from migration 4. I haven't confirmed it is wired into the current UI. Migration 1 wiped the old schema, and the `agent_usage` and `agent_tools` migrations suggest tutor-style work exists.

## What to adopt

**High value, low effort**

1. **A tutor that guides instead of answering.** If the RAG tutor exists, change its prompt to ask guiding questions and give hints before any answer. Add a "Ask the tutor" entry on the dashboard that routes to the right lesson. This is Brilliant's strongest idea and fits the Hub.

1. **Stuck-point help inside the lesson.** Put a "Stuck?" button in `LessonPlayerPage` that opens the tutor with that lesson's content already loaded.

1. **A streak with grace days.** Count a day when a learner finishes one lesson or checklist item, and add one or two protected missed days. It needs a small table and a dashboard chip.

1. **Free-for-teachers.** Bring this to Breadmaker as free or discounted access for educators or community-college partners. It's a cheap acquisition channel.

1. **Gift a Hub pass.** It reuses the existing checkout, with a recipient email added.

1. **Cost-versus-alternative messaging.** "A year of Hub for the price of one consulting call" fits the Prestige and Hub pages.

**Medium effort**
7. **Mastery checks per module.** Short checks at the end of each module, with targeted review when a learner falls short. It suits Foundry and Launchpad as a progress gate.
8. **Learning Paths.** Present a recommended sequence across kits and courses, with a checkpoint at each step.
9. **Sponsor or manager progress digest.** A weekly summary for the Prestige Partner's 5 seats, or for whoever is paying. This is Brilliant's parent dashboard, adapted for the business buyer.
10. **Interactive exercises.** Inside lessons, use calculators, checklists and fill-in templates instead of only video and notes. The Leak Test already shows you can build these.

**Probably skip**

- **XP and Leagues.** They fit a daily-practice app for students, not a build programme or business owners. The [Launchpad is a build](C:%5CUsers%5CAdemola.claude%5Cprojects%5CC--Projects-BreadmakerSys%5Cmemory%5Cbreadmaker-launchpad-is-a-build.md), so avoid course-style gamification there.

- **Daily-habit pricing.** Brilliant's $30 a month depends on daily use. Your Hub is a different kind of membership.

Whether to build the guided tutor first is your call. If the RAG tutor isn't live yet, it's the first item I'd build.

Sources: [Brilliant home](https://brilliant.org/), [Educators](https://brilliant.org/educators/), [Product features help](https://brilliant.org/help/features/), [Is Brilliant worth it](https://brilliant.org/resources/choosing-brilliant/is-brilliant-worth-it/), [SkillScouter review](https://skillscouter.com/brilliant-review-math-science-coding/), [Nibble review](https://nibble-app.com/blog/is-brilliant-worth-it)



