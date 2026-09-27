# Draft answer keys (save without scoring)

## Motivation

Today, entering the episode's answer key and running scores are the same
click: `AnswerKeyAndScore`'s single submit handler (in
`web/src/pages/admin/AdminEpisode.jsx`) writes the four answer-key columns
*and* flips `episodes.status` to `'scored'` in one `update`, then immediately
recomputes every player's score. This is required today, not just how it
happens to be wired — `episodes_answer_key_only_when_scored` (a CHECK
constraint in `supabase/schema.sql`) rejects a non-null answer key on any
episode row that isn't already `'scored'`, because `episodes_select` lets any
authenticated player read an `open` episode's row. If the answer key could sit
there non-null before scoring, a player could read the correct answers off
that still-open row and edit their own prediction to match before the admin
ever clicks "score." The same constraint (via a trigger) applies to
`bonus_questions.correct_answer`/`correct_baker_ids`.

The admin wants to jot down answers while watching an episode — before all of
them are settled, or before they're ready to lock predictions and notify
players — and only formally lock and score once, later (e.g. the following
Wednesday). This spec adds a **draft** answer key that can be saved freely
without touching the real, RLS-sensitive columns, and is never player-visible.

## Data model

Two new tables, admin-only via RLS, appended to `supabase/schema.sql` in its
existing append-only style (see the judge/host-pick block at the end of that
file for the most recent precedent). Draft columns live in their own tables
rather than as nullable columns on `episodes`/`bonus_questions`, because RLS
can't selectively hide individual columns on a row a player is otherwise
allowed to `select` — a separate table with no player-facing `select` policy
at all is what actually keeps a draft private.

```sql
create table episode_draft_answer_keys (
  episode_id uuid primary key references episodes(id) on delete cascade,
  technical_winner_baker_id uuid references bakers(id),
  star_baker_id uuid references bakers(id),
  eliminated_baker_id uuid references bakers(id),
  handshake_count integer,
  updated_at timestamptz not null default now()
);
alter table episode_draft_answer_keys enable row level security;
create policy episode_draft_answer_keys_write on episode_draft_answer_keys
  for all using (is_admin()) with check (is_admin());

create table bonus_question_draft_answer_keys (
  bonus_question_id uuid primary key references bonus_questions(id) on delete cascade,
  correct_answer text,
  correct_baker_ids uuid[],
  updated_at timestamptz not null default now()
);
alter table bonus_question_draft_answer_keys enable row level security;
create policy bonus_question_draft_answer_keys_write on bonus_question_draft_answer_keys
  for all using (is_admin()) with check (is_admin());
```

Neither table gets a `_select` policy for players — the default-deny (no
policy at all beyond the admin-only `for all`) is what makes these safe to
fill in on an `open` episode. This mirrors `admins_select`/`scores_write`'s
existing "admin-only, nothing else" pattern rather than introducing a new
one.

No changes to `episodes_answer_key_only_when_scored`, its trigger
counterpart, or any existing RLS policy. The real answer-key columns keep
their existing "only non-null once scored" invariant exactly as-is — drafts
are purely an additional, parallel, private scratchpad.

## Precedence: draft vs. real answer

Once the real answer key is set (episode scored, or a bonus question
graded), it always wins over any leftover draft value — a draft is only ever
a placeholder for an answer that isn't final yet, never a second source of
truth once the real one exists. This resolution logic is pure and shared by
both the episode-level and bonus-question-level forms:

```js
// web/src/lib/draftAnswerKeys.js
export function resolveEpisodeAnswerKeyDefaults(episode, draftAnswerKey) {
  return {
    technicalWinner: episode.technical_winner_baker_id ?? draftAnswerKey?.technical_winner_baker_id ?? '',
    starBaker: episode.star_baker_id ?? draftAnswerKey?.star_baker_id ?? '',
    eliminated: episode.eliminated_baker_id ?? draftAnswerKey?.eliminated_baker_id ?? '',
    handshakeCount: episode.handshake_count ?? draftAnswerKey?.handshake_count ?? '',
  }
}

export function resolveBonusAnswerKeyDefaults(bonusQuestion, draftAnswerKey) {
  return {
    text: bonusQuestion.correct_answer ?? draftAnswerKey?.correct_answer ?? '',
    bakerIds: bonusQuestion.correct_baker_ids ?? draftAnswerKey?.correct_baker_ids ?? [],
  }
}
```

`??`, not `||`: `handshake_count` of `0` is a real answer and must not be
treated as missing, matching the same reasoning already documented on
`scoreHandshake` in `scoring.js`.

## Episode answer key (`AdminEpisode.jsx`)

`AnswerKeyAndScore` changes from one form/one button to one form/two actions,
mirroring `IntroNoteAndLock`'s existing "save note" vs. "lock" split in the
same file:

- **Save draft** — upserts the four fields (converted the same way the
  existing submit already does: empty string → `null`, handshake count
  through `Number(...)`) into `episode_draft_answer_keys`, keyed on
  `episode_id`. Never touches `episodes` or `scores`. Works at any episode
  status.
- **Lock & score** — unchanged: the existing atomic
  `episodes.update({...answer key, status: 'scored'})` followed by the
  existing recompute-every-player pass. Button label logic (`Re-score` once
  already scored) is unchanged.

The component's initial form state is seeded via
`resolveEpisodeAnswerKeyDefaults(episode, draftAnswerKey)` instead of reading
`episode.*` directly, so a previously-saved draft prefills the form on
load (and a real, already-scored answer still wins if both exist).
`draftAnswerKey` is a new prop, fetched by `loadEpisodeData` alongside the
episode's other data (`supabase.from('episode_draft_answer_keys').select('*')
.eq('episode_id', ep.id).maybeSingle()`).

`SCORING_NOTE`'s copy needs to change: it currently says nothing is saved
until you submit, which stops being true once "Save draft" exists.

## Bonus questions (`AdminBonusQuestions.jsx`)

Bonus questions are graded on a separate page from the episode's own answer
key, and only ever listed there once their owning episode's `status` is
already `'scored'` (`fetchUnresolvedBonusQuestions`/`fetchGradedBonusQuestions`
both filter on it). That means today there is no way to jot down a bonus
question's likely answer while its episode is still airing — the page simply
doesn't show it yet. This spec adds a third section for exactly that case.

### New query: `fetchOpenBonusQuestions`

Companion to the existing two fetches, same `episodes!inner(number, status,
title)` join, filtered to `status = 'open'` instead of `'scored'`:

```js
export async function fetchOpenBonusQuestions() {
  const { data, error } = await supabase
    .from('bonus_questions')
    .select('*, episodes!inner(number, status, title)')
    .eq('episodes.status', 'open')
    .order('created_at')
  if (error) throw error
  return data
}
```

### New query: `fetchBonusQuestionDraftAnswerKeys`

```js
export async function fetchBonusQuestionDraftAnswerKeys(bonusQuestionIds) {
  if (bonusQuestionIds.length === 0) return []
  const { data, error } = await supabase
    .from('bonus_question_draft_answer_keys')
    .select('*')
    .in('bonus_question_id', bonusQuestionIds)
  if (error) throw error
  return data
}
```

Fetched only for the open (not-yet-scored) and unresolved-but-scored
questions — a question that's already graded never needs its draft looked
up, since the real key always wins.

### New section: "Airing now"

A new `DraftBonusQuestionRow` component (rendered for `fetchOpenBonusQuestions`
results) renders the same type-dependent input switch `BonusQuestionRow`
already has (`BakerPicker` for `baker_multi_pick`, `JudgeHostPicker` for
`judge_host_pick`, a plain text input otherwise) but with a single **Save
draft** button that upserts into `bonus_question_draft_answer_keys` — no
scoring action is offered here, since the DB trigger would reject a real
`correct_answer`/`correct_baker_ids` write until the episode itself is
scored. That type-dependent input switch is extracted into a small shared
`BonusAnswerKeyFields` component so `BonusQuestionRow` and
`DraftBonusQuestionRow` don't duplicate the three-way branch.

`BonusQuestionRow`'s own initial `text`/`bakerIds` state changes from reading
`bq.correct_answer ?? ''` / `bq.correct_baker_ids ?? []` directly to
`resolveBonusAnswerKeyDefaults(bq, draftAnswerKey)`, so a question that
already has a saved draft opens pre-filled with it once it reaches the
"Needs grading" list (i.e. once its episode is scored) — the admin just
confirms and clicks "Score" instead of retyping.

### Routing / navigation

No new route — this is a new section on the existing `/admin/bonus-questions`
page.

## Testing

- `web/src/lib/draftAnswerKeys.test.js` (new): unit tests for
  `resolveEpisodeAnswerKeyDefaults` and `resolveBonusAnswerKeyDefaults`
  covering "real answer wins over draft", "draft wins over nothing", "neither
  present falls back to blank/empty", and the handshake-count-of-`0`
  not-missing case — same style as `scoring.test.js`.
- No React component-testing library exists in this repo today (`vitest`
  covers pure functions only; `BonusQuestionRow`/`IntroNoteAndLock`/etc. have
  no tests). New Supabase-calling glue code (the query functions, the two new
  upsert handlers) stays manually verified via the dev server, consistent
  with how every other write path in these two files is verified today. This
  spec does not introduce a component-testing framework.
- Manual verification via the dev server before merging: save a draft on an
  `open` episode and confirm the episode stays `open` and un-scored; confirm
  a non-admin player session cannot read `episode_draft_answer_keys` or
  `bonus_question_draft_answer_keys` (RLS default-deny); Lock & Score still
  recomputes correctly; a bonus-question draft saved while an episode is
  `open` prefills once that episode is scored and the question reaches
  "Needs grading".

## Out of scope

- No change to `episodes_answer_key_only_when_scored`, the bonus-question
  trigger, or any existing RLS policy.
- No autosave-on-blur — "Save draft" is an explicit button, matching this
  project's existing form conventions (`IntroNoteAndLock`,
  `AnswerKeyAndScore`) rather than `ManualOverrides`' onBlur pattern.
- No UI to delete a draft independently of overwriting it — saving a new
  draft value already overwrites the old one (upsert), and a draft is
  superseded automatically once the real key is set.
