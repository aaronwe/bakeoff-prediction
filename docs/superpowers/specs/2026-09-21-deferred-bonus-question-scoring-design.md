# Deferred bonus-question scoring & multi-pick predictions

## Motivation

Early in the season we want to ask players to predict who makes the final
three (or five, at the merge, or any other future milestone) — a multi-select
prediction whose correct answer isn't known until many episodes later. The
app's bonus-question system currently assumes every question is graded at the
same time its own episode is scored: `AnswerKeyAndScore` (in
`web/src/pages/admin/AdminEpisode.jsx`) enters each bonus question's
`correct_answer` in the same form submission that scores the episode's core
picks, and a DB trigger only allows `correct_answer` to be set once that
question's own episode is already `'scored'`.

This spec generalizes bonus-question resolution so *any* bonus question —
trivia or long-range prediction — can be graded whenever the admin actually
knows the answer, independent of when its own episode was scored. It also
adds a multi-select answer type (`baker_multi_pick`) for "predict N bakers"
questions.

## Data model

All changes are additive `alter table` statements appended to
`supabase/schema.sql`, matching its existing style (see the
`bakers_eliminated_episode_id_fkey` and `episodes_answer_key_only_when_scored`
additions already in that file).

```sql
alter table bonus_questions add column correct_baker_ids uuid[];
alter table bonus_answers add column answer_baker_ids uuid[];
```

- `bonus_questions.type` gains a new allowed value: `'baker_multi_pick'`.
  Update the existing `check (type in (...))` constraint to include it.
- For `baker_multi_pick` questions, `options` (already `jsonb`) holds
  `{"pick_count": 3}` — the max number of bakers a player may pick. This
  reuses the column that `multiple_choice` already uses for its option list;
  no new column needed.
- For `baker_multi_pick` questions, `points` means *points per correctly
  picked baker* (not a flat per-question total) — e.g. `points: 1` with 2 of
  3 picks correct scores 2.
- `correct_baker_ids` is the actual outcome (e.g. the real final three),
  filled in whenever it becomes known — parallel to `correct_answer` but for
  the multi-pick type.
- `answer_baker_ids` is the player's set of picks — parallel to `answer_text`
  but for the multi-pick type. `answer_text` stays unused for this question
  type.

### Trigger update

`enforce_bonus_correct_answer_only_when_scored` must also guard the new
column — a `baker_multi_pick` question's outcome shouldn't be settable before
its own asking episode is scored, same rule already applied to
`correct_answer`:

```sql
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
```

This is only a "not before its own episode is scored" floor, not a ceiling —
it does not (and must not) require the answer key be set *at* that scoring
time. That gap is exactly what makes deferred resolution possible: an episode
can be scored today with a bonus question's answer key left null, and that
column can be updated any time after — five minutes later or five months
later — without re-touching the episode row at all.

No new "is this deferred" flag is needed. A bonus question's resolution
status is derived, not stored: it's unresolved for as long as both
`correct_answer` and `correct_baker_ids` are null, whether that's for five
minutes (ordinary trivia, graded right after the episode airs) or five months
(a finale-only prediction). The same mechanism handles both.

## Answering flow

### `BakerPicker` gains a multi-select mode

`web/src/components/BakerPicker.jsx` currently always renders radio buttons
(single-select) with a "no pick" option. Add two new props:

- `multiple` (bool, default `false`) — renders checkboxes instead of radio
  buttons when true, and drops the "no pick" pseudo-option (unchecking is
  itself "no pick" for any given baker).
- `maxPicks` (number, required when `multiple`) — once this many bakers are
  checked, remaining checkboxes are disabled until one is unchecked. Players
  may submit fewer than `maxPicks` (e.g. 2 of 3) — partial predictions are
  allowed, consistent with every other pick in the app being optional.
- `value`/`onChange` become an array of baker ids instead of a single id when
  `multiple` is true.

Existing call sites (technical/star/eliminated picks, `baker_pick` bonus
questions) don't pass `multiple`, so they're unaffected.

### `WeeklyForm` renders it for `baker_multi_pick` questions

`web/src/components/WeeklyForm.jsx`'s `bonusOptionsFor` / rendering switch
gains a branch: for `type === 'baker_multi_pick'`, render `BakerPicker` with
`multiple`, `maxPicks={bq.options.pick_count}`, and bakers from
`activeBakers` (or `allBakers` if `bq.include_eliminated`, matching how
`baker_pick` already chooses its pool). The chosen ids are tracked in a new
`bonusAnswerBakerIds` state map (parallel to the existing `bonusAnswerText`
map) and upserted to `bonus_answers.answer_baker_ids` instead of
`answer_text` on submit.

## Scoring (`web/src/lib/scoring.js`)

`scoreBonusAnswer` changes signature from `(bonusQuestion, answerText)` to
`(bonusQuestion, bonusAnswer)` — it now receives the whole answer row instead
of just the text, so it can read either field depending on type:

```js
export function scoreBonusAnswer(bonusQuestion, bonusAnswer) {
  if (bonusQuestion.type === 'baker_multi_pick') {
    const picks = bonusAnswer?.answer_baker_ids
    const correct = bonusQuestion.correct_baker_ids
    if (!picks?.length || !correct?.length) return 0
    const correctSet = new Set(correct)
    const matches = picks.filter((id) => correctSet.has(id)).length
    return matches * bonusQuestion.points
  }
  const answerText = bonusAnswer?.answer_text
  if (!answerText || !bonusQuestion.correct_answer) return 0
  const normalize = (s) => s.trim().toLowerCase()
  return normalize(answerText) === normalize(bonusQuestion.correct_answer)
    ? bonusQuestion.points
    : 0
}
```

`computeScoreForPlayer` passes the matched `bonusAnswers` row (`ba`) instead
of `ba?.answer_text` to `scoreBonusAnswer` — everything else about it
(looping over `bonusQuestions`, keying the breakdown by `bonus_${bq.id}`,
summing into `total`) is unchanged. This is also why episode-level scoring
still works untouched for a not-yet-resolved question: `correct_baker_ids`/
`correct_answer` is null, so it scores 0 and gets included in the total like
any other unanswered/ungraded question, exactly as today.

## Resolving bonus questions

### `AnswerKeyAndScore` loses its inline bonus-question inputs

Remove `bonusCorrect` state and the loop that writes
`bonus_questions.correct_answer` from `AnswerKeyAndScore` in
`AdminEpisode.jsx`. It continues to enter and score the episode's own answer
key (technical/star/eliminated/handshake) exactly as today — that recompute
pass still includes each bonus question's *current* contribution (0 if
ungraded), it just no longer offers to grade bonus questions inline.

Copy to remove: `correctAnswerLabel` becomes unused in `AnswerKeyAndScore`
(still used by the new page below) — `SCORING_NOTE`'s wording ("entering the
key and scoring happen together in one step") should be adjusted to only
describe the episode's own answer key, since that's no longer true of bonus
questions.

### New page: `/admin/bonus-questions`

A new `AdminBonusQuestions.jsx` page (with a paired `AdminBonusQuestions.copy.js`,
matching this project's convention of keeping display strings in a sibling
`.copy.js` file), linked from `AdminDashboard`, lists
every bonus question belonging to an already-`'scored'` episode where the
answer key is still unset (`correct_answer is null and correct_baker_ids is
null`) — across *all* episodes, not just the current one, since a
long-range prediction's owning episode may have been scored months before
its answer is knowable.

Each row shows the episode number, the prompt, and an input matched to the
question's type:

- `free_text` / `multiple_choice` / `baker_pick`: a plain text input,
  identical to the one `AnswerKeyAndScore` used to render. `baker_pick`
  questions store the baker's *name* as a plain string in `answer_text`/
  `correct_answer` (see `WeeklyForm.jsx`'s `bonusOptionsFor`, which options
  its `<select>` by `b.name`) — they don't use baker ids at all today, so
  their resolution input stays a free-text match rather than a
  `BakerPicker`, to avoid writing an id where a name is expected.
- `baker_multi_pick`: a multi-select `BakerPicker` over `allBakers`, capped
  at `options.pick_count`. Unlike `baker_pick`, this is a new answer format
  with no legacy string-matching to stay compatible with, so it uses real
  baker ids (`correct_baker_ids`/`answer_baker_ids`) from the start.

Clicking "Score" for a row:

1. Writes `correct_answer` or `correct_baker_ids` (whichever the type uses)
   on that `bonus_questions` row.
2. Re-fetches every `bonus_answers` row for that question and every existing
   `scores` row for its owning episode (`bonus_questions.episode_id`).
3. For each player who answered (or has an existing score row) for that
   episode, recomputes just this question's `bonus_${bq.id}` contribution via
   `scoreBonusAnswer`, merges it into that player's existing
   `points_breakdown`, re-sums `total` from the merged breakdown, and upserts
   into `scores` — skipping (and counting as "preserved") any row with
   `manually_overridden: true`, identical to `AnswerKeyAndScore`'s existing
   preserved-count behavior.
4. Reports a summary line ("N player score(s) recomputed, M manual
   override(s) preserved"), same pattern as `AnswerKeyAndScore`.

This is the entire mechanism for "score old predictions" — asking a
mid-season "final five at the merge" question needs no code changes, just
another `baker_multi_pick` bonus question; it shows up on this same page
once its own episode is scored and sits there, unresolved, until the admin
comes back to grade it.

### Routing

Add `<Route path="/admin/bonus-questions" element={<RequireAdmin><AdminBonusQuestions /></RequireAdmin>} />`
to `App.jsx`, and a link from `AdminDashboard`.

## Display

`EpisodeReveal.jsx`'s bonus-question table column currently renders
`ba?.answer_text ?? copy.NO_ANSWER`. For `baker_multi_pick` questions it
needs to render the picked baker names instead: join
`ba?.answer_baker_ids` through the already-fetched `bakers` list (the same
`bakerName` helper already used for the core picks), comma-separated, or
`NO_ANSWER` if empty/missing.

## Testing

- `scoring.test.js`: extend `scoreBonusAnswer`'s describe block with
  `baker_multi_pick` cases (full match, partial match, no match, no picks
  submitted, no correct answer set yet) and update its existing calls to
  pass an answer-row object (`{ answer_text: '...' }`) instead of a bare
  string, since the signature changed. Extend `computeScoreForPlayer`'s bonus
  tests with a `baker_multi_pick` question to confirm the breakdown/total
  wiring still works with the new signature.
- `BakerPicker`: no existing test file (component is currently only exercised
  through the pages that use it) — manual verification via the dev server is
  sufficient, consistent with how the rest of this project verifies UI
  changes.

## Out of scope

- No changes to the `answers`/core-pick tables or their scoring — this spec
  only touches bonus questions.
- No UI for editing `pick_count` after a `baker_multi_pick` question is
  created (matches existing bonus questions, which also aren't editable
  after creation).
