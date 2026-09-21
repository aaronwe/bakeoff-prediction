# AGENTS.md

Guidance for any agent (or human) picking up work on this project.

## What this is

A friends-and-family Bake Off prediction pool: email magic-link sign-in, a weekly
prediction form, an admin flow to author questions/enter the answer key/score
episodes, a leaderboard, and automated weekly emails + CSV backups.

Two source documents drive everything here — read them before making changes:

- **Design spec:** `docs/superpowers/specs/2026-09-21-bakeoff-prediction-design.md`
- **Implementation plan:** `docs/superpowers/plans/2026-09-21-bakeoff-prediction-implementation.md`

The plan doc is kept in sync with the actual code as bugs are found and fixed during
implementation (see "How this codebase was built" below) — treat it as the current
source of truth for each task's intended code, not just a historical record.

## Current status

Working on branch `bakeoff-implementation`, in a git worktree at
`.worktrees/bakeoff-implementation` off of `main`. `main` only has the design
spec/plan docs committed — all actual application code lives on this branch.

**All 16 tasks are done:** implemented, reviewed, and committed. This covers:

- Repo scaffolding (`web/` React+Vite app, `scripts/` Node package)
- Full Postgres schema + row-level security (`supabase/schema.sql`) — **not yet run
  against a live database**, since no Supabase project exists yet (see "Blocked on"
  below)
- Supabase auth + app shell
- Scoring logic (unit tested)
- Weekly prediction form, leaderboard, episode reveal (full player-facing app)
- Admin roster management, episode creation + bonus questions + publish, intro
  note/email lock, answer key entry + scoring + manual override (full admin app)
- Email infrastructure: `scripts/lib/supabaseAdmin.mjs`, `mailer.mjs`,
  `emailTemplates.mjs`
- Weekly send decision logic (unit tested) + `scripts/send-weekly-email.mjs`
- Wednesday scoring reminder + weekly CSV backup script (unit tested)
- GitHub Actions workflows: `thursday-send.yml`, `wednesday-reminder.yml`,
  `deploy-web.yml`

Tasks 1–12 went through this session's normal two-stage review (independent
spec-compliance pass, then independent code-quality pass) as they were built.
Tasks 13–14 were implemented by a separate session that also self-reviewed and
fixed real issues (see its commits — each has a matching plan-doc sync noting what
was fixed and why). Tasks 15–16 were implemented by that same separate session but
initially had **no** evidence of a review pass, unlike every other task — this
session gave them the review pass they'd skipped and found two real issues, both
now fixed (see the "How this codebase was built" section below for what they were).

**Nothing has been tested against live infrastructure yet** — see "Blocked on."
Task 16's own final step is a real end-to-end manual QA pass once a live Supabase
project + Gmail account exist; that pass has not happened yet.

## Blocked on (user's manual setup — Task 0 in the plan)

No live Supabase project, Gmail account, or GitHub repo secrets exist yet. Nothing
has been tested against real infrastructure — every task has been verified via
`npm run build` / `npm test` / `npx oxlint` and hand-tracing logic, not live
sign-in/data flows. Before real end-to-end testing (or actually deploying to
GitHub Pages / running the scheduled workflows for real) can happen, the project
owner needs to complete Task 0 in the plan doc:

1. Create a Supabase project, note the Project URL / anon key / service_role key
2. Create a Gmail App Password (for both Supabase Auth SMTP and the weekly-email
   scripts)
3. Configure Supabase Auth → SMTP Settings to send via that Gmail account
4. Create the GitHub repo and add it as this project's remote
5. Once the repo exists: add GitHub Actions secrets — `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `GMAIL_USER`,
   `GMAIL_APP_PASSWORD`, `SITE_URL` — matching exactly what the three workflow
   files and `scripts/.env.example`/`web/.env.example` reference
6. Push this branch's work to `main` on that repo, which triggers `deploy-web.yml`
7. Update Supabase Auth's Site URL and the `SITE_URL`/`VITE_GITHUB_REPO` values
   once the real GitHub Pages URL is known (Task 16, Step 4 in the plan)
8. Do the real end-to-end manual QA pass described in Task 16's final step

## How this codebase was built

Implemented via subagent-driven development: a fresh implementer subagent per task,
followed by an independent spec-compliance review subagent, followed by an
independent code-quality review subagent — each with no memory of the others, each
re-verifying claims by reading actual code rather than trusting prior reports.

This process caught real bugs, including two critical security issues:

1. **RLS infinite recursion** on the `admins` table (Task 2) — `is_admin()` queried
   `admins`, whose own select policy called `is_admin()` again.
2. **Answer-key leak** (Task 2) — RLS is row-level, not column-level, so an episode
   answer key saved before scoring was readable by any player, who could edit their
   own still-open answer to match it before scoring ran. Fixed with a DB
   constraint/trigger (`episodes_answer_key_only_when_scored`,
   `bonus_questions_correct_answer_guard`) that makes it physically impossible to
   save the answer key except atomically with scoring — this is why the admin flow
   has one combined "Enter answer key & score" action instead of two separate saves
   (see `AnswerKeyAndScore` in `web/src/pages/admin/AdminEpisode.jsx`, Task 11).
3. **`players_select` RLS breakage** (Task 6) — restricting full player rows to
   "self or admin" silently broke the leaderboard/episode-reveal pages for every
   non-admin (they'd only ever see themselves). Fixed with a `players_public` view
   exposing just `id`/`display_name` to any authenticated user.
4. **Duplicate-send risk** (Tasks 13/15-16) — `decideWeeklyAction` had no guard
   against an already-sent episode, so an admin using the "Send now" GitHub Actions
   link mid-week (Task 10) would get every real player emailed again when the
   Thursday cron fired later for the same still-open, still-locked episode. Fixed
   by checking `episode.email_sent_at` before deciding to send.

Also fixed repeatedly across tasks: data-loading effects with no error handling or
no stale-response guard (a `cancelled` flag pattern, now used consistently in
`Leaderboard.jsx`, `EpisodeReveal.jsx`, `AdminDashboard.jsx`, `AdminRoster.jsx`,
`AdminEpisode.jsx`), and mutation handlers with no shared busy-state guard against
races between related actions (see `IntroNoteAndLock`'s shared `saving` flag across
Save/Lock/Unlock in `AdminEpisode.jsx`). Also: all three GitHub Actions workflows
originally pinned Node 20, but `@supabase/supabase-js` declares
`engines.node >=22.0.0` — bumped to Node 22 everywhere.

**If you're resuming work on this project** (e.g. after the user completes Task 0
and wants real end-to-end verification, or if new features get added to the plan):
follow the same pattern this project was built with — read the relevant section
directly from the plan doc (not a summary), implement/verify it, then get an
independent spec-compliance pass and an independent code-quality pass before
considering it done. When a review finds a real bug in the plan's own given code
(not just the implementation), fix the actual files *and* sync the plan doc's code
blocks to match, with a brief inline note explaining what changed and why — the
plan doc is meant to stay accurate as the project's single source of truth. If you
pick up work another session started, check whether it actually went through this
review process before trusting it (look for "fixed during review" notes in the
plan doc near that section) — Tasks 15-16 here initially hadn't, and did have real
bugs once reviewed.

## Tech stack

React 19 + Vite + react-router-dom (HashRouter) + `@supabase/supabase-js` v2,
vanilla CSS, on the frontend. Node 22 (bumped from the plan's originally-specified
20 — `@supabase/supabase-js` declares `engines.node >=22.0.0`) + nodemailer
(`^10.0.10` — bumped from the plan's originally-specified `^6.9.0` due to
unpatched CVEs in the 6.x line) for scripts. Vitest for unit tests in `web/`
(scoring logic) and `scripts/` (weekly send/remind decision logic, CSV
formatting) — everything else is manual QA by design, per the plan's testing
approach. Supabase Postgres with row-level security as the entire backend — no
custom API server. GitHub Actions for the two cron workflows and GitHub Pages
deployment, all built and committed but not yet run for real.
