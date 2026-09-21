# Bake Off Prediction Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working friends-and-family Bake Off prediction pool: email magic-link sign-in, a weekly prediction form, an admin workflow to author questions/enter the answer key/score episodes, a leaderboard, and automated weekly emails + CSV backups.

**Architecture:** A static React (Vite) SPA (`web/`) talking directly to Supabase (Postgres + Auth + RLS) for all player and admin interaction, hosted on GitHub Pages. A separate set of Node scripts (`scripts/`) run on a schedule via GitHub Actions using a Supabase service-role key to send weekly emails (via Gmail SMTP) and back up score data to CSV. No custom server — Supabase and GitHub Actions are the entire backend.

**Tech Stack:** React 19 (via `npm create vite@latest -- --template react`, which scaffolds current React — no version was pinned by this plan, so it picked up 19.x; none of this plan's components rely on React-18-only patterns like `defaultProps` on function components) + Vite + react-router-dom (HashRouter) + @supabase/supabase-js v2, vanilla CSS. Node 20 + nodemailer (^10.x — see Task 1 nodemailer/vitest version note) for scripts. Vitest for unit tests in both `web/` and `scripts/`. Supabase Postgres with row-level security. GitHub Actions for cron jobs and deployment.

---

## Before You Start: Manual Account Setup

These are one-time manual steps outside the codebase. Do them before Task 1 (or in parallel — the code doesn't need live credentials until you run it).

### Task 0: Accounts and credentials

**Files:** None — this is account setup, not code.

- [ ] **Step 1: Create a Supabase project**

Go to https://supabase.com, create a free project (e.g. named `bakeoff-prediction`). Note down, from Project Settings → API:
- `Project URL` (looks like `https://xxxx.supabase.co`)
- `anon` `public` key
- `service_role` `secret` key (never expose this in the frontend — only scripts/CI use it)

- [ ] **Step 2: Create a Gmail App Password**

In the Gmail account you want to send from: enable 2-Step Verification if not already on, then create an App Password at https://myaccount.google.com/apppasswords (choose "Mail" / "Other"). Save the 16-character password — this is used as `GMAIL_APP_PASSWORD`, not your normal Gmail password.

- [ ] **Step 3: Configure Supabase Auth to send magic links via Gmail**

In the Supabase dashboard: Project Settings → Auth → SMTP Settings → enable "Custom SMTP" and fill in:
- Host: `smtp.gmail.com`, Port: `587`
- Username: your Gmail address
- Password: the App Password from Step 2
- Sender email: your Gmail address
- Sender name: e.g. "Bake Off Pool"

Also set Auth → URL Configuration → Site URL to your eventual GitHub Pages URL (you can update this later once you know the exact URL from Task 16).

- [ ] **Step 4: Create the GitHub repository**

Create a new GitHub repo (e.g. `bakeoff-prediction`) and add it as the remote for this local repo:

```bash
git remote add origin <your-repo-url>
```

Don't push yet — later tasks add secrets that should exist before the scheduled workflows run for real.

---

## Task 1: Repo scaffolding

**Files:**
- Create: `web/package.json`
- Create: `web/vite.config.js`
- Create: `web/index.html`
- Create: `web/.env.example`
- Create: `web/.gitignore`
- Create: `scripts/package.json`
- Create: `scripts/.env.example`
- Modify: `.gitignore` (repo root)

- [ ] **Step 1: Scaffold the Vite React app**

```bash
cd /Users/aaronweiss/claude/Projects/bakeoff-prediction
npm create vite@latest web -- --template react
```

This creates `web/` with a default React + Vite project. We'll replace most of its contents in later tasks.

- [ ] **Step 2: Install web dependencies**

```bash
cd web
npm install @supabase/supabase-js react-router-dom
npm install -D vitest
```

- [ ] **Step 3: Set the Vite base path for GitHub Pages**

Edit `web/vite.config.js` to set `base` to the repo name (GitHub Pages serves project sites from `/<repo-name>/`):

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/bakeoff-prediction/',
})
```

- [ ] **Step 4: Add web env example and test script**

Create `web/.env.example`:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_GITHUB_REPO=your-username/bakeoff-prediction
```

(`VITE_GITHUB_REPO` is used later, in Task 10, to link the admin "Send now" action to the right GitHub Actions page.)

Copy it to a real `.env` for local dev (not committed): `cp web/.env.example web/.env`, then fill in the real values from Task 0.

Add a test script to `web/package.json` (in the `"scripts"` block, alongside the existing `dev`/`build`/`preview`):

```json
"test": "vitest run"
```

- [ ] **Step 5: Scaffold the scripts package**

```bash
cd /Users/aaronweiss/claude/Projects/bakeoff-prediction
mkdir -p scripts/lib
cat > scripts/package.json << 'EOF'
{
  "name": "bakeoff-scripts",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "nodemailer": "^10.0.10",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "vitest": "^5.0.1"
  }
}
EOF
cd scripts && npm install
```

(Versions updated 2026-09-21 during Task 1 implementation: the originally-planned `nodemailer@^6.9.0` had multiple unpatched high/critical CVEs — SMTP command injection, improper TLS validation enabling credential interception, etc. — with no fix in that range. Bumped to `^10.0.10`, which resolves them; `vitest` came along for the ride via `npm audit fix --force`. Both packages' APIs used by this project — `createTransport`/`sendMail`, `describe`/`it`/`expect` — are unchanged across these bumps, so no other task in this plan needs to change.)

- [ ] **Step 6: Add scripts env example**

Create `scripts/.env.example`:

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GMAIL_USER=your-gmail-address@gmail.com
GMAIL_APP_PASSWORD=your-16-char-app-password
SITE_URL=https://your-username.github.io/bakeoff-prediction
```

Copy to a real `.env` for local testing: `cp scripts/.env.example scripts/.env` (this file is gitignored — see Step 7).

- [ ] **Step 7: Update root .gitignore**

The repo root `.gitignore` already exists from brainstorming (ignores `.superpowers/`, `node_modules/`, `.env`, `.env.local`). Confirm it covers both `web/` and `scripts/` subfolders — `node_modules/` and `.env` patterns without a leading `/` match at any depth, so no change needed. Verify:

```bash
cat .gitignore
```

Expected output includes `.superpowers/`, `node_modules/`, `.env`, `.env.local`.

- [ ] **Step 8: Commit scaffolding**

```bash
cd /Users/aaronweiss/claude/Projects/bakeoff-prediction
git add web/package.json web/package-lock.json web/vite.config.js web/index.html web/.env.example web/.gitignore web/src web/public scripts/package.json scripts/package-lock.json scripts/.env.example
git commit -m "Scaffold web app and scripts package"
```

---

## Task 2: Database schema and row-level security

**Files:**
- Create: `supabase/schema.sql`

- [ ] **Step 1: Write the full schema file**

Create `supabase/schema.sql`:

```sql
-- Bake Off Prediction Pool schema
-- Run this once in the Supabase SQL Editor (Project → SQL Editor → New query).

create extension if not exists pgcrypto;

-- ── Core tables ──────────────────────────────────────────────

create table bakers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  photo_url text,
  eliminated boolean not null default false,
  eliminated_episode_id uuid,
  created_at timestamptz not null default now()
);

create table episodes (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique,
  air_date date,
  status text not null default 'draft' check (status in ('draft', 'open', 'scored')),
  intro_note text,
  email_locked_at timestamptz,
  email_sent_at timestamptz,
  -- No `on delete` action (defaults to restrict): the app has no "delete a
  -- baker" feature, so this only matters for manual cleanup via the SQL
  -- editor, where blocking a delete that would orphan an answer key is the
  -- safer default over silently losing data via cascade/set null.
  technical_winner_baker_id uuid references bakers(id),
  star_baker_id uuid references bakers(id),
  eliminated_baker_id uuid references bakers(id),
  handshake_count integer,
  created_at timestamptz not null default now()
);

alter table bakers
  add constraint bakers_eliminated_episode_id_fkey
  foreign key (eliminated_episode_id) references episodes(id);

-- These four columns are the answer key. RLS lets any authenticated player
-- read an `open` episode's row (they need number/air_date/intro_note/status
-- to use the app), and row-level security can't selectively hide just these
-- columns from that same row. Without this constraint, an admin filling in
-- the answer key before clicking "Score" (two separate steps in the admin
-- UI) would leak the correct answers to any player who inspects the API
-- response, who could then edit their own still-open answer to match. This
-- constraint makes that leak impossible at the database level: these columns
-- can only be non-null once status is already 'scored', so the admin UI's
-- answer-key entry and scoring must happen as one atomic write (see Task 11).
alter table episodes add constraint episodes_answer_key_only_when_scored check (
  status = 'scored' or (
    technical_winner_baker_id is null
    and star_baker_id is null
    and eliminated_baker_id is null
    and handshake_count is null
  )
);

create table players (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table bonus_questions (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references episodes(id) on delete cascade,
  prompt text not null,
  type text not null check (type in ('baker_pick', 'multiple_choice', 'free_text')),
  options jsonb,
  include_eliminated boolean not null default false,
  points integer not null default 1,
  correct_answer text,
  created_at timestamptz not null default now()
);

-- Same leak this closes on episodes' answer-key columns (see the comment on
-- episodes_answer_key_only_when_scored above), but correct_answer's "is the
-- episode scored yet" check crosses tables, so a CHECK constraint can't
-- express it directly — a trigger is the equivalent enforcement mechanism.
create or replace function enforce_bonus_correct_answer_only_when_scored() returns trigger
language plpgsql
as $$
begin
  if new.correct_answer is not null then
    if not exists (select 1 from episodes e where e.id = new.episode_id and e.status = 'scored') then
      raise exception 'correct_answer can only be set once the episode is scored';
    end if;
  end if;
  return new;
end;
$$;

create trigger bonus_questions_correct_answer_guard
  before insert or update on bonus_questions
  for each row execute function enforce_bonus_correct_answer_only_when_scored();

create table answers (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references episodes(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  technical_pick_id uuid references bakers(id),
  star_baker_pick_id uuid references bakers(id),
  eliminated_pick_id uuid references bakers(id),
  handshake_guess integer,
  submitted_at timestamptz not null default now(),
  unique (episode_id, player_id)
);

create table bonus_answers (
  id uuid primary key default gen_random_uuid(),
  bonus_question_id uuid not null references bonus_questions(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  answer_text text,
  unique (bonus_question_id, player_id)
);

create table scores (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references episodes(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  points_breakdown jsonb not null default '{}'::jsonb,
  total integer not null default 0,
  manually_overridden boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (episode_id, player_id)
);

create table admins (
  email text primary key
);

-- Seed the initial admin.
insert into admins (email) values ('aaron@westernpriorities.org');

-- ── Helper functions ─────────────────────────────────────────

create or replace function is_admin() returns boolean
language sql stable
set search_path = public
as $$
  select exists (
    select 1 from admins where email = auth.jwt() ->> 'email'
  );
$$;

create or replace function current_player_id() returns uuid
language sql stable
set search_path = public
as $$
  select id from players where email = auth.jwt() ->> 'email';
$$;

-- Used by answers/bonus_answers insert+update policies (both need the exact
-- same "is this episode still open" check on both the old and new row, which
-- is how the answers_update/bonus_answers_update with-check gap happened in
-- the first place — one shared definition instead of four copies).
create or replace function episode_is_open(target_episode_id uuid) returns boolean
language sql stable
set search_path = public
as $$
  select exists (
    select 1 from episodes e where e.id = target_episode_id and e.status = 'open'
  );
$$;

create or replace function bonus_question_is_open(target_bonus_question_id uuid) returns boolean
language sql stable
set search_path = public
as $$
  select exists (
    select 1 from bonus_questions bq
    join episodes e on e.id = bq.episode_id
    where bq.id = target_bonus_question_id and e.status = 'open'
  );
$$;

grant execute on function is_admin() to authenticated;
grant execute on function current_player_id() to authenticated;
grant execute on function episode_is_open(uuid) to authenticated;
grant execute on function bonus_question_is_open(uuid) to authenticated;

-- ── Row-level security ───────────────────────────────────────

alter table bakers enable row level security;
alter table episodes enable row level security;
alter table bonus_questions enable row level security;
alter table players enable row level security;
alter table answers enable row level security;
alter table bonus_answers enable row level security;
alter table scores enable row level security;
alter table admins enable row level security;

create policy bakers_select on bakers for select using (auth.role() = 'authenticated');
create policy bakers_write on bakers for all using (is_admin()) with check (is_admin());

create policy episodes_select on episodes for select using (status <> 'draft' or is_admin());
create policy episodes_write on episodes for all using (is_admin()) with check (is_admin());

create policy bonus_questions_select on bonus_questions for select using (
  is_admin() or exists (
    select 1 from episodes e where e.id = episode_id and e.status <> 'draft'
  )
);
create policy bonus_questions_write on bonus_questions for all using (is_admin()) with check (is_admin());

create policy players_select on players for select using (
  email = auth.jwt() ->> 'email' or is_admin()
);
create policy players_insert on players for insert with check (
  email = auth.jwt() ->> 'email'
);
create policy players_update on players for update using (
  email = auth.jwt() ->> 'email'
) with check (
  email = auth.jwt() ->> 'email'
);

create policy answers_select on answers for select using (
  is_admin()
  or player_id = current_player_id()
  or exists (select 1 from episodes e where e.id = episode_id and e.status = 'scored')
);
create policy answers_insert on answers for insert with check (
  player_id = current_player_id() and episode_is_open(episode_id)
);
create policy answers_update on answers for update using (
  player_id = current_player_id() and episode_is_open(episode_id)
) with check (
  player_id = current_player_id() and episode_is_open(episode_id)
);

create policy bonus_answers_select on bonus_answers for select using (
  is_admin()
  or player_id = current_player_id()
  or exists (
    select 1 from bonus_questions bq join episodes e on e.id = bq.episode_id
    where bq.id = bonus_question_id and e.status = 'scored'
  )
);
create policy bonus_answers_insert on bonus_answers for insert with check (
  player_id = current_player_id() and bonus_question_is_open(bonus_question_id)
);
create policy bonus_answers_update on bonus_answers for update using (
  player_id = current_player_id() and bonus_question_is_open(bonus_question_id)
) with check (
  player_id = current_player_id() and bonus_question_is_open(bonus_question_id)
);

create policy scores_select on scores for select using (auth.role() = 'authenticated');
create policy scores_write on scores for all using (is_admin()) with check (is_admin());

-- Not `using (is_admin())`: is_admin() queries this table, so a policy that
-- calls is_admin() on this table would recurse infinitely. Self-row visibility
-- is all is_admin() actually needs (it looks up the current user's own email).
create policy admins_select on admins for select using (email = auth.jwt() ->> 'email');
```

(Three bugs found and fixed during Task 2 implementation review, 2026-09-21: (1) `admins_select` originally used `is_admin()`, which itself queries `admins` — since `admins` has RLS enabled, that query re-triggers `admins_select`, causing infinite recursion that would break every admin-gated policy in the schema. Fixed by making `admins_select` a direct self-row check instead. (2) `answers_update`/`bonus_answers_update`'s `with check` clauses didn't re-verify the episode was still `open` for the *new* row values, only the `using` clause checked the existing row — a gap versus "players can edit answers only while open." Fixed by adding the same episode-status check to both `with check` clauses. (3) **Critical:** RLS is row-level, not column-level — once an episode is `open` (not `draft`), `episodes_select` exposes the *entire* row to every player, including the answer-key columns (`technical_winner_baker_id`, `star_baker_id`, `eliminated_baker_id`, `handshake_count`), and the same was true of `bonus_questions.correct_answer`. Since the admin workflow originally had "enter the answer key" and "score" as two separate persisted steps, any answer key entered before the admin clicked "Score" would be readable by any player via the browser's already-loaded Supabase client — who could then edit their own still-`open` answer to match before scoring ran, i.e. a real path to a guaranteed-perfect score, not just a spoiler. Fixed with the `episodes_answer_key_only_when_scored` CHECK constraint and the `bonus_questions_correct_answer_guard` trigger above, which make it impossible for these columns to hold a value unless the episode is already `scored` — enforced by Postgres itself, not just app code. This requires the admin UI to write the answer key and flip status to `scored` as a single atomic action rather than two separate saves; **Task 11 below reflects this** (a combined "Enter answer key & score" step, not a separate persisted "save answer key" step).)

(Additional polish from the Task 2 code quality review, same date: the `using`/`with check` "episode is open" subquery that had already caused one bug was duplicated four times across `answers_insert`/`answers_update`/`bonus_answers_insert`/`bonus_answers_update` — extracted into `episode_is_open()`/`bonus_question_is_open()` helper functions instead, both called from all four policies. Added `set search_path = public` to all four helper functions per standard Supabase-advisor guidance. Added a comment explaining why `technical_winner_baker_id`/`star_baker_id`/`eliminated_baker_id` deliberately have no `on delete` action — there's no "delete a baker" feature in this plan, so blocking such a delete rather than cascading/nulling is the safer default for the manual-SQL-editor case where it could matter.)

- [ ] **Step 2: Run it against your Supabase project**

In the Supabase dashboard, open SQL Editor → New query, paste the full contents of `supabase/schema.sql`, and run it. Verify in Table Editor that all 8 tables (`bakers`, `episodes`, `players`, `bonus_questions`, `answers`, `bonus_answers`, `scores`, `admins`) exist and that `admins` has one row with your email.

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "Add database schema and row-level security policies"
```

---

## Task 3: Supabase client, auth context, and app shell

**Files:**
- Create: `web/src/lib/supabaseClient.js`
- Create: `web/src/lib/AuthContext.jsx`
- Create: `web/src/pages/Home.jsx`
- Create: `web/src/components/Nav.jsx`
- Create: `web/src/components/RequireAuth.jsx`
- Create: `web/src/components/RequireAdmin.jsx`
- Modify: `web/src/App.jsx`
- Modify: `web/src/main.jsx`
- Delete: `web/src/App.css`, `web/src/assets/react.svg` (unused Vite template cruft)

- [ ] **Step 1: Create the Supabase client**

Create `web/src/lib/supabaseClient.js`:

```js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

- [ ] **Step 2: Create the auth context**

Create `web/src/lib/AuthContext.jsx`. This tracks the Supabase session, the corresponding `players` row (null until the player has chosen a display name), and admin status.

```jsx
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [player, setPlayer] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadPlayerAndAdmin = useCallback(async (currentSession) => {
    if (!currentSession) {
      setPlayer(null)
      setIsAdmin(false)
      return
    }
    const email = currentSession.user.email
    const [{ data: playerRow }, { data: adminResult }] = await Promise.all([
      supabase.from('players').select('*').eq('email', email).maybeSingle(),
      supabase.rpc('is_admin'),
    ])
    setPlayer(playerRow ?? null)
    setIsAdmin(Boolean(adminResult))
  }, [])

  useEffect(() => {
    // onAuthStateChange alone (no separate getSession() call) is intentional:
    // it fires an INITIAL_SESSION event on mount carrying the same data
    // getSession() would return, so calling both would fetch player/admin
    // state twice on every load and risks a stale getSession() resolution
    // overwriting a newer session from a later auth event.
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession)
      setLoading(true)
      await loadPlayerAndAdmin(newSession)
      setLoading(false)
    })

    return () => listener.subscription.unsubscribe()
  }, [loadPlayerAndAdmin])

  const refreshPlayer = useCallback(async () => {
    await loadPlayerAndAdmin(session)
  }, [session, loadPlayerAndAdmin])

  return (
    <AuthContext.Provider value={{ session, player, isAdmin, loading, refreshPlayer }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
```

(Fixed during Task 3 code quality review, 2026-09-21: the snippet above originally also called `supabase.auth.getSession().then(...)` alongside the `onAuthStateChange` subscription. Since `onAuthStateChange` fires an `INITIAL_SESSION` event on mount with the same data, this caused a redundant double-fetch of player/admin state on every page load — plus a narrow race where the `getSession()` promise could resolve after a later auth event and overwrite its newer session with a stale one. Removed the separate `getSession()` call; `onAuthStateChange`'s initial event covers it.)

- [ ] **Step 3: Create route guards**

Create `web/src/components/RequireAuth.jsx`:

```jsx
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

export default function RequireAuth({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <p>Loading…</p>
  if (!session) return <Navigate to="/" replace />
  return children
}
```

Create `web/src/components/RequireAdmin.jsx`:

```jsx
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

export default function RequireAdmin({ children }) {
  const { isAdmin, loading } = useAuth()
  if (loading) return <p>Loading…</p>
  if (!isAdmin) return <Navigate to="/" replace />
  return children
}
```

- [ ] **Step 4: Create the nav bar**

Create `web/src/components/Nav.jsx`:

```jsx
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabaseClient'

export default function Nav() {
  const { session, isAdmin } = useAuth()

  return (
    <nav className="nav">
      <Link to="/">Home</Link>
      {session && <Link to="/leaderboard">Leaderboard</Link>}
      {isAdmin && <Link to="/admin">Admin</Link>}
      {session && (
        <button onClick={() => supabase.auth.signOut().catch((err) => console.error('Sign out failed:', err))}>
          Sign out
        </button>
      )}
    </nav>
  )
}
```

- [ ] **Step 5: Create the Home page (sign-in + onboarding + current episode placeholder)**

Create `web/src/pages/Home.jsx`. For now this handles sign-in and the first-time display-name prompt; Task 5 will extend it to show the current open episode's form.

```jsx
import { useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabaseClient'

function SignInForm() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    // Safe with HashRouter: Supabase's implicit auth flow puts the session
    // token in the URL hash fragment (#access_token=...), which the auth
    // client reads directly from window.location.hash on load — independent
    // of, and before, HashRouter's own hash-based route matching.
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    })
    if (signInError) {
      setError(signInError.message)
    } else {
      setSent(true)
    }
  }

  if (sent) {
    return <p>Check your email for a sign-in link.</p>
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Email
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <button type="submit">Send sign-in link</button>
      {error && <p className="error">{error}</p>}
    </form>
  )
}

function OnboardingForm() {
  const { session, refreshPlayer } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const { error: insertError } = await supabase
      .from('players')
      .insert({ email: session.user.email, display_name: displayName })
    if (insertError) {
      setError(insertError.message)
      return
    }
    await refreshPlayer()
  }

  return (
    <form onSubmit={handleSubmit}>
      <p>Welcome! What name should other players see?</p>
      <label>
        Display name
        <input
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </label>
      <button type="submit">Continue</button>
      {error && <p className="error">{error}</p>}
    </form>
  )
}

export default function Home() {
  const { session, player, loading } = useAuth()

  if (loading) return <p>Loading…</p>
  if (!session) return <SignInForm />
  if (!player) return <OnboardingForm />

  return <p>Welcome back, {player.display_name}. (Weekly questions coming in Task 5.)</p>
}
```

- [ ] **Step 6: Wire up App.jsx with routing**

Replace `web/src/App.jsx`:

```jsx
import { HashRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './lib/AuthContext'
import Nav from './components/Nav'
import Home from './pages/Home'

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Nav />
        <main className="container">
          <Routes>
            <Route path="/" element={<Home />} />
          </Routes>
        </main>
      </HashRouter>
    </AuthProvider>
  )
}
```

(Later tasks add more `<Route>` entries as pages are built.)

- [ ] **Step 7: Clean up Vite template cruft and add minimal styling**

```bash
cd web
rm -f src/App.css src/assets/react.svg
rmdir src/assets 2>/dev/null || true
```

Replace `web/src/main.jsx`:

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

Replace `web/src/index.css` with minimal, readable defaults:

```css
body {
  font-family: system-ui, sans-serif;
  max-width: 720px;
  margin: 0 auto;
  padding: 16px;
  color: #222;
}

.nav {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
  align-items: center;
}

.nav a {
  color: #222;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th, td {
  padding: 8px;
  text-align: left;
  border-bottom: 1px solid #ddd;
}

.error {
  color: #b00020;
}

form label {
  display: block;
  margin-bottom: 12px;
}

form input, form select, form textarea {
  display: block;
  width: 100%;
  padding: 6px;
  margin-top: 4px;
  box-sizing: border-box;
}

button {
  padding: 8px 16px;
  cursor: pointer;
}
```

- [ ] **Step 8: Manually verify**

```bash
cd web
npm run dev
```

Open the printed local URL. You should see the sign-in form. Enter your own email, submit, and confirm Supabase logs show an outgoing magic-link email attempt (Project → Auth → Logs) — actual delivery depends on Task 0 Step 3 SMTP setup being complete. Stop the dev server (Ctrl+C) once confirmed.

- [ ] **Step 9: Commit**

```bash
cd /Users/aaronweiss/claude/Projects/bakeoff-prediction
git add web/src web/index.html
git commit -m "Add Supabase auth, sign-in/onboarding flow, and app shell"
```

---

## Task 4: Scoring logic module (TDD)

**Files:**
- Create: `web/src/lib/scoring.js`
- Test: `web/src/lib/scoring.test.js`
- Modify: `web/vite.config.js` (add vitest config)

- [ ] **Step 1: Configure vitest**

Edit `web/vite.config.js` to add a `test` block:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/bakeoff-prediction/',
  test: {
    environment: 'node',
  },
})
```

- [ ] **Step 2: Write the failing tests**

Create `web/src/lib/scoring.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { scoreHandshake, scoreBonusAnswer, computeScoreForPlayer } from './scoring'

describe('scoreHandshake', () => {
  it('awards 2 points for an exact match', () => {
    expect(scoreHandshake(5, 5)).toBe(2)
  })

  it('awards 1 point for being off by one', () => {
    expect(scoreHandshake(4, 5)).toBe(1)
    expect(scoreHandshake(6, 5)).toBe(1)
  })

  it('awards 0 points for being off by more than one', () => {
    expect(scoreHandshake(2, 5)).toBe(0)
  })

  it('awards 0 points when the guess or actual is missing', () => {
    expect(scoreHandshake(null, 5)).toBe(0)
    expect(scoreHandshake(5, null)).toBe(0)
  })
})

describe('scoreBonusAnswer', () => {
  it('awards the question points for a matching answer, case- and whitespace-insensitive', () => {
    const bq = { correct_answer: 'Priya', points: 3 }
    expect(scoreBonusAnswer(bq, 'priya')).toBe(3)
    expect(scoreBonusAnswer(bq, '  Priya  ')).toBe(3)
  })

  it('awards 0 for a non-matching answer', () => {
    const bq = { correct_answer: 'Priya', points: 3 }
    expect(scoreBonusAnswer(bq, 'Dev')).toBe(0)
  })

  it('awards 0 when the answer or correct_answer is missing', () => {
    const bq = { correct_answer: 'Priya', points: 3 }
    expect(scoreBonusAnswer(bq, null)).toBe(0)
    expect(scoreBonusAnswer({ correct_answer: null, points: 3 }, 'Priya')).toBe(0)
  })
})

describe('computeScoreForPlayer', () => {
  const episode = {
    technical_winner_baker_id: 'baker-1',
    star_baker_id: 'baker-2',
    eliminated_baker_id: 'baker-3',
    handshake_count: 5,
  }

  it('scores all core questions correctly', () => {
    const answer = {
      technical_pick_id: 'baker-1',
      star_baker_pick_id: 'baker-2',
      eliminated_pick_id: 'baker-3',
      handshake_guess: 5,
    }
    const result = computeScoreForPlayer({ episode, answer, bonusQuestions: [], bonusAnswers: [] })
    expect(result.breakdown).toEqual({ technical: 1, star_baker: 1, eliminated: 2, handshake: 2 })
    expect(result.total).toBe(6)
  })

  it('scores wrong core picks as zero', () => {
    const answer = {
      technical_pick_id: 'wrong',
      star_baker_pick_id: 'wrong',
      eliminated_pick_id: 'wrong',
      handshake_guess: 1,
    }
    const result = computeScoreForPlayer({ episode, answer, bonusQuestions: [], bonusAnswers: [] })
    expect(result.breakdown).toEqual({ technical: 0, star_baker: 0, eliminated: 0, handshake: 0 })
    expect(result.total).toBe(0)
  })

  // Locks in the `&&` guards in computeScoreForPlayer: an unset answer key
  // (episode.*_id null) and a skipped question (answer.*_id null) must not
  // score as a match just because null === null.
  it('does not award points when both the answer key and the player pick are unset', () => {
    const episodeWithNoAnswerKey = {
      technical_winner_baker_id: null,
      star_baker_id: null,
      eliminated_baker_id: null,
      handshake_count: 5,
    }
    const answer = {
      technical_pick_id: null,
      star_baker_pick_id: null,
      eliminated_pick_id: null,
      handshake_guess: 5,
    }
    const result = computeScoreForPlayer({
      episode: episodeWithNoAnswerKey,
      answer,
      bonusQuestions: [],
      bonusAnswers: [],
    })
    expect(result.breakdown).toEqual({ technical: 0, star_baker: 0, eliminated: 0, handshake: 2 })
    expect(result.total).toBe(2)
  })

  it('includes bonus question points keyed by bonus question id', () => {
    const bonusQuestions = [
      { id: 'bq-1', correct_answer: 'Priya', points: 2 },
      { id: 'bq-2', correct_answer: 'Yes', points: 1 },
    ]
    const bonusAnswers = [
      { bonus_question_id: 'bq-1', answer_text: 'Priya' },
      { bonus_question_id: 'bq-2', answer_text: 'No' },
    ]
    const answer = {
      technical_pick_id: 'baker-1',
      star_baker_pick_id: 'baker-2',
      eliminated_pick_id: 'baker-3',
      handshake_guess: 5,
    }
    const result = computeScoreForPlayer({ episode, answer, bonusQuestions, bonusAnswers })
    expect(result.breakdown['bonus_bq-1']).toBe(2)
    expect(result.breakdown['bonus_bq-2']).toBe(0)
    expect(result.total).toBe(6 + 2 + 0)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd web
npx vitest run src/lib/scoring.test.js
```

Expected: FAIL — `scoring.js` doesn't exist yet.

- [ ] **Step 4: Implement the scoring module**

Create `web/src/lib/scoring.js`:

```js
export function scoreHandshake(guess, actual) {
  if (guess == null || actual == null) return 0
  const diff = Math.abs(guess - actual)
  if (diff === 0) return 2
  if (diff === 1) return 1
  return 0
}

export function scoreBonusAnswer(bonusQuestion, answerText) {
  if (!answerText || !bonusQuestion.correct_answer) return 0
  const normalize = (s) => s.trim().toLowerCase()
  return normalize(answerText) === normalize(bonusQuestion.correct_answer)
    ? bonusQuestion.points
    : 0
}

// bonusAnswers must already be scoped to the player being scored (i.e. every
// row's player_id matches `answer`'s player) — this function doesn't filter
// by player itself, so passing an unfiltered/multi-player array would
// silently cross-contaminate bonus scores between players.
export function computeScoreForPlayer({ episode, answer, bonusQuestions, bonusAnswers }) {
  // The `&&` guards below are load-bearing, not redundant: an unset answer
  // key (episode.*_id is null) and a skipped question (answer.*_id is null)
  // would otherwise both be null and a bare `===` would wrongly score it as
  // a match. `&&` short-circuits that null-vs-null case to 0.
  const breakdown = {
    technical: answer.technical_pick_id && answer.technical_pick_id === episode.technical_winner_baker_id ? 1 : 0,
    star_baker: answer.star_baker_pick_id && answer.star_baker_pick_id === episode.star_baker_id ? 1 : 0,
    eliminated: answer.eliminated_pick_id && answer.eliminated_pick_id === episode.eliminated_baker_id ? 2 : 0,
    handshake: scoreHandshake(answer.handshake_guess, episode.handshake_count),
  }

  for (const bq of bonusQuestions) {
    const ba = bonusAnswers.find((a) => a.bonus_question_id === bq.id)
    breakdown[`bonus_${bq.id}`] = scoreBonusAnswer(bq, ba?.answer_text)
  }

  const total = Object.values(breakdown).reduce((sum, v) => sum + v, 0)
  return { breakdown, total }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd web
npx vitest run src/lib/scoring.test.js
```

Expected: PASS — all tests green (17: the 10 above plus 7 added during Task 4 implementation/review for edge cases — zero-as-a-valid-value, empty-string answers, an unanswered/ungraded bonus question, and a null-answer-key-vs-null-player-pick case — that the original 10 didn't cover).

- [ ] **Step 6: Commit**

```bash
cd /Users/aaronweiss/claude/Projects/bakeoff-prediction
git add web/src/lib/scoring.js web/src/lib/scoring.test.js web/vite.config.js
git commit -m "Add scoring logic with unit tests"
```

---

## Task 5: Player weekly question form

**Files:**
- Create: `web/src/lib/queries.js`
- Create: `web/src/components/WeeklyForm.jsx`
- Modify: `web/src/pages/Home.jsx`

- [ ] **Step 1: Add shared data-fetching helpers**

Create `web/src/lib/queries.js` — small helpers reused across pages:

```js
import { supabase } from './supabaseClient'

export async function fetchOpenEpisode() {
  const { data, error } = await supabase
    .from('episodes')
    .select('*')
    .eq('status', 'open')
    .order('number', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function fetchActiveBakers() {
  const { data, error } = await supabase
    .from('bakers')
    .select('*')
    .eq('eliminated', false)
    .order('name')
  if (error) throw error
  return data
}

export async function fetchAllBakers() {
  const { data, error } = await supabase.from('bakers').select('*').order('name')
  if (error) throw error
  return data
}

export async function fetchBonusQuestions(episodeId) {
  const { data, error } = await supabase
    .from('bonus_questions')
    .select('*')
    .eq('episode_id', episodeId)
    .order('created_at')
  if (error) throw error
  return data
}

export async function fetchMyAnswer(episodeId, playerId) {
  const { data, error } = await supabase
    .from('answers')
    .select('*')
    .eq('episode_id', episodeId)
    .eq('player_id', playerId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function fetchMyBonusAnswers(bonusQuestionIds, playerId) {
  if (bonusQuestionIds.length === 0) return []
  const { data, error } = await supabase
    .from('bonus_answers')
    .select('*')
    .in('bonus_question_id', bonusQuestionIds)
    .eq('player_id', playerId)
  if (error) throw error
  return data
}
```

- [ ] **Step 2: Build the weekly form component**

Create `web/src/components/WeeklyForm.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import {
  fetchBonusQuestions,
  fetchMyAnswer,
  fetchMyBonusAnswers,
} from '../lib/queries'

function bonusOptionsFor(question, allBakers, activeBakers) {
  if (question.type === 'baker_pick') {
    const pool = question.include_eliminated ? allBakers : activeBakers
    return pool.map((b) => b.name)
  }
  if (question.type === 'multiple_choice') {
    return question.options ?? []
  }
  return null // free_text
}

export default function WeeklyForm({ episode, player, allBakers, activeBakers }) {
  const [bonusQuestions, setBonusQuestions] = useState([])
  const [technicalPick, setTechnicalPick] = useState('')
  const [starBakerPick, setStarBakerPick] = useState('')
  const [eliminatedPick, setEliminatedPick] = useState('')
  const [handshakeGuess, setHandshakeGuess] = useState('')
  const [bonusAnswerText, setBonusAnswerText] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [retryCount, setRetryCount] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError(null)
      try {
        const bqs = await fetchBonusQuestions(episode.id)
        const existingAnswer = await fetchMyAnswer(episode.id, player.id)
        const existingBonus = await fetchMyBonusAnswers(bqs.map((b) => b.id), player.id)
        if (cancelled) return
        setBonusQuestions(bqs)
        if (existingAnswer) {
          setTechnicalPick(existingAnswer.technical_pick_id ?? '')
          setStarBakerPick(existingAnswer.star_baker_pick_id ?? '')
          setEliminatedPick(existingAnswer.eliminated_pick_id ?? '')
          setHandshakeGuess(existingAnswer.handshake_guess ?? '')
        }
        const bonusMap = {}
        for (const ba of existingBonus) bonusMap[ba.bonus_question_id] = ba.answer_text
        setBonusAnswerText(bonusMap)
      } catch (err) {
        if (!cancelled) setLoadError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [episode.id, player.id, retryCount])

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)

    const { error: answerError } = await supabase.from('answers').upsert(
      {
        episode_id: episode.id,
        player_id: player.id,
        technical_pick_id: technicalPick || null,
        star_baker_pick_id: starBakerPick || null,
        eliminated_pick_id: eliminatedPick || null,
        handshake_guess: handshakeGuess === '' ? null : Number(handshakeGuess),
      },
      { onConflict: 'episode_id,player_id' },
    )

    if (answerError) {
      setError(answerError.message)
      setSaving(false)
      return
    }

    // Always upsert, even a blank answer (as null) — skipping blank fields
    // would silently keep a previously-saved answer in place while the UI
    // told the player their (cleared) answer was saved.
    for (const bq of bonusQuestions) {
      const text = bonusAnswerText[bq.id] ?? ''
      const { error: bonusError } = await supabase.from('bonus_answers').upsert(
        { bonus_question_id: bq.id, player_id: player.id, answer_text: text || null },
        { onConflict: 'bonus_question_id,player_id' },
      )
      if (bonusError) {
        setError(bonusError.message)
        setSaving(false)
        return
      }
    }

    setSaving(false)
    setSaved(true)
  }

  if (loading) return <p>Loading this week's questions…</p>

  if (loadError) {
    return (
      <div>
        <p className="error">Couldn't load this week's questions: {loadError}</p>
        <button onClick={() => setRetryCount((n) => n + 1)}>Try again</button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Episode {episode.number}</h2>
      {episode.intro_note && <p>{episode.intro_note}</p>}

      <label>
        Technical challenge winner
        <select value={technicalPick} onChange={(e) => setTechnicalPick(e.target.value)}>
          <option value="">Select a baker</option>
          {activeBakers.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </label>

      <label>
        Star Baker
        <select value={starBakerPick} onChange={(e) => setStarBakerPick(e.target.value)}>
          <option value="">Select a baker</option>
          {activeBakers.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </label>

      <label>
        Who goes home
        <select value={eliminatedPick} onChange={(e) => setEliminatedPick(e.target.value)}>
          <option value="">Select a baker</option>
          {activeBakers.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </label>

      <label>
        Paul Hollywood handshakes
        <input
          type="number"
          min="0"
          value={handshakeGuess}
          onChange={(e) => setHandshakeGuess(e.target.value)}
        />
      </label>

      {bonusQuestions.map((bq) => {
        const options = bonusOptionsFor(bq, allBakers, activeBakers)
        return (
          <label key={bq.id}>
            {bq.prompt} ({bq.points} pt{bq.points === 1 ? '' : 's'})
            {options ? (
              <select
                value={bonusAnswerText[bq.id] ?? ''}
                onChange={(e) => setBonusAnswerText((prev) => ({ ...prev, [bq.id]: e.target.value }))}
              >
                <option value="">Select an option</option>
                {options.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={bonusAnswerText[bq.id] ?? ''}
                onChange={(e) => setBonusAnswerText((prev) => ({ ...prev, [bq.id]: e.target.value }))}
              />
            )}
          </label>
        )
      })}

      <button type="submit" disabled={saving}>
        {saving ? 'Saving…' : 'Submit answers'}
      </button>
      {saved && <p>Saved! You can come back and change your answers until scoring.</p>}
      {error && <p className="error">{error}</p>}
    </form>
  )
}
```

- [ ] **Step 3: Wire the form into Home.jsx**

Edit `web/src/pages/Home.jsx` — replace the final `return` in the `Home` component and its imports:

```jsx
import { useEffect, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { fetchOpenEpisode, fetchActiveBakers, fetchAllBakers } from '../lib/queries'
import WeeklyForm from '../components/WeeklyForm'
```

(keep the existing `SignInForm` and `OnboardingForm` components as-is), then replace the `Home` function body:

```jsx
export default function Home() {
  const { session, player, loading } = useAuth()
  const [episode, setEpisode] = useState(null)
  const [allBakers, setAllBakers] = useState([])
  const [activeBakers, setActiveBakers] = useState([])
  const [episodeLoading, setEpisodeLoading] = useState(true)
  const [episodeLoadError, setEpisodeLoadError] = useState(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (!player) return
    let cancelled = false
    async function load() {
      setEpisodeLoading(true)
      setEpisodeLoadError(null)
      try {
        const [ep, active, all] = await Promise.all([
          fetchOpenEpisode(),
          fetchActiveBakers(),
          fetchAllBakers(),
        ])
        if (cancelled) return
        setEpisode(ep)
        setActiveBakers(active)
        setAllBakers(all)
      } catch (err) {
        if (!cancelled) setEpisodeLoadError(err.message)
      } finally {
        if (!cancelled) setEpisodeLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [player, retryCount])

  if (loading) return <p>Loading…</p>
  if (!session) return <SignInForm />
  if (!player) return <OnboardingForm />
  if (episodeLoading) return <p>Loading…</p>
  if (episodeLoadError) {
    return (
      <div>
        <p className="error">Couldn't load this week's episode: {episodeLoadError}</p>
        <button onClick={() => setRetryCount((n) => n + 1)}>Try again</button>
      </div>
    )
  }

  return (
    <div>
      <p>Welcome back, {player.display_name}.</p>
      {episode ? (
        <WeeklyForm episode={episode} player={player} allBakers={allBakers} activeBakers={activeBakers} />
      ) : (
        <p>No episode is open for predictions right now — check back soon.</p>
      )}
    </div>
  )
}
```

(Fixed during Task 5 code quality review, 2026-09-21: the snippet originally had no error handling in either `Home`'s or `WeeklyForm`'s data-loading effect, so a thrown Supabase error left the player stuck on "Loading…" forever with no way to recover short of a manual page refresh. Added `try`/`catch`/`finally` around each load, an error state, and a "Try again" button (via a `retryCount` dependency that re-triggers the effect). Also fixed `WeeklyForm`'s submit loop: it used to skip upserting a bonus answer left blank, silently keeping a previously-saved value in place while still showing "Saved!" — misleading if a player cleared an answer on purpose. It now always upserts (writing `null` for a blank answer) so a clear is honored, not silently ignored.)

- [ ] **Step 4: Manually verify**

You need at least one `open` episode and a couple of active bakers to test this meaningfully — that requires the admin pages (Tasks 9-10). For now, verify it builds and the "no episode open" message renders:

```bash
cd web
npm run dev
```

Sign in, confirm you see "No episode is open for predictions right now." Come back to fully exercise this page after Task 9.

- [ ] **Step 5: Commit**

```bash
cd /Users/aaronweiss/claude/Projects/bakeoff-prediction
git add web/src/lib/queries.js web/src/components/WeeklyForm.jsx web/src/pages/Home.jsx
git commit -m "Add weekly prediction form"
```

---

## Task 6: Leaderboard page

**Files:**
- Create: `web/src/pages/Leaderboard.jsx`
- Modify: `web/src/lib/queries.js`
- Modify: `web/src/App.jsx`

- [ ] **Step 1: Add leaderboard data helper**

Add to `web/src/lib/queries.js`:

```js
export async function fetchLeaderboardData() {
  const [{ data: players, error: playersError }, { data: scores, error: scoresError }, { data: episodes, error: episodesError }] =
    await Promise.all([
      supabase.from('players').select('*'),
      supabase.from('scores').select('*'),
      supabase.from('episodes').select('*').eq('status', 'scored').order('number'),
    ])
  if (playersError) throw playersError
  if (scoresError) throw scoresError
  if (episodesError) throw episodesError
  return { players, scores, episodes }
}
```

- [ ] **Step 2: Build the leaderboard page**

Create `web/src/pages/Leaderboard.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchLeaderboardData } from '../lib/queries'

export default function Leaderboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    setError(null)
    fetchLeaderboardData()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [retryCount])

  if (error) {
    return (
      <div>
        <p className="error">Couldn't load the leaderboard: {error}</p>
        <button onClick={() => setRetryCount((n) => n + 1)}>Try again</button>
      </div>
    )
  }

  if (!data) return <p>Loading…</p>

  const { players, scores, episodes } = data

  const totals = players.map((p) => {
    const playerScores = scores.filter((s) => s.player_id === p.id)
    const total = playerScores.reduce((sum, s) => sum + s.total, 0)
    return { player: p, total, playerScores }
  })
  totals.sort((a, b) => b.total - a.total)

  return (
    <div>
      <h2>Standings</h2>
      <table>
        <thead>
          <tr>
            <th>Player</th>
            {episodes.map((ep) => (
              <th key={ep.id}>
                <Link to={`/episodes/${ep.number}`}>E{ep.number}</Link>
              </th>
            ))}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {totals.map(({ player, total, playerScores }) => (
            <tr key={player.id}>
              <td>{player.display_name}</td>
              {episodes.map((ep) => {
                const s = playerScores.find((sc) => sc.episode_id === ep.id)
                return <td key={ep.id}>{s ? s.total : '—'}</td>
              })}
              <td>{total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: Add the route**

Edit `web/src/App.jsx` — add the import and route:

```jsx
import Leaderboard from './pages/Leaderboard'
import RequireAuth from './components/RequireAuth'
```

Inside `<Routes>`, add:

```jsx
<Route path="/leaderboard" element={<RequireAuth><Leaderboard /></RequireAuth>} />
```

- [ ] **Step 4: Manually verify**

```bash
cd web
npm run dev
```

Sign in, click "Leaderboard" in the nav. With no scored episodes yet you should see an empty table with just player rows and a Total column of 0s (once at least one player exists). Full verification happens after Task 11 produces real scores.

- [ ] **Step 5: Commit**

```bash
cd /Users/aaronweiss/claude/Projects/bakeoff-prediction
git add web/src/pages/Leaderboard.jsx web/src/lib/queries.js web/src/App.jsx
git commit -m "Add leaderboard page"
```

---

## Task 7: Episode reveal page

**Files:**
- Create: `web/src/pages/EpisodeReveal.jsx`
- Modify: `web/src/lib/queries.js`
- Modify: `web/src/App.jsx`

- [ ] **Step 1: Add reveal data helper**

Add to `web/src/lib/queries.js`:

```js
export async function fetchEpisodeRevealData(episodeNumber) {
  const { data: episode, error: episodeError } = await supabase
    .from('episodes')
    .select('*')
    .eq('number', episodeNumber)
    .single()
  if (episodeError) throw episodeError

  const results = await Promise.all([
    supabase.from('bakers').select('*'),
    supabase.from('players').select('*'),
    supabase.from('answers').select('*').eq('episode_id', episode.id),
    supabase.from('bonus_questions').select('*').eq('episode_id', episode.id),
    supabase.from('bonus_answers').select('*, bonus_questions!inner(episode_id)').eq('bonus_questions.episode_id', episode.id),
    supabase.from('scores').select('*').eq('episode_id', episode.id),
  ])
  const firstError = results.find((r) => r.error)?.error
  if (firstError) throw firstError
  const [{ data: bakers }, { data: players }, { data: answers }, { data: bonusQuestions }, { data: bonusAnswers }, { data: scores }] = results

  return { episode, bakers, players, answers, bonusQuestions, bonusAnswers, scores }
}
```

- [ ] **Step 2: Build the reveal page**

Create `web/src/pages/EpisodeReveal.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchEpisodeRevealData } from '../lib/queries'

function bakerName(bakers, id) {
  return bakers.find((b) => b.id === id)?.name ?? '—'
}

export default function EpisodeReveal() {
  const { number } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchEpisodeRevealData(Number(number)).then(setData).catch((e) => setError(e.message))
  }, [number])

  if (error) return <p className="error">{error}</p>
  if (!data) return <p>Loading…</p>

  const { episode, bakers, players, answers, bonusQuestions, bonusAnswers, scores } = data

  if (episode.status !== 'scored') {
    return <p>Episode {episode.number} hasn't been scored yet — check back after Wednesday.</p>
  }

  return (
    <div>
      <h2>Episode {episode.number} results</h2>
      <p>
        Technical winner: {bakerName(bakers, episode.technical_winner_baker_id)} · Star Baker:{' '}
        {bakerName(bakers, episode.star_baker_id)} · Went home: {bakerName(bakers, episode.eliminated_baker_id)} ·
        Handshakes: {episode.handshake_count}
      </p>

      <table>
        <thead>
          <tr>
            <th>Player</th>
            <th>Technical</th>
            <th>Star Baker</th>
            <th>Eliminated</th>
            <th>Handshakes</th>
            {bonusQuestions.map((bq) => (
              <th key={bq.id}>{bq.prompt}</th>
            ))}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => {
            const answer = answers.find((a) => a.player_id === p.id)
            const score = scores.find((s) => s.player_id === p.id)
            if (!answer) return null
            return (
              <tr key={p.id}>
                <td>{p.display_name}</td>
                <td>{bakerName(bakers, answer.technical_pick_id)}</td>
                <td>{bakerName(bakers, answer.star_baker_pick_id)}</td>
                <td>{bakerName(bakers, answer.eliminated_pick_id)}</td>
                <td>{answer.handshake_guess ?? '—'}</td>
                {bonusQuestions.map((bq) => {
                  const ba = bonusAnswers.find((a) => a.bonus_question_id === bq.id && a.player_id === p.id)
                  return <td key={bq.id}>{ba?.answer_text ?? '—'}</td>
                })}
                <td>{score ? score.total : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: Add the route**

Edit `web/src/App.jsx` — add the import and route:

```jsx
import EpisodeReveal from './pages/EpisodeReveal'
```

```jsx
<Route path="/episodes/:number" element={<RequireAuth><EpisodeReveal /></RequireAuth>} />
```

- [ ] **Step 4: Manually verify**

Full verification requires a scored episode (after Task 11). For now confirm the route renders the "hasn't been scored yet" message for a `draft`/`open` episode number, and a 404-ish blank/error state is acceptable for a nonexistent number (not worth hardening further for this pool size).

- [ ] **Step 5: Commit**

```bash
cd /Users/aaronweiss/claude/Projects/bakeoff-prediction
git add web/src/pages/EpisodeReveal.jsx web/src/lib/queries.js web/src/App.jsx
git commit -m "Add episode reveal page"
```

---

## Task 8: Admin roster management

**Files:**
- Create: `web/src/pages/admin/AdminRoster.jsx`
- Create: `web/src/pages/admin/AdminDashboard.jsx`
- Modify: `web/src/App.jsx`

- [ ] **Step 1: Build the roster page**

Create `web/src/pages/admin/AdminRoster.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { fetchAllBakers } from '../../lib/queries'

export default function AdminRoster() {
  const [bakers, setBakers] = useState([])
  const [newName, setNewName] = useState('')
  const [error, setError] = useState(null)

  async function reload() {
    setBakers(await fetchAllBakers())
  }

  useEffect(() => {
    reload()
  }, [])

  async function handleAdd(e) {
    e.preventDefault()
    setError(null)
    const { error: insertError } = await supabase.from('bakers').insert({ name: newName })
    if (insertError) {
      setError(insertError.message)
      return
    }
    setNewName('')
    await reload()
  }

  async function toggleEliminated(baker) {
    const { error: updateError } = await supabase
      .from('bakers')
      .update({ eliminated: !baker.eliminated })
      .eq('id', baker.id)
    if (updateError) {
      setError(updateError.message)
      return
    }
    await reload()
  }

  return (
    <div>
      <h2>Baker roster</h2>
      <form onSubmit={handleAdd}>
        <label>
          Add a baker
          <input value={newName} onChange={(e) => setNewName(e.target.value)} required />
        </label>
        <button type="submit">Add</button>
      </form>
      {error && <p className="error">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {bakers.map((b) => (
            <tr key={b.id}>
              <td>{b.name}</td>
              <td>{b.eliminated ? 'Eliminated' : 'In the tent'}</td>
              <td>
                <button onClick={() => toggleEliminated(b)}>
                  {b.eliminated ? 'Mark still in' : 'Mark eliminated'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Build the admin dashboard (episode list + links)**

Create `web/src/pages/admin/AdminDashboard.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'

export default function AdminDashboard() {
  const [episodes, setEpisodes] = useState([])

  useEffect(() => {
    supabase
      .from('episodes')
      .select('*')
      .order('number', { ascending: false })
      .then(({ data }) => setEpisodes(data ?? []))
  }, [])

  return (
    <div>
      <h2>Admin</h2>
      <p>
        <Link to="/admin/roster">Manage baker roster</Link>
      </p>
      <p>
        <Link to="/admin/episodes/new">Create new episode</Link>
      </p>
      <table>
        <thead>
          <tr>
            <th>Episode</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {episodes.map((ep) => (
            <tr key={ep.id}>
              <td>{ep.number}</td>
              <td>{ep.status}</td>
              <td>
                <Link to={`/admin/episodes/${ep.number}`}>Manage</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: Add routes**

Edit `web/src/App.jsx` — add imports:

```jsx
import RequireAdmin from './components/RequireAdmin'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminRoster from './pages/admin/AdminRoster'
```

Add routes:

```jsx
<Route path="/admin" element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
<Route path="/admin/roster" element={<RequireAdmin><AdminRoster /></RequireAdmin>} />
```

- [ ] **Step 4: Manually verify**

```bash
cd web
npm run dev
```

Sign in as the admin email (the one seeded into the `admins` table). Confirm "Admin" appears in the nav, and that `/admin/roster` lets you add a baker (e.g. "Priya") and toggle elimination. Confirm a non-admin account (sign in with a different email) does NOT see the "Admin" nav link and is redirected away from `/admin`.

- [ ] **Step 5: Commit**

```bash
cd /Users/aaronweiss/claude/Projects/bakeoff-prediction
git add web/src/pages/admin web/src/App.jsx
git commit -m "Add admin dashboard and baker roster management"
```

---

## Task 9: Admin episode authoring (create, bonus questions, publish)

**Files:**
- Create: `web/src/pages/admin/AdminNewEpisode.jsx`
- Create: `web/src/pages/admin/AdminEpisode.jsx`
- Modify: `web/src/App.jsx`

- [ ] **Step 1: Build the new-episode form**

Create `web/src/pages/admin/AdminNewEpisode.jsx`:

```jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'

export default function AdminNewEpisode() {
  const [number, setNumber] = useState('')
  const [airDate, setAirDate] = useState('')
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const { data, error: insertError } = await supabase
      .from('episodes')
      .insert({ number: Number(number), air_date: airDate || null })
      .select()
      .single()
    if (insertError) {
      setError(insertError.message)
      return
    }
    navigate(`/admin/episodes/${data.number}`)
  }

  return (
    <div>
      <h2>New episode</h2>
      <form onSubmit={handleSubmit}>
        <label>
          Episode number
          <input type="number" min="1" required value={number} onChange={(e) => setNumber(e.target.value)} />
        </label>
        <label>
          Air date (optional)
          <input type="date" value={airDate} onChange={(e) => setAirDate(e.target.value)} />
        </label>
        <button type="submit">Create</button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Build the episode management page — part 1 (load state + bonus questions)**

Create `web/src/pages/admin/AdminEpisode.jsx`. This page grows through Tasks 9-11; this step covers loading the episode and managing bonus questions and publishing.

```jsx
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { fetchAllBakers, fetchActiveBakers, fetchBonusQuestions } from '../../lib/queries'

function NewBonusQuestionForm({ episodeId, onAdded }) {
  const [prompt, setPrompt] = useState('')
  const [type, setType] = useState('baker_pick')
  const [options, setOptions] = useState('')
  const [includeEliminated, setIncludeEliminated] = useState(false)
  const [points, setPoints] = useState('1')
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const { error: insertError } = await supabase.from('bonus_questions').insert({
      episode_id: episodeId,
      prompt,
      type,
      options: type === 'multiple_choice' ? options.split(',').map((s) => s.trim()).filter(Boolean) : null,
      include_eliminated: type === 'baker_pick' ? includeEliminated : false,
      points: Number(points),
    })
    if (insertError) {
      setError(insertError.message)
      return
    }
    setPrompt('')
    setOptions('')
    setPoints('1')
    onAdded()
  }

  return (
    <form onSubmit={handleSubmit}>
      <h4>Add a bonus question</h4>
      <label>
        Prompt
        <input required value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </label>
      <label>
        Type
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="baker_pick">Pick a baker</option>
          <option value="multiple_choice">Multiple choice (custom options)</option>
          <option value="free_text">Free text / number</option>
        </select>
      </label>
      {type === 'baker_pick' && (
        <label>
          <input
            type="checkbox"
            checked={includeEliminated}
            onChange={(e) => setIncludeEliminated(e.target.checked)}
          />
          Include eliminated bakers
        </label>
      )}
      {type === 'multiple_choice' && (
        <label>
          Options (comma-separated)
          <input value={options} onChange={(e) => setOptions(e.target.value)} />
        </label>
      )}
      <label>
        Points
        <input type="number" min="1" value={points} onChange={(e) => setPoints(e.target.value)} />
      </label>
      <button type="submit">Add bonus question</button>
      {error && <p className="error">{error}</p>}
    </form>
  )
}

export default function AdminEpisode() {
  const { number } = useParams()
  const [episode, setEpisode] = useState(null)
  const [bonusQuestions, setBonusQuestions] = useState([])
  const [allBakers, setAllBakers] = useState([])
  const [activeBakers, setActiveBakers] = useState([])
  const [error, setError] = useState(null)

  async function reload() {
    const { data: ep } = await supabase.from('episodes').select('*').eq('number', Number(number)).single()
    setEpisode(ep)
    if (ep) setBonusQuestions(await fetchBonusQuestions(ep.id))
    setAllBakers(await fetchAllBakers())
    setActiveBakers(await fetchActiveBakers())
  }

  useEffect(() => {
    reload()
  }, [number])

  async function handlePublish() {
    setError(null)
    const { error: updateError } = await supabase
      .from('episodes')
      .update({ status: 'open' })
      .eq('id', episode.id)
    if (updateError) {
      setError(updateError.message)
      return
    }
    await reload()
  }

  if (!episode) return <p>Loading…</p>

  return (
    <div>
      <h2>Episode {episode.number} — {episode.status}</h2>
      {error && <p className="error">{error}</p>}

      {episode.status === 'draft' && (
        <button onClick={handlePublish}>Publish (open for predictions)</button>
      )}

      <h3>Bonus questions</h3>
      <ul>
        {bonusQuestions.map((bq) => (
          <li key={bq.id}>
            {bq.prompt} — {bq.type} — {bq.points} pt{bq.points === 1 ? '' : 's'}
          </li>
        ))}
      </ul>
      <NewBonusQuestionForm episodeId={episode.id} onAdded={reload} />
    </div>
  )
}
```

- [ ] **Step 3: Add routes**

Edit `web/src/App.jsx` — add imports:

```jsx
import AdminNewEpisode from './pages/admin/AdminNewEpisode'
import AdminEpisode from './pages/admin/AdminEpisode'
```

Add routes:

```jsx
<Route path="/admin/episodes/new" element={<RequireAdmin><AdminNewEpisode /></RequireAdmin>} />
<Route path="/admin/episodes/:number" element={<RequireAdmin><AdminEpisode /></RequireAdmin>} />
```

- [ ] **Step 4: Manually verify**

```bash
cd web
npm run dev
```

As admin: create episode 1, add a bonus question of each type, publish it. Confirm the episode's status flips to "open" and the bonus questions list shows what you added. Then sign in as a non-admin player and confirm the weekly form on Home now shows Episode 1 with the bonus questions rendered with the right input type (dropdown vs text).

- [ ] **Step 5: Commit**

```bash
cd /Users/aaronweiss/claude/Projects/bakeoff-prediction
git add web/src/pages/admin/AdminNewEpisode.jsx web/src/pages/admin/AdminEpisode.jsx web/src/App.jsx
git commit -m "Add admin episode creation, bonus questions, and publish"
```

---

## Task 10: Admin intro note, lock, and send-now

**Files:**
- Modify: `web/src/pages/admin/AdminEpisode.jsx`

- [ ] **Step 1: Add intro note + lock UI**

Edit `web/src/pages/admin/AdminEpisode.jsx`. Add state and a new section. Add to the imports line already importing from `react`: keep `useEffect, useState` (already there). Add a new component above `AdminEpisode`:

```jsx
function IntroNoteAndLock({ episode, onChanged }) {
  const [introNote, setIntroNote] = useState(episode.intro_note ?? '')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setIntroNote(episode.intro_note ?? '')
  }, [episode.id, episode.intro_note])

  async function handleSaveNote() {
    setSaving(true)
    setError(null)
    const { error: updateError } = await supabase
      .from('episodes')
      .update({ intro_note: introNote })
      .eq('id', episode.id)
    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    onChanged()
  }

  async function handleLock() {
    setError(null)
    if (!introNote.trim()) {
      setError('Write an intro note before locking.')
      return
    }
    const { error: updateError } = await supabase
      .from('episodes')
      .update({ intro_note: introNote, email_locked_at: new Date().toISOString() })
      .eq('id', episode.id)
    if (updateError) {
      setError(updateError.message)
      return
    }
    onChanged()
  }

  async function handleUnlock() {
    setError(null)
    const { error: updateError } = await supabase
      .from('episodes')
      .update({ email_locked_at: null })
      .eq('id', episode.id)
    if (updateError) {
      setError(updateError.message)
      return
    }
    onChanged()
  }

  return (
    <div>
      <h3>Weekly email</h3>
      <label>
        Intro note (shown at the top of Thursday's email)
        <textarea rows="4" value={introNote} onChange={(e) => setIntroNote(e.target.value)} />
      </label>
      <button onClick={handleSaveNote} disabled={saving}>Save note</button>{' '}
      {episode.email_locked_at ? (
        <>
          <span> Locked and ready to send.</span>{' '}
          <button onClick={handleUnlock}>Unlock</button>
          {' '}
          <a
            href={`https://github.com/${import.meta.env.VITE_GITHUB_REPO}/actions/workflows/thursday-send.yml`}
            target="_blank"
            rel="noreferrer"
          >
            Send now (opens GitHub Actions — click "Run workflow")
          </a>
        </>
      ) : (
        <button onClick={handleLock}>Lock &amp; ready to send</button>
      )}
      {episode.email_sent_at && <p>Email sent at {new Date(episode.email_sent_at).toLocaleString()}.</p>}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
```

The scheduled Thursday workflow (Task 15) is the normal path — locking is enough, the cron job picks it up automatically. This link exists purely so you're not stuck waiting for the next scheduled run if you finalize early: it deep-links to the same `thursday-send.yml` workflow's manual-run page in GitHub Actions, where a "Run workflow" button actually sends the email. A true one-click in-app send isn't possible without either exposing a GitHub token in the public frontend (a credential-exposure risk) or standing up a server/Edge Function just for this one action — both of which are overkill for a friends-and-family pool, so this link is the pragmatic equivalent.

- [ ] **Step 2: Render it in AdminEpisode**

In `AdminEpisode`'s returned JSX, add `<IntroNoteAndLock episode={episode} onChanged={reload} />` right after the "Bonus questions" `<h3>` block's closing `</ul>`+form (i.e., after `<NewBonusQuestionForm .../>` and before the closing `</div>`), but only once the episode is published:

```jsx
      <NewBonusQuestionForm episodeId={episode.id} onAdded={reload} />

      {episode.status !== 'draft' && <IntroNoteAndLock episode={episode} onChanged={reload} />}
    </div>
  )
}
```

(This replaces the final two lines of the existing `AdminEpisode` return block.)

- [ ] **Step 3: Manually verify**

```bash
cd web
npm run dev
```

Publish an episode, write an intro note, click "Lock & ready to send," confirm the button becomes "Unlock" and the locked message appears. Click "Unlock," confirm it reverts. (Actual email sending is Task 12-13 — this task only manages the DB flag.)

- [ ] **Step 4: Commit**

```bash
cd /Users/aaronweiss/claude/Projects/bakeoff-prediction
git add web/src/pages/admin/AdminEpisode.jsx
git commit -m "Add weekly email intro note and lock/unlock"
```

---

## Task 11: Admin answer key, scoring, and manual override

**Files:**
- Modify: `web/src/pages/admin/AdminEpisode.jsx`

**Why this is one combined step, not two:** `supabase/schema.sql`'s `episodes_answer_key_only_when_scored` constraint and `bonus_questions_correct_answer_guard` trigger (added during Task 2) make it impossible to save answer-key values while the episode is still `open` — they can only be written in the same operation that sets `status = 'scored'`. This closes a real leak (RLS is row-level, so a separately-saved answer key would be readable by every player before scoring ran, letting them edit their own still-open answer to match). So there's no separate "save answer key" step — filling in the key and scoring happen together in one form/one submit.

- [ ] **Step 1: Add the combined answer key + scoring component**

Add `computeScoreForPlayer` to the imports at the very top of `web/src/pages/admin/AdminEpisode.jsx` (alongside the existing imports from Task 9):

```jsx
import { computeScoreForPlayer } from '../../lib/scoring'
```

Then add this component above `AdminEpisode`:

```jsx
function AnswerKeyAndScore({ episode, bonusQuestions, allBakers, onChanged }) {
  const [technicalWinner, setTechnicalWinner] = useState(episode.technical_winner_baker_id ?? '')
  const [starBaker, setStarBaker] = useState(episode.star_baker_id ?? '')
  const [eliminated, setEliminated] = useState(episode.eliminated_baker_id ?? '')
  const [handshakeCount, setHandshakeCount] = useState(episode.handshake_count ?? '')
  const [bonusCorrect, setBonusCorrect] = useState(
    Object.fromEntries(bonusQuestions.map((bq) => [bq.id, bq.correct_answer ?? ''])),
  )
  const [error, setError] = useState(null)
  const [summary, setSummary] = useState(null)
  const [scoring, setScoring] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setScoring(true)
    setError(null)
    setSummary(null)

    // Must set the answer key and status: 'scored' in this one update — the
    // episodes_answer_key_only_when_scored constraint rejects a non-null
    // answer key on any row that isn't already 'scored'.
    const { error: episodeError } = await supabase
      .from('episodes')
      .update({
        technical_winner_baker_id: technicalWinner || null,
        star_baker_id: starBaker || null,
        eliminated_baker_id: eliminated || null,
        handshake_count: handshakeCount === '' ? null : Number(handshakeCount),
        status: 'scored',
      })
      .eq('id', episode.id)

    if (episodeError) {
      setError(episodeError.message)
      setScoring(false)
      return
    }

    // Must run after the episodes update above — the
    // bonus_questions_correct_answer_guard trigger checks that this
    // bonus question's episode is already 'scored'.
    for (const bq of bonusQuestions) {
      const { error: bqError } = await supabase
        .from('bonus_questions')
        .update({ correct_answer: bonusCorrect[bq.id] || null })
        .eq('id', bq.id)
      if (bqError) {
        setError(bqError.message)
        setScoring(false)
        return
      }
    }

    // Re-fetch rather than reuse local state, so scoring always computes
    // against exactly what's now in the database.
    const { data: scoredEpisode } = await supabase.from('episodes').select('*').eq('id', episode.id).single()
    const { data: scoredBonusQuestions } = await supabase
      .from('bonus_questions')
      .select('*')
      .eq('episode_id', episode.id)

    const { data: answers } = await supabase.from('answers').select('*').eq('episode_id', episode.id)
    const bonusQuestionIds = (scoredBonusQuestions ?? []).map((bq) => bq.id)
    const { data: bonusAnswers } = bonusQuestionIds.length
      ? await supabase.from('bonus_answers').select('*').in('bonus_question_id', bonusQuestionIds)
      : { data: [] }
    const { data: existingScores } = await supabase.from('scores').select('*').eq('episode_id', episode.id)

    let recomputed = 0
    let preserved = 0

    for (const answer of answers) {
      const existing = existingScores.find((s) => s.player_id === answer.player_id)
      if (existing?.manually_overridden) {
        preserved += 1
        continue
      }
      const { breakdown, total } = computeScoreForPlayer({
        episode: scoredEpisode,
        answer,
        bonusQuestions: scoredBonusQuestions ?? [],
        bonusAnswers: bonusAnswers.filter((ba) => ba.player_id === answer.player_id),
      })
      const { error: upsertError } = await supabase.from('scores').upsert(
        {
          episode_id: episode.id,
          player_id: answer.player_id,
          points_breakdown: breakdown,
          total,
          manually_overridden: false,
        },
        { onConflict: 'episode_id,player_id' },
      )
      if (upsertError) {
        setError(upsertError.message)
        setScoring(false)
        return
      }
      recomputed += 1
    }

    setSummary(`${recomputed} player score(s) recomputed, ${preserved} manual override(s) preserved.`)
    setScoring(false)
    onChanged()
  }

  return (
    <form onSubmit={handleSubmit}>
      <h3>Answer key &amp; scoring</h3>
      <label>
        Technical challenge winner
        <select value={technicalWinner} onChange={(e) => setTechnicalWinner(e.target.value)}>
          <option value="">Select a baker</option>
          {allBakers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <label>
        Star Baker
        <select value={starBaker} onChange={(e) => setStarBaker(e.target.value)}>
          <option value="">Select a baker</option>
          {allBakers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <label>
        Who went home
        <select value={eliminated} onChange={(e) => setEliminated(e.target.value)}>
          <option value="">Select a baker</option>
          {allBakers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <label>
        Handshake count
        <input type="number" min="0" value={handshakeCount} onChange={(e) => setHandshakeCount(e.target.value)} />
      </label>
      {bonusQuestions.map((bq) => (
        <label key={bq.id}>
          Correct answer: {bq.prompt}
          <input
            value={bonusCorrect[bq.id] ?? ''}
            onChange={(e) => setBonusCorrect((prev) => ({ ...prev, [bq.id]: e.target.value }))}
          />
        </label>
      ))}
      <p>
        Nothing here is saved until you submit — the database won't accept a partial answer key while the
        episode is still open, so entering the key and scoring happen together in one step.
      </p>
      <button type="submit" disabled={scoring}>
        {scoring ? 'Scoring…' : episode.status === 'scored' ? 'Re-score' : 'Enter answer key & score'}
      </button>
      {summary && <p>{summary}</p>}
      {error && <p className="error">{error}</p>}
    </form>
  )
}
```

- [ ] **Step 2: Add manual override UI**

Add this component above `AdminEpisode`:

```jsx
function ManualOverrides({ episode, players }) {
  const [scores, setScores] = useState([])
  const [error, setError] = useState(null)

  async function reload() {
    const { data } = await supabase.from('scores').select('*').eq('episode_id', episode.id)
    setScores(data ?? [])
  }

  useEffect(() => {
    reload()
  }, [episode.id])

  async function handleOverride(playerId, newTotal) {
    setError(null)
    const existing = scores.find((s) => s.player_id === playerId)
    const { error: upsertError } = await supabase.from('scores').upsert(
      {
        episode_id: episode.id,
        player_id: playerId,
        points_breakdown: existing?.points_breakdown ?? {},
        total: Number(newTotal),
        manually_overridden: true,
      },
      { onConflict: 'episode_id,player_id' },
    )
    if (upsertError) {
      setError(upsertError.message)
      return
    }
    await reload()
  }

  if (episode.status !== 'scored') return null

  return (
    <div>
      <h3>Manual overrides</h3>
      <table>
        <thead>
          <tr><th>Player</th><th>Total</th><th>Overridden?</th><th></th></tr>
        </thead>
        <tbody>
          {players.map((p) => {
            const s = scores.find((sc) => sc.player_id === p.id)
            return (
              <tr key={p.id}>
                <td>{p.display_name}</td>
                <td>
                  <input
                    type="number"
                    defaultValue={s?.total ?? 0}
                    onBlur={(e) => handleOverride(p.id, e.target.value)}
                  />
                </td>
                <td>{s?.manually_overridden ? 'Yes' : 'No'}</td>
                <td></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Wire the new sections into AdminEpisode**

In `AdminEpisode`, add a `players` state and fetch it in `reload`, then render the two new sections. Edit the top of the file's imports to add `supabase` fetch for players (reuse existing `supabase` import), then:

Add state: `const [players, setPlayers] = useState([])`

In `reload()`, add: `const { data: playerRows } = await supabase.from('players').select('*'); setPlayers(playerRows ?? [])`

At the end of the `AdminEpisode` return block, replace:

```jsx
      {episode.status !== 'draft' && <IntroNoteAndLock episode={episode} onChanged={reload} />}
    </div>
  )
}
```

with:

```jsx
      {episode.status !== 'draft' && <IntroNoteAndLock episode={episode} onChanged={reload} />}
      {episode.status !== 'draft' && (
        <AnswerKeyAndScore episode={episode} bonusQuestions={bonusQuestions} allBakers={allBakers} onChanged={reload} />
      )}
      <ManualOverrides episode={episode} players={players} />
    </div>
  )
}
```

- [ ] **Step 4: Manually verify end-to-end**

```bash
cd web
npm run dev
```

As a player: submit answers for the open episode. As admin: fill in the answer key form and click "Enter answer key & score," confirm a success summary appears. Visit `/leaderboard` and `/episodes/1` (or your episode number) and confirm the score and reveal show correctly. Try a manual override on one player's total and confirm re-scoring preserves it (summary says "1 manual override(s) preserved").

Also confirm the fix this task's design depends on actually holds: while the episode is still `open` (before submitting the answer key), open a second browser session signed in as a non-admin player and confirm `episodes.technical_winner_baker_id` etc. still read `null` via the app (e.g. the episode reveal page still says "hasn't been scored yet") — the database should be physically incapable of holding a value there until you submit.

- [ ] **Step 5: Commit**

```bash
cd /Users/aaronweiss/claude/Projects/bakeoff-prediction
git add web/src/pages/admin/AdminEpisode.jsx
git commit -m "Add combined answer key entry + scoring, and manual override"
```

---

## Task 12: Email sending infrastructure (mailer + templates)

**Files:**
- Create: `scripts/lib/supabaseAdmin.mjs`
- Create: `scripts/lib/mailer.mjs`
- Create: `scripts/lib/emailTemplates.mjs`

- [ ] **Step 1: Create the service-role Supabase client**

Create `scripts/lib/supabaseAdmin.mjs`:

```js
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)
```

- [ ] **Step 2: Create the mailer**

Create `scripts/lib/mailer.mjs`:

```js
import 'dotenv/config'
import nodemailer from 'nodemailer'

let transporter

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    })
  }
  return transporter
}

export async function sendMail({ to, subject, html, text, attachments }) {
  const info = await getTransporter().sendMail({
    from: `"Bake Off Pool" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    text,
    html,
    attachments,
  })
  return info
}
```

- [ ] **Step 3: Create email templates**

Create `scripts/lib/emailTemplates.mjs`:

```js
export function buildWeeklyEmailHtml({ episode, bonusQuestions, siteUrl, previousLeaderboard }) {
  const bonusList = bonusQuestions
    .map((bq) => `<li>${bq.prompt} (${bq.points} pt${bq.points === 1 ? '' : 's'})</li>`)
    .join('')

  const leaderboardSection = previousLeaderboard
    ? `<h3>Standings after episode ${previousLeaderboard.episodeNumber}</h3>
       <ol>${previousLeaderboard.rows.map((r) => `<li>${r.name}: ${r.total}</li>`).join('')}</ol>`
    : ''

  return `
    <div>
      <h2>Episode ${episode.number} predictions are open!</h2>
      ${episode.intro_note ? `<p>${episode.intro_note}</p>` : ''}
      <p>This week's questions: technical winner, Star Baker, who goes home, handshake count${bonusQuestions.length ? ', plus bonus questions:' : '.'}</p>
      ${bonusQuestions.length ? `<ul>${bonusList}</ul>` : ''}
      <p><a href="${siteUrl}">Submit your predictions</a></p>
      ${leaderboardSection}
    </div>
  `
}

export function buildAdminReminderHtml({ episode, kind }) {
  if (kind === 'not-locked') {
    return `<p>Episode ${episode.number} is open but its weekly email isn't locked yet. Add an intro note and click "Lock &amp; ready to send" when it's finalized.</p>`
  }
  if (kind === 'scoring-day') {
    return `<p>It's scoring day! Head to the admin panel to enter the answer key and score this week's episode.</p>`
  }
  return '<p>Reminder from the Bake Off Pool.</p>'
}
```

- [ ] **Step 4: Manually verify locally**

```bash
cd scripts
cat > /tmp/mailer-smoke-test.mjs << 'EOF'
import { sendMail } from './lib/mailer.mjs'
await sendMail({
  to: process.env.GMAIL_USER,
  subject: 'Bake Off Pool test',
  html: '<p>If you see this, SMTP works.</p>',
  text: 'If you see this, SMTP works.',
})
console.log('sent')
EOF
node /tmp/mailer-smoke-test.mjs
rm /tmp/mailer-smoke-test.mjs
```

Confirm you receive the test email (requires `scripts/.env` filled in from Task 1 Step 6).

- [ ] **Step 5: Commit**

```bash
cd /Users/aaronweiss/claude/Projects/bakeoff-prediction
git add scripts/lib/supabaseAdmin.mjs scripts/lib/mailer.mjs scripts/lib/emailTemplates.mjs
git commit -m "Add mailer, Supabase admin client, and email templates"
```

---

## Task 13: Weekly send decision logic (TDD) and script

**Files:**
- Create: `scripts/lib/weeklyEmailDecision.mjs`
- Test: `scripts/lib/weeklyEmailDecision.test.mjs`
- Create: `scripts/send-weekly-email.mjs`

- [ ] **Step 1: Write the failing tests**

Create `scripts/lib/weeklyEmailDecision.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { decideWeeklyAction } from './weeklyEmailDecision.mjs'

describe('decideWeeklyAction', () => {
  it('does nothing when there is no open episode', () => {
    expect(decideWeeklyAction(null)).toEqual({ action: 'none' })
  })

  it('does nothing for a draft episode', () => {
    expect(decideWeeklyAction({ status: 'draft', email_locked_at: null })).toEqual({ action: 'none' })
  })

  it('does nothing for an already-scored episode', () => {
    expect(decideWeeklyAction({ status: 'scored', email_locked_at: '2026-01-01T00:00:00Z' })).toEqual({ action: 'none' })
  })

  it('sends when the open episode is locked', () => {
    expect(decideWeeklyAction({ status: 'open', email_locked_at: '2026-01-01T00:00:00Z' })).toEqual({ action: 'send' })
  })

  it('reminds the admin when the open episode is not locked', () => {
    expect(decideWeeklyAction({ status: 'open', email_locked_at: null })).toEqual({ action: 'remind' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd scripts
npx vitest run lib/weeklyEmailDecision.test.mjs
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the decision logic**

Create `scripts/lib/weeklyEmailDecision.mjs`:

```js
export function decideWeeklyAction(episode) {
  if (!episode) return { action: 'none' }
  if (episode.status !== 'open') return { action: 'none' }
  if (episode.email_locked_at) return { action: 'send' }
  return { action: 'remind' }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd scripts
npx vitest run lib/weeklyEmailDecision.test.mjs
```

Expected: PASS — all 5 tests green.

- [ ] **Step 5: Write the send script**

Create `scripts/send-weekly-email.mjs`:

```js
import 'dotenv/config'
import { supabaseAdmin } from './lib/supabaseAdmin.mjs'
import { sendMail } from './lib/mailer.mjs'
import { buildWeeklyEmailHtml, buildAdminReminderHtml } from './lib/emailTemplates.mjs'
import { decideWeeklyAction } from './lib/weeklyEmailDecision.mjs'

async function getAdminEmails() {
  const { data, error } = await supabaseAdmin.from('admins').select('email')
  if (error) throw error
  return data.map((a) => a.email)
}

async function main() {
  const siteUrl = process.env.SITE_URL
  if (!siteUrl) throw new Error('SITE_URL must be set')

  const { data: episode, error: episodeError } = await supabaseAdmin
    .from('episodes')
    .select('*')
    .eq('status', 'open')
    .order('number', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (episodeError) throw episodeError

  const decision = decideWeeklyAction(episode)
  console.log(`Decision for episode ${episode?.number ?? '(none open)'}: ${decision.action}`)

  if (decision.action === 'none') {
    return
  }

  const adminEmails = await getAdminEmails()

  if (decision.action === 'remind') {
    const html = buildAdminReminderHtml({ episode, kind: 'not-locked' })
    for (const email of adminEmails) {
      await sendMail({ to: email, subject: `Episode ${episode.number} email isn't locked yet`, html, text: html.replace(/<[^>]+>/g, '') })
    }
    console.log(`Sent lock reminder to ${adminEmails.length} admin(s).`)
    return
  }

  // decision.action === 'send'
  const { data: bonusQuestions } = await supabaseAdmin
    .from('bonus_questions')
    .select('*')
    .eq('episode_id', episode.id)

  const { data: players } = await supabaseAdmin.from('players').select('*')

  let previousLeaderboard = null
  const { data: previousEpisode } = await supabaseAdmin
    .from('episodes')
    .select('*')
    .eq('number', episode.number - 1)
    .eq('status', 'scored')
    .maybeSingle()
  if (previousEpisode) {
    const { data: prevScores } = await supabaseAdmin
      .from('scores')
      .select('*')
      .eq('episode_id', previousEpisode.id)
    const rows = (prevScores ?? [])
      .map((s) => ({
        name: players.find((p) => p.id === s.player_id)?.display_name ?? 'Unknown',
        total: s.total,
      }))
      .sort((a, b) => b.total - a.total)
    previousLeaderboard = { episodeNumber: previousEpisode.number, rows }
  }

  const html = buildWeeklyEmailHtml({ episode, bonusQuestions: bonusQuestions ?? [], siteUrl, previousLeaderboard })
  const text = html.replace(/<[^>]+>/g, '')

  for (const player of players ?? []) {
    await sendMail({ to: player.email, subject: `Bake Off Pool: Episode ${episode.number} predictions are open`, html, text })
  }

  await supabaseAdmin.from('episodes').update({ email_sent_at: new Date().toISOString() }).eq('id', episode.id)
  console.log(`Sent weekly email to ${(players ?? []).length} player(s).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 6: Manually verify with a real (or test) open+locked episode**

With at least one `open` + locked episode in your Supabase project (from Task 10's manual verification):

```bash
cd scripts
node send-weekly-email.mjs
```

Confirm the console logs "Decision for episode N: send" and "Sent weekly email to X player(s)," and that you receive the email. Then unlock the episode in the admin UI and re-run — confirm it logs "remind" and you get the lock-reminder email instead.

- [ ] **Step 7: Commit**

```bash
cd /Users/aaronweiss/claude/Projects/bakeoff-prediction
git add scripts/lib/weeklyEmailDecision.mjs scripts/lib/weeklyEmailDecision.test.mjs scripts/send-weekly-email.mjs
git commit -m "Add weekly email send/remind decision logic and script"
```

---

## Task 14: Wednesday reminder and CSV backup

**Files:**
- Create: `scripts/send-scoring-reminder.mjs`
- Create: `scripts/lib/csv.mjs`
- Test: `scripts/lib/csv.test.mjs`
- Create: `scripts/backup-scores.mjs`

- [ ] **Step 1: Write the Wednesday reminder script**

Create `scripts/send-scoring-reminder.mjs`:

```js
import 'dotenv/config'
import { supabaseAdmin } from './lib/supabaseAdmin.mjs'
import { sendMail } from './lib/mailer.mjs'
import { buildAdminReminderHtml } from './lib/emailTemplates.mjs'

async function main() {
  const { data: episode } = await supabaseAdmin
    .from('episodes')
    .select('*')
    .eq('status', 'open')
    .order('number', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!episode) {
    console.log('No open episode — nothing to score.')
    return
  }

  const { data: admins } = await supabaseAdmin.from('admins').select('email')
  const html = buildAdminReminderHtml({ episode, kind: 'scoring-day' })
  for (const admin of admins ?? []) {
    await sendMail({ to: admin.email, subject: 'Bake Off Pool: scoring day', html, text: html.replace(/<[^>]+>/g, '') })
  }
  console.log(`Sent scoring reminder to ${(admins ?? []).length} admin(s).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: Write the failing CSV tests**

Create `scripts/lib/csv.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { toCsv } from './csv.mjs'

describe('toCsv', () => {
  it('produces a header row and one row per record', () => {
    const rows = [{ name: 'Aaron', total: 5 }, { name: 'Priya', total: 3 }]
    const csv = toCsv(rows, ['name', 'total'])
    expect(csv).toBe('name,total\nAaron,5\nPriya,3\n')
  })

  it('quotes fields containing commas, quotes, or newlines', () => {
    const rows = [{ note: 'has, a comma' }, { note: 'has "quotes"' }, { note: 'has\na newline' }]
    const csv = toCsv(rows, ['note'])
    expect(csv).toBe('note\n"has, a comma"\n"has ""quotes"""\n"has\na newline"\n')
  })

  it('renders null/undefined as empty string', () => {
    const rows = [{ a: null, b: undefined }]
    const csv = toCsv(rows, ['a', 'b'])
    expect(csv).toBe('a,b\n,\n')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd scripts
npx vitest run lib/csv.test.mjs
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 4: Implement the CSV helper**

Create `scripts/lib/csv.mjs`:

```js
function escapeCsvField(value) {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function toCsv(rows, columns) {
  const header = columns.join(',')
  const lines = rows.map((row) => columns.map((col) => escapeCsvField(row[col])).join(','))
  return [header, ...lines].join('\n') + '\n'
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd scripts
npx vitest run lib/csv.test.mjs
```

Expected: PASS — all 3 tests green.

- [ ] **Step 6: Write the backup script**

Create `scripts/backup-scores.mjs`:

```js
import 'dotenv/config'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { supabaseAdmin } from './lib/supabaseAdmin.mjs'
import { sendMail } from './lib/mailer.mjs'
import { toCsv } from './lib/csv.mjs'

async function main() {
  const [{ data: scores }, { data: answers }, { data: bonusAnswers }, { data: players }, { data: episodes }, { data: admins }] =
    await Promise.all([
      supabaseAdmin.from('scores').select('*'),
      supabaseAdmin.from('answers').select('*'),
      supabaseAdmin.from('bonus_answers').select('*'),
      supabaseAdmin.from('players').select('*'),
      supabaseAdmin.from('episodes').select('*'),
      supabaseAdmin.from('admins').select('email'),
    ])

  const playerName = (id) => players.find((p) => p.id === id)?.display_name ?? id
  const episodeNumber = (id) => episodes.find((e) => e.id === id)?.number ?? id

  const scoresRows = (scores ?? []).map((s) => ({
    episode: episodeNumber(s.episode_id),
    player: playerName(s.player_id),
    total: s.total,
    manually_overridden: s.manually_overridden,
    breakdown: JSON.stringify(s.points_breakdown),
  }))
  const answersRows = (answers ?? []).map((a) => ({
    episode: episodeNumber(a.episode_id),
    player: playerName(a.player_id),
    technical_pick_id: a.technical_pick_id,
    star_baker_pick_id: a.star_baker_pick_id,
    eliminated_pick_id: a.eliminated_pick_id,
    handshake_guess: a.handshake_guess,
  }))
  const bonusAnswersRows = (bonusAnswers ?? []).map((b) => ({
    bonus_question_id: b.bonus_question_id,
    player: playerName(b.player_id),
    answer_text: b.answer_text,
  }))

  const scoresCsv = toCsv(scoresRows, ['episode', 'player', 'total', 'manually_overridden', 'breakdown'])
  const answersCsv = toCsv(answersRows, ['episode', 'player', 'technical_pick_id', 'star_baker_pick_id', 'eliminated_pick_id', 'handshake_guess'])
  const bonusAnswersCsv = toCsv(bonusAnswersRows, ['bonus_question_id', 'player', 'answer_text'])

  const dateStr = new Date().toISOString().slice(0, 10)
  const backupDir = path.join(process.cwd(), '..', 'backups', dateStr)
  await mkdir(backupDir, { recursive: true })
  await writeFile(path.join(backupDir, 'scores.csv'), scoresCsv)
  await writeFile(path.join(backupDir, 'answers.csv'), answersCsv)
  await writeFile(path.join(backupDir, 'bonus_answers.csv'), bonusAnswersCsv)
  console.log(`Wrote backup CSVs to ${backupDir}`)

  for (const admin of admins ?? []) {
    await sendMail({
      to: admin.email,
      subject: `Bake Off Pool backup — ${dateStr}`,
      text: 'Attached: current scores, answers, and bonus answers.',
      html: '<p>Attached: current scores, answers, and bonus answers.</p>',
      attachments: [
        { filename: 'scores.csv', content: scoresCsv },
        { filename: 'answers.csv', content: answersCsv },
        { filename: 'bonus_answers.csv', content: bonusAnswersCsv },
      ],
    })
  }
  console.log(`Emailed backup to ${(admins ?? []).length} admin(s).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 7: Manually verify**

```bash
cd scripts
node backup-scores.mjs
```

Confirm `backups/<today>/scores.csv` (and the other two files) were created one level up from `scripts/`, and that you received the backup email with attachments.

- [ ] **Step 8: Commit**

```bash
cd /Users/aaronweiss/claude/Projects/bakeoff-prediction
git add scripts/send-scoring-reminder.mjs scripts/lib/csv.mjs scripts/lib/csv.test.mjs scripts/backup-scores.mjs
git commit -m "Add scoring-day reminder and weekly CSV backup with tests"
```

---

## Task 15: GitHub Actions scheduled workflows

**Files:**
- Create: `.github/workflows/thursday-send.yml`
- Create: `.github/workflows/wednesday-reminder.yml`

- [ ] **Step 1: Write the Thursday workflow (send email + backup)**

Create `.github/workflows/thursday-send.yml`:

```yaml
name: Thursday send and backup

on:
  schedule:
    - cron: '0 13 * * 4'
  workflow_dispatch: {}

permissions:
  contents: write

jobs:
  send-and-backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install script dependencies
        working-directory: scripts
        run: npm ci

      - name: Send weekly email
        working-directory: scripts
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          GMAIL_USER: ${{ secrets.GMAIL_USER }}
          GMAIL_APP_PASSWORD: ${{ secrets.GMAIL_APP_PASSWORD }}
          SITE_URL: ${{ secrets.SITE_URL }}
        run: node send-weekly-email.mjs

      - name: Back up scores to CSV
        working-directory: scripts
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          GMAIL_USER: ${{ secrets.GMAIL_USER }}
          GMAIL_APP_PASSWORD: ${{ secrets.GMAIL_APP_PASSWORD }}
        run: node backup-scores.mjs

      - name: Commit backup CSVs if changed
        run: |
          git config user.name "bakeoff-bot"
          git config user.email "actions@github.com"
          git add backups/
          git diff --cached --quiet || git commit -m "Weekly score backup $(date -u +%Y-%m-%d)"
          git push
```

- [ ] **Step 2: Write the Wednesday workflow (scoring reminder)**

Create `.github/workflows/wednesday-reminder.yml`:

```yaml
name: Wednesday scoring reminder

on:
  schedule:
    - cron: '0 13 * * 3'
  workflow_dispatch: {}

jobs:
  remind:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install script dependencies
        working-directory: scripts
        run: npm ci

      - name: Send scoring reminder
        working-directory: scripts
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          GMAIL_USER: ${{ secrets.GMAIL_USER }}
          GMAIL_APP_PASSWORD: ${{ secrets.GMAIL_APP_PASSWORD }}
        run: node send-scoring-reminder.mjs
```

- [ ] **Step 3: Push the repo and add GitHub Actions secrets**

```bash
cd /Users/aaronweiss/claude/Projects/bakeoff-prediction
git push -u origin main
```

In the GitHub repo: Settings → Secrets and variables → Actions → New repository secret. Add each of: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `SITE_URL` (use the same values as your local `scripts/.env`).

- [ ] **Step 4: Manually verify**

In the GitHub repo's Actions tab, manually trigger each workflow once via "Run workflow" (workflow_dispatch). Confirm both runs succeed (green checkmark) and that you receive the expected email. Check the "Commit backup CSVs if changed" step in the Thursday workflow actually pushed a `backups/<date>/` commit.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/thursday-send.yml .github/workflows/wednesday-reminder.yml
git commit -m "Add scheduled GitHub Actions for weekly email and scoring reminder"
git push
```

---

## Task 16: Deploy the frontend to GitHub Pages

**Files:**
- Create: `.github/workflows/deploy-web.yml`

- [ ] **Step 1: Write the deploy workflow**

Create `.github/workflows/deploy-web.yml`:

```yaml
name: Deploy web app to GitHub Pages

on:
  push:
    branches: [main]
    paths:
      - 'web/**'
      - '.github/workflows/deploy-web.yml'
  workflow_dispatch: {}

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        working-directory: web
        run: npm ci

      - name: Build
        working-directory: web
        env:
          VITE_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
          VITE_GITHUB_REPO: ${{ github.repository }}
        run: npm run build

      - uses: actions/upload-pages-artifact@v3
        with:
          path: web/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Add the anon key secret and enable Pages**

Add a `SUPABASE_ANON_KEY` repository secret (the same value as `web/.env`'s `VITE_SUPABASE_ANON_KEY` — safe to expose since it's designed to be public and RLS enforces access).

In the GitHub repo: Settings → Pages → Build and deployment → Source → "GitHub Actions".

- [ ] **Step 3: Push and verify the deploy**

```bash
git add .github/workflows/deploy-web.yml
git commit -m "Add GitHub Pages deployment workflow"
git push
```

Watch the Actions tab for the "Deploy web app to GitHub Pages" run. Once green, open the URL shown in the deploy step's summary (or Settings → Pages) — confirm the sign-in page loads.

- [ ] **Step 4: Update Supabase and script URLs with the real Pages URL**

Now that you know the real URL:
- Supabase dashboard → Auth → URL Configuration → Site URL: set to the real Pages URL.
- Update the `SITE_URL` GitHub Actions secret (Task 15 Step 3) to match.
- Update your local `scripts/.env` `SITE_URL` to match, for local testing.

- [ ] **Step 5: Final end-to-end manual QA**

Walk through the full loop once, live:
1. Sign up as a fresh test email, confirm the magic link and onboarding work.
2. As admin: add a couple of real bakers, create episode 1, add a bonus question, publish, write an intro note, lock it.
3. Manually trigger the Thursday workflow (or run `node scripts/send-weekly-email.mjs` locally) and confirm the email arrives and its link opens the live site.
4. As the test player, submit answers.
5. As admin: enter the answer key, score the episode.
6. Confirm the leaderboard and episode reveal show correct data.
7. Manually trigger the backup workflow (or run `node scripts/backup-scores.mjs` locally) and confirm the CSVs and email look right.

If everything checks out, the pool is ready for the real season.
