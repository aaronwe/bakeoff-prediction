# Deferred Bonus-Question Scoring & Multi-Pick Predictions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any bonus question — trivia or a long-range "predict the final three" style multi-select — be graded whenever the admin actually knows the answer, independent of when its own episode was scored, and add a multi-select `baker_multi_pick` answer type for that prediction style.

**Architecture:** Two new nullable array columns (`bonus_questions.correct_baker_ids`, `bonus_answers.answer_baker_ids`) carry the multi-pick answer key and player picks. `scoreBonusAnswer` branches on question type to score either format. Bonus-question resolution moves out of the per-episode `AnswerKeyAndScore` form and into one new admin page that lists every ungraded bonus question across all scored episodes and grades it in place, reusing the same score-upsert pattern `AnswerKeyAndScore` already uses.

**Tech Stack:** React 19 (function components, no state library), Supabase (Postgres + PostgREST + RLS), Vitest for pure-logic unit tests, plain CSS (no framework).

**Spec:** [docs/superpowers/specs/2026-09-21-deferred-bonus-question-scoring-design.md](../specs/2026-09-21-deferred-bonus-question-scoring-design.md)

## Global Constraints

- Schema changes are additive `alter table` statements appended to `supabase/schema.sql` (never edit the original `create table` blocks) — this file is run by hand in the Supabase SQL editor, there is no migration runner in this repo.
- Every page component's display strings live in a sibling `<Name>.copy.js` file, imported as `import * as copy from './<Name>.copy'` — never inline a user-facing string.
- Supabase writes that upsert into `scores` always pass `{ onConflict: 'episode_id,player_id' }` and must skip (count as "preserved") any existing row with `manually_overridden: true`.
- `baker_pick` bonus questions store the baker's *name* as a plain string in `answer_text`/`correct_answer` (not an id) — do not introduce a `BakerPicker` or id-based lookup for that type; only the new `baker_multi_pick` type uses real baker ids.
- No new "is this deferred" flag — a bonus question is simply unresolved while both `correct_answer` and `correct_baker_ids` are null, for however long that takes.
- This repo has no component-testing setup (no `@testing-library/react`, no jsdom in `web/package.json`) — automated tests only cover pure-logic modules (`web/src/lib/*.test.js`); UI changes are verified manually via the dev server (`npm run dev` from `web/`), per this project's existing pattern.

---

### Task 1: Schema migration — multi-pick columns and the type check

**Files:**
- Modify: `supabase/schema.sql` (append after the existing `bonus_questions_correct_answer_guard` trigger block, i.e. after line 97)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `bonus_questions.correct_baker_ids` (`uuid[]`, nullable), `bonus_answers.answer_baker_ids` (`uuid[]`, nullable), and an updated `bonus_questions_type_check` constraint allowing `'baker_multi_pick'`. All later tasks read/write these columns and this type value.

- [ ] **Step 1: Append the new columns and updated constraints to `supabase/schema.sql`**

Insert this block immediately after the existing `create trigger bonus_questions_correct_answer_guard ...` statement (currently ending at line 97) and before `create table answers (...)`:

```sql
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
```

- [ ] **Step 2: Apply it to the Supabase project and verify**

Run the appended block in the Supabase SQL Editor (Project → SQL Editor → New query) against this project's database, then verify with:

```sql
select column_name, data_type from information_schema.columns
where table_name = 'bonus_questions' and column_name = 'correct_baker_ids';

select column_name, data_type from information_schema.columns
where table_name = 'bonus_answers' and column_name = 'answer_baker_ids';

select conname, pg_get_constraintdef(oid) from pg_constraint
where conname = 'bonus_questions_type_check';
```

Expected: the first two queries each return one row with `data_type = 'ARRAY'`; the third shows `baker_multi_pick` in the allowed list.

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "Add correct_baker_ids/answer_baker_ids columns for multi-pick bonus questions"
```

---

### Task 2: `scoreBonusAnswer` — multi-pick scoring

**Files:**
- Modify: `web/src/lib/scoring.js:9-15` (the `scoreBonusAnswer` function), `web/src/lib/scoring.js:33-36` (the bonus-question loop inside `computeScoreForPlayer`)
- Test: `web/src/lib/scoring.test.js:37-68` (`scoreBonusAnswer` describe block) and `web/src/lib/scoring.test.js:128-147` (the `computeScoreForPlayer` bonus tests)

**Interfaces:**
- Consumes: nothing new.
- Produces: `scoreBonusAnswer(bonusQuestion, bonusAnswer)` — signature changes from `(bonusQuestion, answerText)` to taking the **whole bonus-answer row** (or `undefined`/`null` if the player never answered). Every other task that calls this function (Task 7) must pass a row object, never a bare string.

- [ ] **Step 1: Update `scoreBonusAnswer`'s existing tests to the new signature, and add `baker_multi_pick` + `computeScoreForPlayer` coverage**

Replace `web/src/lib/scoring.test.js` lines 37-68 (the whole `describe('scoreBonusAnswer', ...)` block) with:

```js
describe('scoreBonusAnswer', () => {
  it('awards the question points for a matching answer, case- and whitespace-insensitive', () => {
    const bq = { type: 'free_text', correct_answer: 'Priya', points: 3 }
    expect(scoreBonusAnswer(bq, { answer_text: 'priya' })).toBe(3)
    expect(scoreBonusAnswer(bq, { answer_text: '  Priya  ' })).toBe(3)
  })

  it('awards 0 for a non-matching answer', () => {
    const bq = { type: 'free_text', correct_answer: 'Priya', points: 3 }
    expect(scoreBonusAnswer(bq, { answer_text: 'Dev' })).toBe(0)
  })

  it('awards 0 when the answer or correct_answer is missing', () => {
    const bq = { type: 'free_text', correct_answer: 'Priya', points: 3 }
    expect(scoreBonusAnswer(bq, null)).toBe(0)
    expect(scoreBonusAnswer({ type: 'free_text', correct_answer: null, points: 3 }, { answer_text: 'Priya' })).toBe(0)
  })

  // Additional coverage: an answer that is present but blank/whitespace-only
  // (e.g. a player submitted an empty string), and a correct_answer that is
  // set to an empty string rather than null/undefined (admin hasn't graded yet).
  it('awards 0 for an empty-string or whitespace-only answer', () => {
    const bq = { type: 'free_text', correct_answer: 'Priya', points: 3 }
    expect(scoreBonusAnswer(bq, { answer_text: '' })).toBe(0)
    expect(scoreBonusAnswer(bq, { answer_text: '   ' })).toBe(0)
  })

  it('awards 0 when correct_answer is an empty string', () => {
    const bq = { type: 'free_text', correct_answer: '', points: 3 }
    expect(scoreBonusAnswer(bq, { answer_text: 'Priya' })).toBe(0)
  })

  describe('baker_multi_pick', () => {
    const bq = { type: 'baker_multi_pick', correct_baker_ids: ['a', 'b', 'c'], points: 1 }

    it('awards points per correctly picked baker', () => {
      expect(scoreBonusAnswer(bq, { answer_baker_ids: ['a', 'b', 'x'] })).toBe(2)
    })

    it('awards full points for an exact match', () => {
      expect(scoreBonusAnswer(bq, { answer_baker_ids: ['a', 'b', 'c'] })).toBe(3)
    })

    it('awards 0 for no overlap', () => {
      expect(scoreBonusAnswer(bq, { answer_baker_ids: ['x', 'y'] })).toBe(0)
    })

    it('scales by points-per-baker, not a flat total', () => {
      const twoPointBq = { type: 'baker_multi_pick', correct_baker_ids: ['a', 'b', 'c'], points: 2 }
      expect(scoreBonusAnswer(twoPointBq, { answer_baker_ids: ['a', 'b'] })).toBe(4)
    })

    it('awards 0 when the player picked nothing', () => {
      expect(scoreBonusAnswer(bq, { answer_baker_ids: [] })).toBe(0)
      expect(scoreBonusAnswer(bq, null)).toBe(0)
    })

    it('awards 0 when the correct outcome is not set yet', () => {
      const ungraded = { type: 'baker_multi_pick', correct_baker_ids: null, points: 1 }
      expect(scoreBonusAnswer(ungraded, { answer_baker_ids: ['a', 'b'] })).toBe(0)
    })
  })
})
```

Then, in `computeScoreForPlayer`'s existing describe block, replace the `it('includes bonus question points keyed by bonus question id', ...)` test (lines 128-147) with:

```js
  it('includes bonus question points keyed by bonus question id', () => {
    const bonusQuestions = [
      { id: 'bq-1', type: 'free_text', correct_answer: 'Priya', points: 2 },
      { id: 'bq-2', type: 'free_text', correct_answer: 'Yes', points: 1 },
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

  it('includes a baker_multi_pick bonus question, scored by baker overlap', () => {
    const bonusQuestions = [
      { id: 'bq-3', type: 'baker_multi_pick', correct_baker_ids: ['x', 'y', 'z'], points: 1 },
    ]
    const bonusAnswers = [{ bonus_question_id: 'bq-3', answer_baker_ids: ['x', 'y', 'w'] }]
    const answer = {
      technical_pick_id: 'baker-1',
      star_baker_pick_id: 'baker-2',
      eliminated_pick_id: 'baker-3',
      handshake_guess: 5,
    }
    const result = computeScoreForPlayer({ episode, answer, bonusQuestions, bonusAnswers })
    expect(result.breakdown['bonus_bq-3']).toBe(2)
    expect(result.total).toBe(6 + 2)
  })
```

Also update the two remaining tests in that describe block that still pass a bonus question without a `type` field — `'scores a bonus question with no submitted answer as 0'` and `'scores a bonus question with no correct_answer set yet as 0'` (lines 152-181) — by adding `type: 'free_text'` to each `bonusQuestions` object literal in those two tests, so they exercise the same branch as production data.

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
cd web && npm test -- scoring.test.js
```

Expected: FAIL — `scoreBonusAnswer` currently reads its second argument as a raw string (`answerText`), so passing `{ answer_text: 'priya' }` fails the `!answerText` / `.trim()` calls, and the `baker_multi_pick` tests fail because that branch doesn't exist yet.

- [ ] **Step 3: Update `scoring.js`**

Replace `scoreBonusAnswer` (lines 9-15) with:

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

Then, inside `computeScoreForPlayer`, replace the bonus loop (lines 33-36):

```js
  for (const bq of bonusQuestions) {
    const ba = bonusAnswers.find((a) => a.bonus_question_id === bq.id)
    breakdown[`bonus_${bq.id}`] = scoreBonusAnswer(bq, ba?.answer_text)
  }
```

with:

```js
  for (const bq of bonusQuestions) {
    const ba = bonusAnswers.find((a) => a.bonus_question_id === bq.id)
    breakdown[`bonus_${bq.id}`] = scoreBonusAnswer(bq, ba)
  }
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
cd web && npm test -- scoring.test.js
```

Expected: PASS, all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/scoring.js web/src/lib/scoring.test.js
git commit -m "Score baker_multi_pick bonus questions by baker overlap"
```

---

### Task 3: `BakerPicker` multi-select mode

**Files:**
- Modify: `web/src/components/BakerPicker.jsx` (the exported `BakerPicker` function, currently lines 37-69)
- Modify: `web/src/index.css:275` (the visually-hidden input selector)

**Interfaces:**
- Consumes: nothing new.
- Produces: `<BakerPicker multiple maxPicks={n} value={string[]} onChange={(ids: string[]) => void} ... />` as an additional mode alongside the existing single-select `<BakerPicker value={string} onChange={(id: string) => void} ... />`. Tasks 4 and 7 render it with `multiple`.

- [ ] **Step 1: Add the multi-select branch to `BakerPicker`**

Replace the exported `BakerPicker` function (`web/src/components/BakerPicker.jsx` lines 37-69) with:

```jsx
export default function BakerPicker({ groupName, label, bakers, value, onChange, multiple = false, maxPicks }) {
  if (multiple) {
    const selected = value ?? []
    function toggle(bakerId) {
      if (selected.includes(bakerId)) {
        onChange(selected.filter((id) => id !== bakerId))
        return
      }
      if (selected.length >= maxPicks) return
      onChange([...selected, bakerId])
    }
    return (
      <fieldset className="baker-picker">
        <legend>{label}</legend>
        <div className="baker-picker-options">
          {bakers.map((b) => {
            const checked = selected.includes(b.id)
            const disabled = !checked && selected.length >= maxPicks
            return (
              <label key={b.id} className={`baker-option${checked ? ' selected' : ''}`}>
                <input
                  type="checkbox"
                  name={groupName}
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(b.id)}
                />
                <BakerThumb baker={b} />
                <span className="baker-name">{b.name}</span>
              </label>
            )
          })}
        </div>
      </fieldset>
    )
  }

  return (
    <fieldset className="baker-picker">
      <legend>{label}</legend>
      <div className="baker-picker-options">
        <label className={`baker-option baker-option-skip${value === '' ? ' selected' : ''}`}>
          <input
            type="radio"
            name={groupName}
            value=""
            checked={value === ''}
            onChange={() => onChange('')}
          />
          <span className="baker-thumb baker-thumb-fallback" aria-hidden="true">—</span>
          <span className="baker-name">{copy.NO_PICK}</span>
        </label>
        {bakers.map((b) => (
          <label key={b.id} className={`baker-option${value === b.id ? ' selected' : ''}`}>
            <input
              type="radio"
              name={groupName}
              value={b.id}
              checked={value === b.id}
              onChange={() => onChange(b.id)}
            />
            <BakerThumb baker={b} />
            <span className="baker-name">{b.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
```

- [ ] **Step 2: Extend the visually-hidden input CSS rule to cover checkboxes**

In `web/src/index.css`, replace:

```css
.baker-option input[type="radio"] {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  margin: 0;
}
```

with:

```css
.baker-option input[type="radio"],
.baker-option input[type="checkbox"] {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  margin: 0;
}
```

- [ ] **Step 3: Manually verify in the dev server**

```bash
cd web && npm run dev
```

This component isn't exercised by an existing standalone caller yet (Task 4 adds one) — it's enough that `npm run dev` starts cleanly with no console errors and the existing single-select pickers (technical/star/eliminated on the home page weekly form) still render and behave exactly as before. Full multi-select verification happens in Task 4, once there's a `baker_multi_pick` question to render it against.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/BakerPicker.jsx web/src/index.css
git commit -m "Add multi-select mode to BakerPicker"
```

---

### Task 4: `WeeklyForm` — answering a `baker_multi_pick` question

**Files:**
- Modify: `web/src/components/WeeklyForm.jsx`

**Interfaces:**
- Consumes: `BakerPicker`'s `multiple`/`maxPicks` mode (Task 3).
- Produces: `bonus_answers` rows with `answer_baker_ids` populated for `baker_multi_pick` questions — Task 8 (`EpisodeReveal`) reads this column.

- [ ] **Step 1: Track multi-pick answers in state**

In `web/src/components/WeeklyForm.jsx`, add a new state variable next to `bonusAnswerText` (line 28):

```js
const [bonusAnswerBakerIds, setBonusAnswerBakerIds] = useState({})
```

- [ ] **Step 2: Populate it when loading existing answers**

Replace the bonus-answer population block inside the `load` effect (lines 53-55):

```js
        const bonusMap = {}
        for (const ba of existingBonus) bonusMap[ba.bonus_question_id] = ba.answer_text
        setBonusAnswerText(bonusMap)
```

with:

```js
        const bonusTextMap = {}
        const bonusBakerIdsMap = {}
        for (const ba of existingBonus) {
          bonusTextMap[ba.bonus_question_id] = ba.answer_text
          bonusBakerIdsMap[ba.bonus_question_id] = ba.answer_baker_ids ?? []
        }
        setBonusAnswerText(bonusTextMap)
        setBonusAnswerBakerIds(bonusBakerIdsMap)
```

- [ ] **Step 3: Write `answer_baker_ids` on submit**

Replace the bonus-answer upsert loop inside `handleSubmit` (lines 95-106):

```js
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
```

with:

```js
    for (const bq of bonusQuestions) {
      const isMultiPick = bq.type === 'baker_multi_pick'
      const text = bonusAnswerText[bq.id] ?? ''
      const ids = bonusAnswerBakerIds[bq.id] ?? []
      const { error: bonusError } = await supabase.from('bonus_answers').upsert(
        {
          bonus_question_id: bq.id,
          player_id: player.id,
          answer_text: isMultiPick ? null : text || null,
          answer_baker_ids: isMultiPick && ids.length ? ids : null,
        },
        { onConflict: 'bonus_question_id,player_id' },
      )
      if (bonusError) {
        setError(bonusError.message)
        setSaving(false)
        return
      }
    }
```

- [ ] **Step 4: Render a multi-select `BakerPicker` for `baker_multi_pick` questions**

Replace the bonus-question rendering block (lines 162-186):

```jsx
      {bonusQuestions.map((bq) => {
        const options = bonusOptionsFor(bq, allBakers, activeBakers)
        return (
          <label key={bq.id}>
            {bq.prompt} {copy.bonusPoints(bq.points)}
            {options ? (
              <select
                value={bonusAnswerText[bq.id] ?? ''}
                onChange={(e) => setBonusAnswerText((prev) => ({ ...prev, [bq.id]: e.target.value }))}
              >
                <option value="">{copy.SELECT_AN_OPTION}</option>
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
```

with:

```jsx
      {bonusQuestions.map((bq) => {
        if (bq.type === 'baker_multi_pick') {
          const pool = bq.include_eliminated ? allBakers : activeBakers
          return (
            <BakerPicker
              key={bq.id}
              groupName={`bonus-${bq.id}`}
              label={`${bq.prompt} ${copy.bonusPoints(bq.points)}`}
              bakers={pool}
              multiple
              maxPicks={bq.options?.pick_count ?? pool.length}
              value={bonusAnswerBakerIds[bq.id] ?? []}
              onChange={(ids) => setBonusAnswerBakerIds((prev) => ({ ...prev, [bq.id]: ids }))}
            />
          )
        }
        const options = bonusOptionsFor(bq, allBakers, activeBakers)
        return (
          <label key={bq.id}>
            {bq.prompt} {copy.bonusPoints(bq.points)}
            {options ? (
              <select
                value={bonusAnswerText[bq.id] ?? ''}
                onChange={(e) => setBonusAnswerText((prev) => ({ ...prev, [bq.id]: e.target.value }))}
              >
                <option value="">{copy.SELECT_AN_OPTION}</option>
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
```

- [ ] **Step 5: Manually verify in the dev server**

```bash
cd web && npm run dev
```

In the Supabase SQL editor, temporarily insert a test question against any `open` episode:

```sql
insert into bonus_questions (episode_id, prompt, type, options, points)
values ('<an-open-episode-id>', 'Who makes the final three?', 'baker_multi_pick', '{"pick_count": 3}'::jsonb, 1);
```

Load that episode's weekly form as a player, confirm: up to 3 bakers can be checked, a 4th checkbox is disabled once 3 are selected, unchecking one re-enables picking, and submitting then reloading the page preserves the selection. Delete the test row afterward (`delete from bonus_questions where prompt = 'Who makes the final three?'`).

- [ ] **Step 6: Commit**

```bash
git add web/src/components/WeeklyForm.jsx
git commit -m "Let players answer baker_multi_pick bonus questions"
```

---

### Task 5: `fetchUnresolvedBonusQuestions` query helper

**Files:**
- Modify: `web/src/lib/queries.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `fetchUnresolvedBonusQuestions(): Promise<Array<BonusQuestion & { episodes: { number: number, status: string } }>>` — every bonus question belonging to a `'scored'` episode with no answer key set yet. Task 7 calls this directly.

- [ ] **Step 1: Add the helper**

Append to `web/src/lib/queries.js`:

```js
export async function fetchUnresolvedBonusQuestions() {
  const { data, error } = await supabase
    .from('bonus_questions')
    .select('*, episodes!inner(number, status)')
    .eq('episodes.status', 'scored')
    .is('correct_answer', null)
    .is('correct_baker_ids', null)
    .order('created_at')
  if (error) throw error
  return data
}
```

- [ ] **Step 2: Manually verify against the real database**

With the dev server running (`cd web && npm run dev`) and signed in as an admin, open the browser console on any admin page and run:

```js
const { fetchUnresolvedBonusQuestions } = await import('/src/lib/queries.js')
await fetchUnresolvedBonusQuestions()
```

Expected: resolves to an array (empty is fine) with no thrown error; if any bonus questions exist on already-scored episodes with a null `correct_answer`, they appear here with a nested `episodes: { number, status: 'scored' }`.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/queries.js
git commit -m "Add fetchUnresolvedBonusQuestions query helper"
```

---

### Task 6: `AdminEpisode` — add the `baker_multi_pick` question type, remove inline bonus grading

**Files:**
- Modify: `web/src/pages/admin/AdminEpisode.jsx`
- Modify: `web/src/pages/admin/AdminEpisode.copy.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `bonus_questions` rows of type `'baker_multi_pick'` with `options: { pick_count: n }`, created via the admin UI. `AnswerKeyAndScore` no longer accepts a `bonusQuestions` prop.

- [ ] **Step 1: Add `baker_multi_pick` to `NewBonusQuestionForm`**

In `web/src/pages/admin/AdminEpisode.jsx`, add a `pickCount` state next to the other `NewBonusQuestionForm` state (near line 20):

```js
  const [pickCount, setPickCount] = useState('3')
```

Replace the insert call inside `handleSubmit` (lines 26-33):

```js
    const { error: insertError } = await supabase.from('bonus_questions').insert({
      episode_id: episodeId,
      prompt,
      type,
      options: type === 'multiple_choice' ? options.split(',').map((s) => s.trim()).filter(Boolean) : null,
      include_eliminated: type === 'baker_pick' ? includeEliminated : false,
      points: Number(points),
    })
```

with:

```js
    const { error: insertError } = await supabase.from('bonus_questions').insert({
      episode_id: episodeId,
      prompt,
      type,
      options:
        type === 'multiple_choice' ? options.split(',').map((s) => s.trim()).filter(Boolean)
        : type === 'baker_multi_pick' ? { pick_count: Number(pickCount) }
        : null,
      include_eliminated: type === 'baker_pick' || type === 'baker_multi_pick' ? includeEliminated : false,
      points: Number(points),
    })
```

Add `setPickCount('3')` to the post-success reset block (alongside the existing `setPrompt('')`, `setOptions('')`, `setPoints('1')` around line 38-40).

Add the new `<option>` to the type `<select>` (line 53-57):

```jsx
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="baker_pick">{copy.TYPE_BAKER_PICK}</option>
          <option value="baker_multi_pick">{copy.TYPE_BAKER_MULTI_PICK}</option>
          <option value="multiple_choice">{copy.TYPE_MULTIPLE_CHOICE}</option>
          <option value="free_text">{copy.TYPE_FREE_TEXT}</option>
        </select>
```

Replace the `include_eliminated` checkbox condition (line 59) from `{type === 'baker_pick' && (` to `{(type === 'baker_pick' || type === 'baker_multi_pick') && (`, and add a pick-count input right after that checkbox block (still before the `multiple_choice` options block):

```jsx
      {type === 'baker_multi_pick' && (
        <label>
          {copy.PICK_COUNT_LABEL}
          <input type="number" min="1" value={pickCount} onChange={(e) => setPickCount(e.target.value)} />
        </label>
      )}
```

- [ ] **Step 2: Remove inline bonus-question grading from `AnswerKeyAndScore`**

In `web/src/pages/admin/AdminEpisode.jsx`, remove the `bonusQuestions` parameter from `AnswerKeyAndScore`'s function signature (line 217):

```js
function AnswerKeyAndScore({ episode, bonusQuestions, allBakers, onChanged }) {
```

becomes:

```js
function AnswerKeyAndScore({ episode, allBakers, onChanged }) {
```

Remove the `bonusCorrect` state (lines 222-224):

```js
  const [bonusCorrect, setBonusCorrect] = useState(
    Object.fromEntries(bonusQuestions.map((bq) => [bq.id, bq.correct_answer ?? ''])),
  )
```

Remove the bonus-question write loop inside `handleSubmit` (lines 255-268):

```js
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
```

The rest of `handleSubmit` already re-fetches `scoredBonusQuestions` fresh from the database (line 280-283) rather than relying on the removed local state, so no further changes are needed there.

Remove the bonus-question correct-answer inputs from the rendered form (lines 374-382):

```jsx
      {bonusQuestions.map((bq) => (
        <label key={bq.id}>
          {copy.correctAnswerLabel(bq.prompt)}
          <input
            value={bonusCorrect[bq.id] ?? ''}
            onChange={(e) => setBonusCorrect((prev) => ({ ...prev, [bq.id]: e.target.value }))}
          />
        </label>
      ))}
```

Update the call site in `AdminEpisode`'s main return (around line 575-581) to drop the `bonusQuestions` prop:

```jsx
        <AnswerKeyAndScore
          key={episode.id}
          episode={episode}
          allBakers={allBakers}
          onChanged={reload}
        />
```

- [ ] **Step 3: Update copy**

In `web/src/pages/admin/AdminEpisode.copy.js`, add near the other `NewBonusQuestionForm` exports:

```js
export const TYPE_BAKER_MULTI_PICK = 'Pick multiple bakers'
export const PICK_COUNT_LABEL = 'How many bakers can be picked'
```

Remove `correctAnswerLabel` (no longer used in this file — it moves to `AdminBonusQuestions.copy.js` in Task 7).

Replace `SCORING_NOTE`:

```js
export const SCORING_NOTE =
  "Nothing here is saved until you submit — the database won't accept a partial answer key while the " +
  'episode is still open, so entering the key and scoring happen together in one step.'
```

with:

```js
export const SCORING_NOTE =
  "Nothing here is saved until you submit — the database won't accept a partial answer key while the " +
  'episode is still open, so entering the key and scoring happen together in one step. Bonus questions ' +
  'are graded separately, on the Bonus questions page, whenever their answer is known.'
```

- [ ] **Step 4: Manually verify in the dev server**

```bash
cd web && npm run dev
```

As an admin, open any episode: confirm the bonus-question form now offers "Pick multiple bakers" with a pick-count field and (for both baker types) an "include eliminated bakers" checkbox; confirm the answer-key form for a `draft`/`open` episode no longer shows any bonus-question inputs; for an already-`scored` episode, confirm "Re-score" still runs without error (bonus contributions stay whatever they currently are, since grading them now happens elsewhere).

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/admin/AdminEpisode.jsx web/src/pages/admin/AdminEpisode.copy.js
git commit -m "Add baker_multi_pick question type; move bonus grading out of episode scoring"
```

---

### Task 7: `AdminBonusQuestions` — the resolution page

**Files:**
- Create: `web/src/pages/admin/AdminBonusQuestions.jsx`
- Create: `web/src/pages/admin/AdminBonusQuestions.copy.js`
- Modify: `web/src/App.jsx` (add the route)
- Modify: `web/src/pages/admin/AdminDashboard.jsx` and `AdminDashboard.copy.js` (add the nav link)

**Interfaces:**
- Consumes: `fetchUnresolvedBonusQuestions` and `fetchAllBakers` (`web/src/lib/queries.js`), `scoreBonusAnswer` (`web/src/lib/scoring.js`), `BakerPicker`'s multi-select mode (Task 3).
- Produces: the admin-facing "grade a bonus question" flow — writes `bonus_questions.correct_answer`/`correct_baker_ids` and upserts into `scores`. Nothing later depends on this task's own exports.

- [ ] **Step 1: Create the copy file**

`web/src/pages/admin/AdminBonusQuestions.copy.js`:

```js
export const TITLE = 'Bonus questions'
export const LOADING = 'Loading…'
export const LOAD_ERROR_PREFIX = "Couldn't load bonus questions: "
export const TRY_AGAIN = 'Try again'
export const NONE_UNRESOLVED = 'No bonus questions are waiting to be graded.'
export const SCORING = 'Scoring…'
export const SCORE = 'Score'
export const correctAnswerLabel = (prompt) => `Correct answer: ${prompt}`
export const questionLine = (bq) =>
  `Episode ${bq.episodes.number} — ${bq.prompt} — ${bq.type} — ${bq.points} pt${bq.points === 1 ? '' : 's'}`
export const scoreSummary = (recomputed, preserved) =>
  `${recomputed} player score(s) recomputed, ${preserved} manual override(s) preserved.`
```

- [ ] **Step 2: Create the page**

`web/src/pages/admin/AdminBonusQuestions.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { fetchUnresolvedBonusQuestions, fetchAllBakers } from '../../lib/queries'
import { scoreBonusAnswer } from '../../lib/scoring'
import BakerPicker from '../../components/BakerPicker'
import * as copy from './AdminBonusQuestions.copy'

async function loadData() {
  const [bonusQuestions, allBakers] = await Promise.all([
    fetchUnresolvedBonusQuestions(),
    fetchAllBakers(),
  ])
  return { bonusQuestions, allBakers }
}

function BonusQuestionRow({ bq, allBakers, onResolved }) {
  const [text, setText] = useState('')
  const [bakerIds, setBakerIds] = useState([])
  const [scoring, setScoring] = useState(false)
  const [error, setError] = useState(null)
  const [summary, setSummary] = useState(null)
  const isMultiPick = bq.type === 'baker_multi_pick'

  async function handleScore() {
    setScoring(true)
    setError(null)
    setSummary(null)

    // Allowed by enforce_bonus_correct_answer_only_when_scored because this
    // question's own episode was already marked 'scored' long ago — that
    // trigger only blocks setting the key before then, not after.
    const { error: updateError } = await supabase
      .from('bonus_questions')
      .update(
        isMultiPick
          ? { correct_baker_ids: bakerIds.length ? bakerIds : null }
          : { correct_answer: text || null },
      )
      .eq('id', bq.id)
    if (updateError) {
      setError(updateError.message)
      setScoring(false)
      return
    }

    const { data: resolvedBq, error: resolvedBqError } = await supabase
      .from('bonus_questions')
      .select('*')
      .eq('id', bq.id)
      .single()
    const { data: bonusAnswers, error: bonusAnswersError } = await supabase
      .from('bonus_answers')
      .select('*')
      .eq('bonus_question_id', bq.id)
    const { data: existingScores, error: existingScoresError } = await supabase
      .from('scores')
      .select('*')
      .eq('episode_id', bq.episode_id)
    if (resolvedBqError || bonusAnswersError || existingScoresError) {
      setError((resolvedBqError ?? bonusAnswersError ?? existingScoresError).message)
      setScoring(false)
      return
    }

    let recomputed = 0
    let preserved = 0

    for (const ba of bonusAnswers) {
      const existing = existingScores.find((s) => s.player_id === ba.player_id)
      if (existing?.manually_overridden) {
        preserved += 1
        continue
      }
      const points = scoreBonusAnswer(resolvedBq, ba)
      const breakdown = { ...(existing?.points_breakdown ?? {}), [`bonus_${bq.id}`]: points }
      const total = Object.values(breakdown).reduce((sum, v) => sum + v, 0)
      const { error: upsertError } = await supabase.from('scores').upsert(
        {
          episode_id: bq.episode_id,
          player_id: ba.player_id,
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
    onResolved()
  }

  return (
    <div className="card">
      <p>{copy.questionLine(bq)}</p>
      {isMultiPick ? (
        <BakerPicker
          groupName={`resolve-${bq.id}`}
          label={copy.correctAnswerLabel(bq.prompt)}
          bakers={allBakers}
          multiple
          maxPicks={bq.options?.pick_count ?? allBakers.length}
          value={bakerIds}
          onChange={setBakerIds}
        />
      ) : (
        <label>
          {copy.correctAnswerLabel(bq.prompt)}
          <input value={text} onChange={(e) => setText(e.target.value)} />
        </label>
      )}
      <button onClick={handleScore} disabled={scoring}>
        {scoring ? copy.SCORING : copy.SCORE}
      </button>
      {summary && <p>{summary}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  )
}

export default function AdminBonusQuestions() {
  const [bonusQuestions, setBonusQuestions] = useState([])
  const [allBakers, setAllBakers] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    loadData()
      .then((result) => {
        if (cancelled) return
        setBonusQuestions(result.bonusQuestions)
        setAllBakers(result.allBakers)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [retryCount])

  async function reload() {
    const result = await loadData()
    setBonusQuestions(result.bonusQuestions)
    setAllBakers(result.allBakers)
  }

  if (loading) return <p>{copy.LOADING}</p>

  if (loadError) {
    return (
      <div>
        <p className="error">{copy.LOAD_ERROR_PREFIX}{loadError}</p>
        <button onClick={() => setRetryCount((n) => n + 1)}>{copy.TRY_AGAIN}</button>
      </div>
    )
  }

  return (
    <div>
      <h2>{copy.TITLE}</h2>
      {bonusQuestions.length === 0 ? (
        <p>{copy.NONE_UNRESOLVED}</p>
      ) : (
        bonusQuestions.map((bq) => (
          <BonusQuestionRow key={bq.id} bq={bq} allBakers={allBakers} onResolved={reload} />
        ))
      )}
    </div>
  )
}
```

- [ ] **Step 3: Wire up the route**

In `web/src/App.jsx`, add the import next to the other admin page imports:

```js
import AdminBonusQuestions from './pages/admin/AdminBonusQuestions'
```

and the route next to the other `/admin/*` routes:

```jsx
            <Route path="/admin/bonus-questions" element={<RequireAdmin><AdminBonusQuestions /></RequireAdmin>} />
```

- [ ] **Step 4: Add the dashboard link**

In `web/src/pages/admin/AdminDashboard.copy.js`, add:

```js
export const GRADE_BONUS_QUESTIONS = 'Grade bonus questions'
```

In `web/src/pages/admin/AdminDashboard.jsx`, add a link next to the existing two (after the `CREATE_EPISODE` link, around line 43):

```jsx
      <p>
        <Link to="/admin/bonus-questions">{copy.GRADE_BONUS_QUESTIONS}</Link>
      </p>
```

- [ ] **Step 5: Manually verify in the dev server**

```bash
cd web && npm run dev
```

Using the same test `baker_multi_pick` question approach as Task 4's Step 5 (insert one on an episode, have a test player answer it, then mark that episode `'scored'` via the normal admin flow), visit `/admin/bonus-questions` and confirm: the question appears with an episode number, prompt, and a multi-select `BakerPicker`; selecting the actual outcome and clicking "Score" updates `bonus_questions.correct_baker_ids`, upserts the player's score, shows a "N recomputed, 0 preserved" summary, and the question disappears from the list on reload (since its answer key is now set). Also confirm a plain `free_text`/`multiple_choice` bonus question on a scored episode shows a text input here instead, and grades correctly. Clean up any test data afterward.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/admin/AdminBonusQuestions.jsx web/src/pages/admin/AdminBonusQuestions.copy.js web/src/App.jsx web/src/pages/admin/AdminDashboard.jsx web/src/pages/admin/AdminDashboard.copy.js
git commit -m "Add admin page to grade bonus questions independent of episode scoring"
```

---

### Task 8: `EpisodeReveal` — render multi-pick answers as baker names

**Files:**
- Modify: `web/src/pages/EpisodeReveal.jsx`

**Interfaces:**
- Consumes: `bonus_answers.answer_baker_ids` (Task 1), the existing `bakerName(bakers, id)` helper already defined at the top of this file.
- Produces: nothing further downstream.

- [ ] **Step 1: Render joined baker names for `baker_multi_pick` questions**

Replace the bonus-question cell rendering (lines 79-82):

```jsx
                  {bonusQuestions.map((bq) => {
                    const ba = bonusAnswers.find((a) => a.bonus_question_id === bq.id && a.player_id === p.id)
                    return <td key={bq.id}>{ba?.answer_text ?? copy.NO_ANSWER}</td>
                  })}
```

with:

```jsx
                  {bonusQuestions.map((bq) => {
                    const ba = bonusAnswers.find((a) => a.bonus_question_id === bq.id && a.player_id === p.id)
                    if (bq.type === 'baker_multi_pick') {
                      const ids = ba?.answer_baker_ids ?? []
                      return (
                        <td key={bq.id}>
                          {ids.length ? ids.map((id) => bakerName(bakers, id)).join(', ') : copy.NO_ANSWER}
                        </td>
                      )
                    }
                    return <td key={bq.id}>{ba?.answer_text ?? copy.NO_ANSWER}</td>
                  })}
```

- [ ] **Step 2: Manually verify in the dev server**

```bash
cd web && npm run dev
```

Using the test data from Task 7's verification (a scored episode with a graded `baker_multi_pick` question and at least one player answer), visit `/episodes/<number>` and confirm the bonus-question column shows a comma-separated list of the picked bakers' names, not raw ids or `undefined`.

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/EpisodeReveal.jsx
git commit -m "Render baker_multi_pick answers as baker names on the episode reveal page"
```
