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

**Tasks 1–12 of 16 are done:** implemented, two-stage reviewed (spec compliance +
code quality), and committed. This covers:

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

**Task 13 is in progress, uncommitted, unreviewed:**
`scripts/lib/weeklyEmailDecision.mjs` and `scripts/lib/weeklyEmailDecision.test.mjs`
exist on disk (untracked) and appear to match the plan's given spec for the
send/remind decision logic, but they have **not** been run, tested, or been through
the two-stage review process — treat them as a draft, not verified work. Task 13
also still needs `scripts/send-weekly-email.mjs`, which doesn't exist yet.

**Tasks 14–16 not started:**

- Task 14: Wednesday scoring reminder + weekly CSV backup script
- Task 15: GitHub Actions workflows (the actual cron jobs)
- Task 16: GitHub Pages deployment + final end-to-end manual QA

## Blocked on (user's manual setup — Task 0 in the plan)

No live Supabase project, Gmail account, or GitHub repo secrets exist yet. Nothing
has been tested against real infrastructure — every task so far has been verified
via `npm run build` / `npm test` / `npx oxlint` and hand-tracing logic, not live
sign-in/data flows. Before real end-to-end testing (or Task 16's deployment) can
happen, the project owner needs to complete Task 0 in the plan doc: create the
Supabase project, get a Gmail App Password, configure Supabase Auth SMTP, and
create the GitHub repo.

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

Also fixed repeatedly across tasks: data-loading effects with no error handling or
no stale-response guard (a `cancelled` flag pattern, now used consistently in
`Leaderboard.jsx`, `EpisodeReveal.jsx`, `AdminDashboard.jsx`, `AdminRoster.jsx`,
`AdminEpisode.jsx`), and mutation handlers with no shared busy-state guard against
races between related actions (see `IntroNoteAndLock`'s shared `saving` flag across
Save/Lock/Unlock in `AdminEpisode.jsx`).

**If you're resuming implementation:** follow the same pattern — read the task's
text directly from the plan doc (not a summary), implement it, verify what you can
without live credentials, then get an independent spec-compliance pass and an
independent code-quality pass before moving to the next task. When a review finds a
real bug in the plan's own given code (not just the implementation), fix the actual
files *and* sync the plan doc's code blocks to match, with a brief inline note
explaining what changed and why — the plan doc is meant to stay accurate as the
project's single source of truth.

## Tech stack

React 19 + Vite + react-router-dom (HashRouter) + `@supabase/supabase-js` v2,
vanilla CSS, on the frontend. Node 20 + nodemailer (`^10.0.10` — bumped from the
plan's originally-specified `^6.9.0` due to unpatched CVEs in the 6.x line) for
scripts. Vitest for unit tests in both `web/` and `scripts/` (only scoring logic
and, eventually, the email send/remind decision logic are unit tested — everything
else is manual QA by design, per the plan's testing approach). Supabase Postgres
with row-level security as the entire backend — no custom API server. GitHub
Actions for cron jobs and deployment (not yet built/wired).
