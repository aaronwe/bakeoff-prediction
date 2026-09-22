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

-- ── Deferred / multi-pick bonus questions ───────────────────
-- Lets a bonus question be a multi-select prediction (e.g. "who makes the
-- final three?") whose answer key isn't known until long after its own
-- episode was scored. correct_baker_ids/answer_baker_ids are the
-- baker_multi_pick equivalents of correct_answer/answer_text; a question's
-- resolution status is derived (both columns null = ungraded), not stored,
-- so this same pair of columns works whether the answer is known five
-- minutes or five months after the episode airs.

alter table bonus_questions drop constraint bonus_questions_type_check;
alter table bonus_questions add constraint bonus_questions_type_check
  check (type in ('baker_pick', 'multiple_choice', 'free_text', 'baker_multi_pick'));

alter table bonus_questions add column correct_baker_ids uuid[];
alter table bonus_answers add column answer_baker_ids uuid[];

-- Extends the existing "only after this question's own episode is scored"
-- rule (see enforce_bonus_correct_answer_only_when_scored above) to also
-- cover correct_baker_ids.
create or replace function enforce_bonus_correct_answer_only_when_scored() returns trigger
language plpgsql
as $$
begin
  if new.correct_answer is not null or new.correct_baker_ids is not null then
    if not exists (select 1 from episodes e where e.id = new.episode_id and e.status = 'scored') then
      raise exception 'correct_answer can only be set once the episode is scored';
    end if;
  end if;
  return new;
end;
$$;

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
insert into admins (email) values ('aaronwe@gmail.com');

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

-- ── Public views ─────────────────────────────────────────────

-- players_select deliberately restricts full player rows (which include
-- email) to the caller's own row or an admin. But the leaderboard and
-- episode reveal pages need every player's display_name, not just the
-- caller's own. This view exposes only the safe columns to solve that
-- without loosening players_select itself (which would expose every
-- player's email address to every other player).
--
-- This works specifically because it's a plain view (no `security_invoker`),
-- so it runs as its owner rather than the querying user — and table owners
-- bypass RLS by default (schema.sql never sets FORCE ROW LEVEL SECURITY on
-- `players`), so the view sees every row regardless of players_select.
create view players_public as
select id, display_name from players;

grant select on players_public to authenticated;
