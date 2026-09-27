# Draft Answer Keys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin save a draft episode/bonus-question answer key at any time, without triggering scoring or touching the real, RLS-sensitive answer-key columns, so they can jot down answers while watching and lock/score everything later.

**Architecture:** Two new admin-only Postgres tables (`episode_draft_answer_keys`, `bonus_question_draft_answer_keys`) hold drafts with no player-facing `select` policy at all. A shared pure-function module resolves "real answer wins over draft, draft wins over blank" for form defaults. `AdminEpisode.jsx`'s answer-key form gains a "Save draft" button alongside its existing "Lock & score" action; `AdminBonusQuestions.jsx` gains a new "Airing now" section with its own "Save draft" button, for bonus questions whose episode hasn't been locked yet.

**Tech Stack:** React 19 + Vite, Supabase (Postgres + RLS, `@supabase/supabase-js` v2), Vitest for unit tests, oxlint.

**Spec:** [docs/superpowers/specs/2026-09-27-draft-answer-keys-design.md](../specs/2026-09-27-draft-answer-keys-design.md)

## Global Constraints

- No change to `episodes_answer_key_only_when_scored`, its trigger counterpart on `bonus_questions`, or any existing RLS policy — this feature is strictly additive.
- Draft tables get **no** player-facing `select` policy — admin-only `for all using (is_admin()) with check (is_admin())`, matching `scores_write`'s existing pattern.
- Precedence is always "real answer > draft > blank" — use `??`, never `||` (a handshake count or baker id of falsy-but-real value must not be treated as missing).
- "Save draft" is an explicit button, not autosave-on-blur — matches `IntroNoteAndLock`/`AnswerKeyAndScore`'s existing form conventions in this codebase, not `ManualOverrides`' onBlur pattern.
- No new component-testing framework. New pure logic gets Vitest unit tests (matching `scoring.js`/`scoring.test.js`); new Supabase-calling glue code is verified manually via the dev server, exactly like every other write path in `AdminEpisode.jsx`/`AdminBonusQuestions.jsx` today.
- `supabase/schema.sql` is a manually-applied, append-only running script (its header: "Run this once in the Supabase SQL Editor") — there is no local Postgres/Supabase CLI in this repo to apply it automatically. The new SQL block must be run by the admin (Aaron) in the Supabase SQL Editor themselves; no task in this plan runs it for them.

---

## File Structure

- Modify: `supabase/schema.sql` — append the two new tables + RLS policies.
- Create: `web/src/lib/draftAnswerKeys.js` — pure "resolve form defaults" helpers.
- Create: `web/src/lib/draftAnswerKeys.test.js` — Vitest coverage for the above.
- Modify: `web/src/lib/queries.js` — add `fetchDraftAnswerKey`, `fetchOpenBonusQuestions`, `fetchBonusQuestionDraftAnswerKeys`.
- Modify: `web/src/pages/admin/AdminEpisode.jsx` — `loadEpisodeData` fetches the draft row; `AnswerKeyAndScore` gets a "Save draft" button.
- Modify: `web/src/pages/admin/AdminEpisode.copy.js` — new/updated copy strings.
- Modify: `web/src/pages/admin/AdminBonusQuestions.jsx` — extract `BonusAnswerKeyFields`, add `DraftBonusQuestionRow` and the "Airing now" section.
- Modify: `web/src/pages/admin/AdminBonusQuestions.copy.js` — new copy strings.

---

### Task 1: Draft answer key tables

**Files:**
- Modify: `supabase/schema.sql` (append after line 357, the end of the judge/host-pick block)

**Interfaces:**
- Produces: tables `episode_draft_answer_keys` (columns: `episode_id` pk/fk, `technical_winner_baker_id`, `star_baker_id`, `eliminated_baker_id`, `handshake_count`, `updated_at`) and `bonus_question_draft_answer_keys` (columns: `bonus_question_id` pk/fk, `correct_answer`, `correct_baker_ids`, `updated_at`), both admin-write-only via RLS. Later tasks read/write these by exact name.

- [ ] **Step 1: Append the new tables and policies**

Add to the end of `supabase/schema.sql`:

```sql

-- ── Draft answer keys ─────────────────────────────────────────
-- Lets an admin jot down answers while watching, before locking predictions
-- and running scores. These live in their own tables (not nullable columns
-- on episodes/bonus_questions) because RLS can't selectively hide individual
-- columns on a row a player is otherwise allowed to select — a separate
-- table with no player-facing select policy at all is what actually keeps a
-- draft private. See episodes_answer_key_only_when_scored above for the
-- leak this avoids reproducing.
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

- [ ] **Step 2: Sanity-check the SQL by eye**

There's no local Postgres in this repo to run this against, so read it back once: both tables have RLS enabled with exactly one policy each (`for all using (is_admin()) with check (is_admin())`), and neither has any `_select` policy — that omission is intentional (default-deny for everyone but the `for all` policy's admin check).

- [ ] **Step 3: Tell the admin to apply it**

This step has no code — note in the task's completion message that the new block starting at `-- ── Draft answer keys ─────` must be run in the Supabase SQL Editor before Task 4/5's features will work end-to-end. Everything in Tasks 2–5 can still be implemented and unit-tested without it.

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql
git commit -m "Add admin-only draft answer key tables"
```

---

### Task 2: Pure defaults resolver

**Files:**
- Create: `web/src/lib/draftAnswerKeys.js`
- Test: `web/src/lib/draftAnswerKeys.test.js`

**Interfaces:**
- Consumes: nothing (pure functions, plain object args).
- Produces: `resolveEpisodeAnswerKeyDefaults(episode, draftAnswerKey) -> { technicalWinner, starBaker, eliminated, handshakeCount }` (all strings, `''` when unset) and `resolveBonusAnswerKeyDefaults(bonusQuestion, draftAnswerKey) -> { text, bakerIds }` (`text` a string, `bakerIds` an array). Tasks 4 and 5 call these by these exact names/shapes.

- [ ] **Step 1: Write the failing tests**

Create `web/src/lib/draftAnswerKeys.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { resolveEpisodeAnswerKeyDefaults, resolveBonusAnswerKeyDefaults } from './draftAnswerKeys'

describe('resolveEpisodeAnswerKeyDefaults', () => {
  it('falls back to blank when neither a real answer nor a draft exists', () => {
    const episode = {}
    expect(resolveEpisodeAnswerKeyDefaults(episode, null)).toEqual({
      technicalWinner: '',
      starBaker: '',
      eliminated: '',
      handshakeCount: '',
    })
  })

  it('uses the draft when no real answer is set yet', () => {
    const episode = {}
    const draft = {
      technical_winner_baker_id: 'baker-1',
      star_baker_id: 'baker-2',
      eliminated_baker_id: 'baker-3',
      handshake_count: 4,
    }
    expect(resolveEpisodeAnswerKeyDefaults(episode, draft)).toEqual({
      technicalWinner: 'baker-1',
      starBaker: 'baker-2',
      eliminated: 'baker-3',
      handshakeCount: 4,
    })
  })

  it('prefers the real answer over a leftover draft', () => {
    const episode = {
      technical_winner_baker_id: 'real-1',
      star_baker_id: 'real-2',
      eliminated_baker_id: 'real-3',
      handshake_count: 7,
    }
    const draft = {
      technical_winner_baker_id: 'draft-1',
      star_baker_id: 'draft-2',
      eliminated_baker_id: 'draft-3',
      handshake_count: 1,
    }
    expect(resolveEpisodeAnswerKeyDefaults(episode, draft)).toEqual({
      technicalWinner: 'real-1',
      starBaker: 'real-2',
      eliminated: 'real-3',
      handshakeCount: 7,
    })
  })

  // A handshake count of 0 is a real, final answer — `||` would wrongly
  // treat it as missing and fall through to the draft/blank value.
  it('treats a real or draft handshake count of 0 as a real value, not as missing', () => {
    expect(resolveEpisodeAnswerKeyDefaults({ handshake_count: 0 }, { handshake_count: 9 }).handshakeCount).toBe(0)
    expect(resolveEpisodeAnswerKeyDefaults({}, { handshake_count: 0 }).handshakeCount).toBe(0)
  })
})

describe('resolveBonusAnswerKeyDefaults', () => {
  it('falls back to blank/empty when neither a real answer nor a draft exists', () => {
    expect(resolveBonusAnswerKeyDefaults({}, null)).toEqual({ text: '', bakerIds: [] })
  })

  it('uses the draft when no real answer is set yet', () => {
    const bq = {}
    const draft = { correct_answer: 'Priya', correct_baker_ids: ['b1', 'b2'] }
    expect(resolveBonusAnswerKeyDefaults(bq, draft)).toEqual({ text: 'Priya', bakerIds: ['b1', 'b2'] })
  })

  it('prefers the real answer over a leftover draft', () => {
    const bq = { correct_answer: 'Real answer', correct_baker_ids: ['real'] }
    const draft = { correct_answer: 'Draft answer', correct_baker_ids: ['draft'] }
    expect(resolveBonusAnswerKeyDefaults(bq, draft)).toEqual({ text: 'Real answer', bakerIds: ['real'] })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run src/lib/draftAnswerKeys.test.js`
Expected: FAIL — `Failed to resolve import "./draftAnswerKeys"` (the module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `web/src/lib/draftAnswerKeys.js`:

```js
// Precedence for pre-filling an answer-key form: a real, already-recorded
// answer (episode is scored, or a bonus question already has a key) always
// wins over a draft — a draft is only ever a placeholder for the not-yet-
// final answer, never a second source of truth once the real one exists.
// `??`, not `||`: a handshake count or baker id of a falsy-but-real value
// (0) must not be treated as missing.
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd web && npx vitest run src/lib/draftAnswerKeys.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/draftAnswerKeys.js web/src/lib/draftAnswerKeys.test.js
git commit -m "Add pure resolver for draft-vs-real answer key defaults"
```

---

### Task 3: Query functions for draft rows and open bonus questions

**Files:**
- Modify: `web/src/lib/queries.js`

**Interfaces:**
- Consumes: Supabase tables from Task 1.
- Produces: `fetchDraftAnswerKey(episodeId) -> object|null`, `fetchOpenBonusQuestions() -> array`, `fetchBonusQuestionDraftAnswerKeys(bonusQuestionIds) -> array`. Tasks 4 and 5 import these by these exact names.

- [ ] **Step 1: Add the three functions**

Append to `web/src/lib/queries.js` (near `fetchUnresolvedBonusQuestions`/`fetchGradedBonusQuestions`, which this mirrors):

```js
export async function fetchDraftAnswerKey(episodeId) {
  const { data, error } = await supabase
    .from('episode_draft_answer_keys')
    .select('*')
    .eq('episode_id', episodeId)
    .maybeSingle()
  if (error) throw error
  return data
}

// Companion to fetchUnresolvedBonusQuestions/fetchGradedBonusQuestions —
// lists bonus questions whose episode hasn't been locked & scored yet, so
// the admin can jot a draft answer while watching instead of waiting.
export async function fetchOpenBonusQuestions() {
  const { data, error } = await supabase
    .from('bonus_questions')
    .select('*, episodes!inner(number, status, title)')
    .eq('episodes.status', 'open')
    .order('created_at')
  if (error) throw error
  return data
}

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

- [ ] **Step 2: Verify the file still builds**

Run: `cd web && npx vite build`
Expected: build succeeds (this file has no unit tests today — same as every other function in `queries.js` — so a successful build/typecheck-by-bundling is the verification step here, consistent with the rest of this file).

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/queries.js
git commit -m "Add queries for draft answer keys and open bonus questions"
```

---

### Task 4: Episode answer key — Save draft vs. Lock & score

**Files:**
- Modify: `web/src/pages/admin/AdminEpisode.jsx:107-139` (`loadEpisodeData`), `:334-489` (`AnswerKeyAndScore`), `:561-718` (default export)
- Modify: `web/src/pages/admin/AdminEpisode.copy.js`

**Interfaces:**
- Consumes: `resolveEpisodeAnswerKeyDefaults` (Task 2), `fetchDraftAnswerKey` (Task 3).
- Produces: `AnswerKeyAndScore` now takes a `draftAnswerKey` prop; `loadEpisodeData`'s result gains a `draftAnswerKey` field.

- [ ] **Step 1: Fetch the draft row in `loadEpisodeData`**

In `web/src/pages/admin/AdminEpisode.jsx`, add the import and extend `loadEpisodeData` (currently lines 1-139):

```js
import { fetchAllBakers, fetchActiveBakers, fetchBonusQuestions, fetchDraftAnswerKey } from '../../lib/queries'
```

```js
async function loadEpisodeData(episodeNumber) {
  const { data: ep, error: episodeError } = await supabase
    .from('episodes')
    .select('*')
    .eq('number', episodeNumber)
    .maybeSingle()
  if (episodeError) throw episodeError
  if (!ep) {
    return {
      episode: null,
      bonusQuestions: [],
      allBakers: [],
      activeBakers: [],
      players: [],
      scores: [],
      draftAnswerKey: null,
    }
  }
  const [
    bqs,
    all,
    active,
    { data: playerRows, error: playersError },
    { data: scoreRows, error: scoresError },
    draftAnswerKey,
  ] = await Promise.all([
    fetchBonusQuestions(ep.id),
    fetchAllBakers(),
    fetchActiveBakers(),
    supabase.from('players').select('*'),
    supabase.from('scores').select('*').eq('episode_id', ep.id),
    fetchDraftAnswerKey(ep.id),
  ])
  if (playersError) throw playersError
  if (scoresError) throw scoresError
  return {
    episode: ep,
    bonusQuestions: bqs,
    allBakers: all,
    activeBakers: active,
    players: playerRows ?? [],
    scores: scoreRows ?? [],
    draftAnswerKey,
  }
}
```

- [ ] **Step 2: Thread `draftAnswerKey` through the page component's state**

In the default-exported `AdminEpisode` component (currently lines 561-718):

```js
const [draftAnswerKey, setDraftAnswerKey] = useState(null)
```

Add `setDraftAnswerKey(result.draftAnswerKey)` next to every other `setXxx(result.xxx)` call — both in the mount `useEffect` (currently ending at line 600) and in `reload()` (currently ending at line 614).

- [ ] **Step 3: Update `AnswerKeyAndScore` to accept the draft and add "Save draft"**

Replace the whole `AnswerKeyAndScore` function (currently lines 334-489) with:

```js
function AnswerKeyAndScore({ episode, allBakers, draftAnswerKey, onChanged }) {
  const defaults = resolveEpisodeAnswerKeyDefaults(episode, draftAnswerKey)
  const [technicalWinner, setTechnicalWinner] = useState(defaults.technicalWinner)
  const [starBaker, setStarBaker] = useState(defaults.starBaker)
  const [eliminated, setEliminated] = useState(defaults.eliminated)
  const [handshakeCount, setHandshakeCount] = useState(defaults.handshakeCount)
  const [error, setError] = useState(null)
  const [summary, setSummary] = useState(null)
  // Shared by both actions (mirrors IntroNoteAndLock's single `saving` flag):
  // they write to different tables but both mutate this component's shared
  // form fields, so letting one fire while the other is in flight risks a
  // stale-value race.
  const [scoring, setScoring] = useState(false)

  async function handleSaveDraft() {
    setScoring(true)
    setError(null)
    setSummary(null)
    const { error: draftError } = await supabase.from('episode_draft_answer_keys').upsert(
      {
        episode_id: episode.id,
        technical_winner_baker_id: technicalWinner || null,
        star_baker_id: starBaker || null,
        eliminated_baker_id: eliminated || null,
        handshake_count: handshakeCount === '' ? null : Number(handshakeCount),
      },
      { onConflict: 'episode_id' },
    )
    setScoring(false)
    if (draftError) {
      setError(draftError.message)
      return
    }
    setSummary(copy.DRAFT_SAVED)
    onChanged()
  }

  async function handleLockAndScore(e) {
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

    // Re-fetch rather than reuse local state, so scoring always computes
    // against exactly what's now in the database. The writes above already
    // succeeded at this point, so a failure here is a genuine (if unlikely)
    // fetch error, not a validation case — surface it instead of letting a
    // missing `data` crash the code below with a TypeError.
    const { data: scoredEpisode, error: scoredEpisodeError } = await supabase
      .from('episodes')
      .select('*')
      .eq('id', episode.id)
      .single()
    const { data: scoredBonusQuestions, error: scoredBonusQuestionsError } = await supabase
      .from('bonus_questions')
      .select('*')
      .eq('episode_id', episode.id)
    if (scoredEpisodeError || scoredBonusQuestionsError) {
      setError((scoredEpisodeError ?? scoredBonusQuestionsError).message)
      setScoring(false)
      return
    }

    const { data: answers, error: answersError } = await supabase
      .from('answers')
      .select('*')
      .eq('episode_id', episode.id)
    const bonusQuestionIds = (scoredBonusQuestions ?? []).map((bq) => bq.id)
    const { data: bonusAnswers, error: bonusAnswersError } = bonusQuestionIds.length
      ? await supabase.from('bonus_answers').select('*').in('bonus_question_id', bonusQuestionIds)
      : { data: [], error: null }
    const { data: existingScores, error: existingScoresError } = await supabase
      .from('scores')
      .select('*')
      .eq('episode_id', episode.id)
    if (answersError || bonusAnswersError || existingScoresError) {
      setError((answersError ?? bonusAnswersError ?? existingScoresError).message)
      setScoring(false)
      return
    }

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

    setSummary(copy.scoreSummary(recomputed, preserved))
    setScoring(false)
    onChanged()
  }

  return (
    <form className="card" onSubmit={handleLockAndScore}>
      <h3>{copy.ANSWER_KEY_TITLE}</h3>
      {episode.technical_enabled !== false && (
        <BakerPicker
          groupName="answer-key-technical"
          label={copy.TECHNICAL_LABEL}
          bakers={allBakers}
          value={technicalWinner}
          onChange={setTechnicalWinner}
        />
      )}
      {episode.star_baker_enabled !== false && (
        <BakerPicker
          groupName="answer-key-star-baker"
          label={copy.STAR_BAKER_LABEL}
          bakers={allBakers}
          value={starBaker}
          onChange={setStarBaker}
        />
      )}
      {episode.eliminated_enabled !== false && (
        <BakerPicker
          groupName="answer-key-eliminated"
          label={copy.ELIMINATED_LABEL}
          bakers={allBakers}
          value={eliminated}
          onChange={setEliminated}
        />
      )}
      {episode.handshake_enabled !== false && (
        <label>
          {copy.HANDSHAKE_COUNT_LABEL}
          <input type="number" min="0" value={handshakeCount} onChange={(e) => setHandshakeCount(e.target.value)} />
        </label>
      )}
      <p className="muted">{copy.SCORING_NOTE}</p>
      <button type="button" onClick={handleSaveDraft} disabled={scoring}>
        {copy.SAVE_DRAFT}
      </button>{' '}
      <button type="submit" disabled={scoring}>
        {scoring ? copy.SCORING : episode.status === 'scored' ? copy.RE_SCORE : copy.ENTER_ANSWER_KEY_AND_SCORE}
      </button>
      {summary && <p>{summary}</p>}
      {error && <p className="error">{error}</p>}
    </form>
  )
}
```

Add the import at the top of the file:

```js
import { resolveEpisodeAnswerKeyDefaults } from '../../lib/draftAnswerKeys'
```

- [ ] **Step 4: Pass the new prop from the page component**

In the default export's render (currently lines 701-706), add `draftAnswerKey`:

```js
<AnswerKeyAndScore
  key={episode.id}
  episode={episode}
  allBakers={allBakers}
  draftAnswerKey={draftAnswerKey}
  onChanged={reload}
/>
```

- [ ] **Step 5: Update copy**

In `web/src/pages/admin/AdminEpisode.copy.js`, add near the existing `AnswerKeyAndScore` block:

```js
export const SAVE_DRAFT = 'Save draft'
export const DRAFT_SAVED = 'Draft saved.'
```

Replace `SCORING_NOTE`'s value with:

```js
export const SCORING_NOTE =
  'Save draft jots down your answers without affecting anything else — the real answer key and player scores ' +
  "aren't touched until you click the scoring button, which the database only accepts once the episode is " +
  'ready (it will reject a partial answer key while the episode is still open). Bonus questions get the same ' +
  'Save draft option on the Bonus questions page while their episode is still airing; grading them happens ' +
  'separately, once their answer is known.'
```

- [ ] **Step 6: Run the existing test suite**

Run: `cd web && npm test`
Expected: PASS (this task touches no pure-function logic covered by existing tests, so this just confirms nothing else broke).

- [ ] **Step 7: Manual verification via the dev server**

Start the dev server (`npm run dev` in `web/`), open an `open`-status episode's admin page, click **Save draft** with some fields filled in, confirm: no error, the episode's status badge stays `open`, and reloading the page still shows the same values pre-filled (proves the round-trip through `episode_draft_answer_keys`). This requires Task 1's SQL to already be applied in Supabase.

- [ ] **Step 8: Commit**

```bash
git add web/src/pages/admin/AdminEpisode.jsx web/src/pages/admin/AdminEpisode.copy.js
git commit -m "Add Save draft action to the episode answer key form"
```

---

### Task 5: Bonus question drafts — "Airing now" section

**Files:**
- Modify: `web/src/pages/admin/AdminBonusQuestions.jsx` (whole file; current version is 259 lines)
- Modify: `web/src/pages/admin/AdminBonusQuestions.copy.js`

**Interfaces:**
- Consumes: `resolveBonusAnswerKeyDefaults` (Task 2), `fetchOpenBonusQuestions`/`fetchBonusQuestionDraftAnswerKeys` (Task 3).
- Produces: a new `BonusAnswerKeyFields` component (shared by `BonusQuestionRow` and the new `DraftBonusQuestionRow`) and a new "Airing now" page section. No exported interface other components rely on.

- [ ] **Step 1: Extract the shared answer-key input switch**

In `web/src/pages/admin/AdminBonusQuestions.jsx`, add this new component above `BonusQuestionRow` (currently starting at line 30):

```js
function BonusAnswerKeyFields({ bq, allBakers, groupPrefix, text, setText, bakerIds, setBakerIds }) {
  if (bq.type === 'baker_multi_pick') {
    return (
      <BakerPicker
        groupName={`${groupPrefix}-${bq.id}`}
        label={copy.correctAnswerLabel(bq.prompt)}
        bakers={allBakers}
        multiple
        maxPicks={bq.options?.pick_count ?? allBakers.length}
        value={bakerIds}
        onChange={setBakerIds}
      />
    )
  }
  if (bq.type === 'judge_host_pick') {
    return (
      <JudgeHostPicker
        groupName={`${groupPrefix}-${bq.id}`}
        label={copy.correctAnswerLabel(bq.prompt)}
        people={JUDGES_AND_HOSTS}
        value={idForShortName(text)}
        onChange={(id) => setText(JUDGES_AND_HOSTS.find((p) => p.id === id)?.shortName ?? '')}
      />
    )
  }
  return (
    <label>
      {copy.correctAnswerLabel(bq.prompt)}
      <input value={text} onChange={(e) => setText(e.target.value)} />
    </label>
  )
}
```

- [ ] **Step 2: Use it from `BonusQuestionRow`, seeded from the draft**

In `BonusQuestionRow` (currently lines 30-169):

- Change the signature to accept `draftAnswerKey`: `function BonusQuestionRow({ bq, allBakers, draftAnswerKey, onResolved, scoringId, setScoringId })`
- Replace the two `useState` seed lines:

```js
const defaults = resolveBonusAnswerKeyDefaults(bq, draftAnswerKey)
const [text, setText] = useState(defaults.text)
const [bakerIds, setBakerIds] = useState(defaults.bakerIds)
```

- Replace the inline three-way picker switch (the `{isMultiPick ? (...) : bq.type === 'judge_host_pick' ? (...) : (...)}` block) with:

```jsx
<BonusAnswerKeyFields
  bq={bq}
  allBakers={allBakers}
  groupPrefix="resolve"
  text={text}
  setText={setText}
  bakerIds={bakerIds}
  setBakerIds={setBakerIds}
/>
```

`isMultiPick` stays defined and used elsewhere in the component (the `handleScore` body) — only the JSX switch moves out.

- [ ] **Step 3: Add `DraftBonusQuestionRow`**

Add below `BonusQuestionRow`:

```js
function DraftBonusQuestionRow({ bq, allBakers, draftAnswerKey, onSaved }) {
  const defaults = resolveBonusAnswerKeyDefaults(bq, draftAnswerKey)
  const [text, setText] = useState(defaults.text)
  const [bakerIds, setBakerIds] = useState(defaults.bakerIds)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const isMultiPick = bq.type === 'baker_multi_pick'

  async function handleSaveDraft() {
    setSaving(true)
    setError(null)
    const { error: upsertError } = await supabase.from('bonus_question_draft_answer_keys').upsert(
      {
        bonus_question_id: bq.id,
        correct_answer: isMultiPick ? null : (text || null),
        correct_baker_ids: isMultiPick ? bakerIds : null,
      },
      { onConflict: 'bonus_question_id' },
    )
    setSaving(false)
    if (upsertError) {
      setError(upsertError.message)
      return
    }
    onSaved()
  }

  return (
    <div className="card">
      <p>{copy.questionLine(bq)}</p>
      <BonusAnswerKeyFields
        bq={bq}
        allBakers={allBakers}
        groupPrefix="draft"
        text={text}
        setText={setText}
        bakerIds={bakerIds}
        setBakerIds={setBakerIds}
      />
      <button onClick={handleSaveDraft} disabled={saving}>
        {saving ? copy.SAVING_DRAFT : copy.SAVE_DRAFT}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Wire `loadData` to fetch open questions and drafts**

Replace `loadData` (currently lines 21-28) with:

```js
async function loadData() {
  const [bonusQuestions, gradedBonusQuestions, openBonusQuestions, allBakers] = await Promise.all([
    fetchUnresolvedBonusQuestions(),
    fetchGradedBonusQuestions(),
    fetchOpenBonusQuestions(),
    fetchAllBakers(),
  ])
  const draftableIds = [...bonusQuestions, ...openBonusQuestions].map((bq) => bq.id)
  const draftRows = await fetchBonusQuestionDraftAnswerKeys(draftableIds)
  const draftAnswerKeysByQuestionId = Object.fromEntries(draftRows.map((d) => [d.bonus_question_id, d]))
  return { bonusQuestions, gradedBonusQuestions, openBonusQuestions, allBakers, draftAnswerKeysByQuestionId }
}
```

Update the import line at the top of the file:

```js
import {
  fetchUnresolvedBonusQuestions,
  fetchGradedBonusQuestions,
  fetchOpenBonusQuestions,
  fetchBonusQuestionDraftAnswerKeys,
  fetchAllBakers,
} from '../../lib/queries'
import { resolveBonusAnswerKeyDefaults } from '../../lib/draftAnswerKeys'
```

- [ ] **Step 5: Thread the new state through the page component**

In the default-exported `AdminBonusQuestions` component:

- Add `const [openBonusQuestions, setOpenBonusQuestions] = useState([])` and `const [draftAnswerKeysByQuestionId, setDraftAnswerKeysByQuestionId] = useState({})`.
- In the mount effect's `.then((result) => {...})` and in `reload()`, add:

```js
setOpenBonusQuestions(result.openBonusQuestions)
setDraftAnswerKeysByQuestionId(result.draftAnswerKeysByQuestionId)
```

- Pass `draftAnswerKey={draftAnswerKeysByQuestionId[bq.id]}` to every `<BonusQuestionRow ... />` instance (both the "Needs grading" and "Already graded" maps).
- Add a new section, after `<h3>{copy.NEEDS_GRADING_HEADING}</h3>`'s block and before `<h3>{copy.ALREADY_GRADED_HEADING}</h3>`:

```jsx
<h3>{copy.AIRING_NOW_HEADING}</h3>
<p>{copy.AIRING_NOW_HELP}</p>
{openBonusQuestions.length === 0 ? (
  <p>{copy.NONE_AIRING}</p>
) : (
  openBonusQuestions.map((bq) => (
    <DraftBonusQuestionRow
      key={bq.id}
      bq={bq}
      allBakers={allBakers}
      draftAnswerKey={draftAnswerKeysByQuestionId[bq.id]}
      onSaved={reload}
    />
  ))
)}
```

- [ ] **Step 6: Update copy**

In `web/src/pages/admin/AdminBonusQuestions.copy.js`, add:

```js
export const AIRING_NOW_HEADING = 'Airing now'
export const AIRING_NOW_HELP =
  "Jot down a likely answer while the episode is still airing — this doesn't grade anything until the episode " +
  'is locked and scored and the question moves down to "Needs grading".'
export const NONE_AIRING = 'No episodes are currently airing.'
export const SAVE_DRAFT = 'Save draft'
export const SAVING_DRAFT = 'Saving…'
```

- [ ] **Step 7: Run the existing test suite**

Run: `cd web && npm test`
Expected: PASS.

- [ ] **Step 8: Manual verification via the dev server**

With Task 1's SQL applied: open `/admin/bonus-questions` while an episode is `open` with at least one bonus question on it. Confirm it appears under "Airing now", save a draft, confirm no error and the value round-trips on reload. Then lock & score that episode (Task 4's flow) and confirm the same question now appears under "Needs grading" pre-filled with the draft value.

- [ ] **Step 9: Commit**

```bash
git add web/src/pages/admin/AdminBonusQuestions.jsx web/src/pages/admin/AdminBonusQuestions.copy.js
git commit -m "Add Airing now section for draft bonus-question answers"
```

---

### Task 6: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full Vitest suite**

Run: `cd web && npm test`
Expected: PASS — includes `scoring.test.js` (unchanged) and the new `draftAnswerKeys.test.js` (Task 2).

- [ ] **Step 2: Lint**

Run: `cd web && npm run lint`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `cd web && npm run build`
Expected: succeeds.

- [ ] **Step 4: End-to-end manual pass on the dev server**

With Task 1's SQL applied in Supabase, walk through the full flow once end to end:
1. On an `open` episode, save a draft answer key (core 4 questions) and a draft on one bonus question — confirm the episode stays `open` and no `scores` rows are created/changed.
2. As a non-admin player (or via the Supabase table editor's RLS-aware view, or by temporarily checking the network response for an authenticated non-admin session), confirm `episode_draft_answer_keys`/`bonus_question_draft_answer_keys` are not readable.
3. Click the lock/score button — confirm the episode flips to `scored`, player scores recompute, and the previously-saved draft values are what got scored (since the form was pre-filled from the draft).
4. Go to `/admin/bonus-questions`, confirm the bonus question is now under "Needs grading" pre-filled from its draft, click Score, confirm it moves to "Already graded" and scores recompute.

- [ ] **Step 5: Report back**

No commit for this task — it's the final go/no-go check before the admin applies Task 1's SQL to the real Supabase project and merges.
