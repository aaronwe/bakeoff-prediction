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
  technical_winner_baker_id uuid references bakers(id),
  star_baker_id uuid references bakers(id),
  eliminated_baker_id uuid references bakers(id),
  handshake_count integer,
  created_at timestamptz not null default now()
);

alter table bakers
  add constraint bakers_eliminated_episode_id_fkey
  foreign key (eliminated_episode_id) references episodes(id);

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
as $$
  select exists (
    select 1 from admins where email = auth.jwt() ->> 'email'
  );
$$;

create or replace function current_player_id() returns uuid
language sql stable
as $$
  select id from players where email = auth.jwt() ->> 'email';
$$;

grant execute on function is_admin() to authenticated;
grant execute on function current_player_id() to authenticated;

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
  player_id = current_player_id()
  and exists (select 1 from episodes e where e.id = episode_id and e.status = 'open')
);
create policy answers_update on answers for update using (
  player_id = current_player_id()
  and exists (select 1 from episodes e where e.id = episode_id and e.status = 'open')
) with check (
  player_id = current_player_id()
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
  player_id = current_player_id()
  and exists (
    select 1 from bonus_questions bq join episodes e on e.id = bq.episode_id
    where bq.id = bonus_question_id and e.status = 'open'
  )
);
create policy bonus_answers_update on bonus_answers for update using (
  player_id = current_player_id()
  and exists (
    select 1 from bonus_questions bq join episodes e on e.id = bq.episode_id
    where bq.id = bonus_question_id and e.status = 'open'
  )
) with check (
  player_id = current_player_id()
);

create policy scores_select on scores for select using (auth.role() = 'authenticated');
create policy scores_write on scores for all using (is_admin()) with check (is_admin());

create policy admins_select on admins for select using (is_admin());
