# Bake Off Prediction Pool — Design

**Date:** 2026-09-21
**Status:** Approved for planning

## Overview

A friends-and-family prediction pool for the current season of The Great British Bake-Off, replacing the previous Google Forms + Sheets workflow. Players sign up with just an email (magic-link auth), get a weekly email with prediction questions, and see updated scores/leaderboard after each episode is graded.

Scale: small (5-15 players). Timeline: season has already started / needed very soon, so the design favors the fastest path to a working v1 over maximum flexibility.

## Architecture

- **Frontend**: single static React (Vite) app, hosted on GitHub Pages. Two areas within it: player-facing pages, and an admin section gated to the site owner's email.
- **Backend**: Supabase (free tier) — Postgres database (browsable/editable directly via Supabase's Table Editor / SQL editor for manual inspection or fixes), built-in magic-link auth, row-level security for admin-only tables/columns.
- **Auth**: Supabase's native magic-link email flow. Configured to send via the owner's Gmail account (app password) as custom SMTP, so login emails need no separate infrastructure. Session persists via Supabase's default client-side storage — players stay logged in on a device after first sign-in.
- **Weekly content emails** (new questions, score recaps, admin reminders): a Node script using Nodemailer + the same Gmail app password, invoked by scheduled GitHub Actions workflows. Distinct from login emails — just links back to the site.
- Frontend, emailer script, and GitHub Actions workflows all live in one repo for easy end-to-end inspection.

This stack is fully free at this scale, and every layer is directly inspectable: Supabase dashboard for data, GitHub Actions run logs for automation, browser devtools for the frontend.

## Data Model

Tables in Supabase Postgres:

- **players** — `id`, `email`, `display_name`, `created_at`
- **bakers** — `id`, `name`, `photo_url` (optional), `eliminated` (bool), `eliminated_episode_id`
- **episodes** — `id`, `number`, `air_date`, `status` (`draft` → `open` → `scored`), `intro_note` (text, admin's weekly commentary), `email_locked_at`, `email_sent_at`, answer-key fields: `technical_winner_baker_id`, `star_baker_id`, `eliminated_baker_id`, `handshake_count`
- **bonus_questions** — `id`, `episode_id`, `prompt`, `type` (`baker_pick` | `multiple_choice` | `free_text`), `options` (json, for `multiple_choice`), `include_eliminated` (bool, default false — only used by `baker_pick`), `points`, `correct_answer`
- **answers** — `id`, `episode_id`, `player_id`, `technical_pick_id`, `star_baker_pick_id`, `eliminated_pick_id`, `handshake_guess`, `submitted_at`
- **bonus_answers** — `id`, `bonus_question_id`, `player_id`, `answer_text`
- **scores** — `id`, `episode_id`, `player_id`, `points_breakdown` (json, e.g. `{technical: 1, star_baker: 0, eliminated: 2, handshake: 1, bonus_<id>: 1}`), `total`, `manually_overridden` (bool)

Notes:
- `episodes.status` gates player visibility: `draft` (not visible), `open` (questions live, answers being collected), `scored` (answer key entered, scores computed, episode reveal + leaderboard updated).
- A `scores` row exists only for a player who actually had an answer to grade for that episode. No row = no data for that episode (rendered as "—" on the leaderboard, not "0"). This naturally handles both missed weeks and players who joined mid-season.
- `bonus_questions.type = baker_pick` auto-populates its options from the current `bakers` roster (non-eliminated only, unless `include_eliminated` is set) instead of the admin retyping names. `multiple_choice` remains available for a hand-curated subset of options.

## Player-Facing Flows

- **Sign up / sign in**: one combined page — enter email, receive magic link, click through. First-time players are prompted for a display name; returning players just resume their session (cookie/local-session persists per device).
- **Weekly question form** (single-page layout, chosen over step-by-step): shows the current `open` episode's questions — technical winner / Star Baker / who's-eliminated as dropdowns from non-eliminated `bakers`, handshake count as a number input, bonus questions rendered per their type. Editable/resubmittable up until the admin scores the episode. One submit action upserts the player's `answers` + `bonus_answers` rows.
- **Leaderboard**: always-visible standings table with one column per scored episode plus a total (chosen over totals-only), driven by `scores`. Sorted by total descending; ties share adjacent rows with no special tie-break logic.
- **Episode reveal**: once an episode's status flips to `scored`, players can see everyone's picks for that episode next to the correct answers.

## Admin Flows

Gated by checking the authenticated user's email against a configured admin email (env var — easy to extend to co-admins later).

- **Baker roster**: add bakers at season start; toggle `eliminated` as the season progresses. Drives the dropdowns on the player form and `baker_pick` bonus questions.
- **Weekly question authoring**: create the next episode (number, air date). The three core picks are automatic from the roster. Add 0-2 bonus questions (prompt, type, options/roster-source, points, `include_eliminated` if relevant). Episode starts in `draft`.
- **Publish**: flips episode to `open`, making it visible/answerable to players. Does not by itself send an email.
- **Weekly email finalization**: admin writes `intro_note` (required, non-empty) and clicks "Lock & Ready to Send," setting `email_locked_at`. This is the explicit signal that the week's email is finalized and safe to auto-send.
- **Answer key entry** (Wednesday): form pre-filled with that episode's roster/bonus questions; admin fills in the correct technical winner, Star Baker, eliminated baker, handshake count, and each bonus question's correct answer.
- **Score**: one action computes every player's `points_breakdown` and `total` from the answer key (rules below), writes `scores` rows, flips episode to `scored`. Re-running this after a correction recomputes all rows except any marked `manually_overridden`, and reports how many were recomputed vs. preserved.
- **Manual override**: admin can hand-edit any player's score breakdown for an episode via the admin UI (not raw SQL); this sets `manually_overridden = true` on that row so future rescoring skips it.
- **Send now**: manual trigger to send the weekly email immediately, independent of the scheduled job.

## Scoring Rules

- Technical challenge winner: 1 point
- Star Baker: 1 point
- Who goes home: 2 points
- Handshake count: exact match = 2 points, ±1 = 1 point, farther off = 0 points
- Bonus questions: point value set individually per question by the admin

## Weekly Automation (GitHub Actions)

Two scheduled workflows in `.github/workflows/`, calling a shared Node script with different modes, using a Supabase service-role key and the Gmail app password as repo secrets. Run history is visible in the Actions tab.

- **Thursday send job**: finds the `open` episode.
  - If `email_locked_at` is set → sends every player the email (intro note, this week's questions, prior episode's results/leaderboard if scored) and stamps `email_sent_at`.
  - If not locked → emails the admin a reminder that the episode isn't finalized yet. Repeats daily until locked or manually sent.
- **Wednesday reminder job**: sends the admin a plain reminder that it's scoring day. Scoring itself is a manual admin action (no fixed time assumed).
- **Weekly backup job**: exports the current `scores` (and underlying `answers`/`bonus_answers`) tables to CSV, regardless of whether that week's episode has been scored yet. Writes a timestamped file to a `backups/` folder in the repo and commits it (durable, versioned history browsable on GitHub), and also emails the CSV to the admin as an attachment. Runs weekly (e.g., Thursday morning, alongside the send job).

## Error Handling & Edge Cases

- **Missed submission / mid-season signup**: no `scores` row for that player/episode → leaderboard shows "—" for that column; total sums only existing rows. No special-casing needed beyond that.
- **Re-scoring after a correction**: preserves manually-overridden rows; admin UI reports what changed.
- **Ties**: plain descending sort, no tie-break logic.
- **Expired/used magic links**: handled by Supabase's default auth behavior; player just requests a new link.

## Testing Approach

- **Unit tests** for the scoring calculation (all point rules, including tiered handshake scoring and the rescore/manual-override-preservation logic) — pure logic, worth locking down since bugs here directly misstate someone's score.
- **Unit tests** for the weekly email-send decision (locked vs. not → player email vs. admin reminder).
- **Manual QA** for everything else (signup/login, question form, admin screens, actual email content) — walked through in-browser before considering v1 done; a real end-to-end run-through (sign up, answer, score, verify email) recommended before the first live Thursday.
- No automated browser/e2e tests for v1; revisit only if issues come up.

## Out of Scope for v1

- Payments, financial elements — this is a prizeless-except-baked-goods pool.
- Personalized/authenticated magic links embedded directly in weekly content emails — players sign in normally via the persisted session or a fresh magic link.
- Admin allowlist / invite approval — signup is open to anyone with the link.
- Automated tie-breaking logic.
