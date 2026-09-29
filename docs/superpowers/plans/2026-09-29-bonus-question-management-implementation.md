# Bonus Question Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the episode admin page, let the admin reorder (up/down arrows), edit, and delete bonus questions, with what's editable depending on the episode's status.

**Architecture:** A new `sort_order` column on `bonus_questions` defines display order; every place that lists bonus questions sorts by it. Pure helpers in `web/src/lib/` (ordering, per-status edit rules, form-field building) carry the logic and are unit-tested with Vitest. A new `BonusQuestionsManager` component replaces the read-only list and the inline `NewBonusQuestionForm` in `AdminEpisode.jsx`, so that 782-line file doesn't grow.

**Tech Stack:** React 19 + Vite, Supabase (Postgres + PostgREST), Vitest, oxlint. Run everything from `web/`.

**Spec:** Approved design from the chat on 2026-09-29 (no spec file; summarized under "Global Constraints").

## Global Constraints

- Edit rules by episode status (`episodes.status` is `'draft' | 'open' | 'scored'`):
  - `draft`: prompt, points, type, options, pick count, include-eliminated all editable; reorder ✓; delete ✓.
  - `open`: prompt and points editable; type/options/pick count/include-eliminated locked; reorder ✓; delete ✓ **with a confirm that states how many player answers will be removed**.
  - `scored`: prompt only editable; points and structure locked; reorder ✓; **delete locked**.
- Locked fields render as read-only text with a short note explaining why.
- Reordering uses ▲ / ▼ buttons (no drag-and-drop). No bulk operations.
- Order lives in `bonus_questions.sort_order integer not null default 0`; backfilled 1..n per episode by `created_at`; new questions get max + 1.
- Ordering rule everywhere: `sort_order`, then `created_at`.
- User-facing strings live in `.copy.js` files (existing convention: `AdminEpisode.copy.js`, `WeeklyForm.copy.js`).
- The database migration is applied to the live Supabase database **before** this branch is merged. A backup already exists at `backups/full-2026-09-29T19-48-37-886Z/` (main checkout, gitignored).
- Existing behavior to preserve: `pick_count` falls back to 1 via `Number(pickCount) || 1`; `include_eliminated` is only ever true for `baker_pick` / `baker_multi_pick`; `options` is `null` for types other than `multiple_choice` / `baker_multi_pick`.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/schema.sql` (modify) | Append the `sort_order` migration. |
| `web/src/lib/bonusOrder.js` (create) | `nextSortOrder`, `moveQuestion`, `sortBonusQuestions`. Pure. |
| `web/src/lib/bonusOrder.test.js` (create) | Tests for the above. |
| `web/src/lib/bonusEditRules.js` (create) | `editRulesFor(status)`. Pure. |
| `web/src/lib/bonusEditRules.test.js` (create) | Tests. |
| `web/src/lib/bonusFields.js` (create) | `buildBonusFields`, `formStateFromQuestion`. Pure. |
| `web/src/lib/bonusFields.test.js` (create) | Tests. |
| `web/src/lib/queries.js` (modify) | Sort by `sort_order`; client-side `sortBonusQuestions` for cross-episode lists. |
| `web/src/pages/admin/BonusQuestionsManager.jsx` (create) | List with arrows / edit / delete + the add form. |
| `web/src/pages/admin/BonusQuestionsManager.copy.js` (create) | Strings for the manager (add-form strings move here). |
| `web/src/pages/admin/AdminEpisode.jsx` (modify) | Remove `NewBonusQuestionForm` and the `<ul>`; render the manager. |
| `web/src/pages/admin/AdminEpisode.copy.js` (modify) | Remove strings that moved. |
| `scripts/backup-full.mjs` (create) | Full-table local backup (already written; commit it). |

---

### Task 1: Migration and backup script

**Files:**
- Modify: `supabase/schema.sql` (append at end)
- Create: `scripts/backup-full.mjs` (copy from the main checkout: `/Users/aaronweiss/claude/Projects/bakeoff-prediction/scripts/backup-full.mjs`)

**Interfaces:**
- Produces: column `bonus_questions.sort_order integer not null default 0`, distinct within each episode.

- [ ] **Step 1: Bring the backup script into the worktree**

```bash
cp /Users/aaronweiss/claude/Projects/bakeoff-prediction/scripts/backup-full.mjs scripts/backup-full.mjs
```

- [ ] **Step 2: Append the migration to `supabase/schema.sql`**

```sql

-- ── Bonus question ordering ───────────────────────────────────
-- Lets the admin reorder an episode's bonus questions. Previously every
-- query sorted by created_at. Additive with a default, so code deployed
-- before this runs keeps working; existing rows are backfilled 1..n per
-- episode in their current (created_at) order so nothing visibly moves.
alter table bonus_questions add column sort_order integer not null default 0;

update bonus_questions bq
set sort_order = r.rn
from (
  select id, row_number() over (partition by episode_id order by created_at, id) as rn
  from bonus_questions
) r
where r.id = bq.id;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql scripts/backup-full.mjs docs/superpowers/plans/2026-09-29-bonus-question-management-implementation.md
git commit -m "Add bonus question sort_order migration and full backup script"
```

- [ ] **Step 4: MANUAL (Aaron) — apply the migration to the live database**

Paste the SQL from Step 2 into the Supabase dashboard → SQL Editor → Run. Then verify from the main checkout's `scripts/` directory (this reads only; it needs `scripts/.env`):

```bash
cd /Users/aaronweiss/claude/Projects/bakeoff-prediction/scripts && node -e "import('./lib/supabaseAdmin.mjs').then(async ({supabaseAdmin}) => { const {data,error} = await supabaseAdmin.from('bonus_questions').select('episode_id,sort_order,prompt').order('episode_id').order('sort_order'); console.log(error ?? data) })"
```

Expected: 7 rows, `sort_order` 1..n within each `episode_id`, no zeros. **Do not merge or deploy this branch until this passes.** Code work in Tasks 2–6 can proceed meanwhile; nothing needs the column until the UI runs against the live database (Task 7 Step 2).

---

### Task 2: Ordering helpers

**Files:**
- Create: `web/src/lib/bonusOrder.js`
- Test: `web/src/lib/bonusOrder.test.js`

**Interfaces:**
- Produces:
  - `nextSortOrder(questions: {sort_order:number}[]): number` — `max + 1`, or `1` for an empty list.
  - `moveQuestion(questions, id: string, direction: 'up' | 'down'): {id:string, sort_order:number}[]` — takes the list, sorts it with `sortBonusQuestions`, moves `id` one slot, renumbers the whole list 1..n, and returns only the entries whose `sort_order` changed (empty array if `id` is missing or already at that edge).
  - `sortBonusQuestions(questions): questions[]` — new array sorted by `episodes?.number ?? 0`, then `sort_order`, then `created_at` (string compare on ISO timestamps).

- [ ] **Step 1: Write the failing tests**

```js
// web/src/lib/bonusOrder.test.js
import { describe, it, expect } from 'vitest'
import { nextSortOrder, moveQuestion, sortBonusQuestions } from './bonusOrder'

const q = (id, sort_order, created_at = '2026-01-01T00:00:00Z', episodes) => ({ id, sort_order, created_at, episodes })

describe('nextSortOrder', () => {
  it('is 1 for an empty list', () => {
    expect(nextSortOrder([])).toBe(1)
  })
  it('is max + 1', () => {
    expect(nextSortOrder([q('a', 1), q('b', 4), q('c', 2)])).toBe(5)
  })
})

describe('sortBonusQuestions', () => {
  it('sorts by sort_order then created_at without mutating the input', () => {
    const input = [q('b', 2), q('c', 1, '2026-01-02T00:00:00Z'), q('a', 1, '2026-01-01T00:00:00Z')]
    expect(sortBonusQuestions(input).map((x) => x.id)).toEqual(['a', 'c', 'b'])
    expect(input.map((x) => x.id)).toEqual(['b', 'c', 'a'])
  })
  it('groups by episode number first when present', () => {
    const input = [q('e2', 1, undefined, { number: 2 }), q('e1', 5, undefined, { number: 1 })]
    expect(sortBonusQuestions(input).map((x) => x.id)).toEqual(['e1', 'e2'])
  })
})

describe('moveQuestion', () => {
  const list = [q('a', 1), q('b', 2), q('c', 3)]
  it('moves down by swapping with the next question', () => {
    expect(moveQuestion(list, 'a', 'down')).toEqual([
      { id: 'b', sort_order: 1 },
      { id: 'a', sort_order: 2 },
    ])
  })
  it('moves up by swapping with the previous question', () => {
    expect(moveQuestion(list, 'c', 'up')).toEqual([
      { id: 'c', sort_order: 2 },
      { id: 'b', sort_order: 3 },
    ])
  })
  it('returns [] at the edges and for unknown ids', () => {
    expect(moveQuestion(list, 'a', 'up')).toEqual([])
    expect(moveQuestion(list, 'c', 'down')).toEqual([])
    expect(moveQuestion(list, 'zzz', 'up')).toEqual([])
  })
  it('repairs ties and gaps by renumbering 1..n', () => {
    const tied = [q('a', 0, '2026-01-01T00:00:00Z'), q('b', 0, '2026-01-02T00:00:00Z'), q('c', 7)]
    expect(moveQuestion(tied, 'b', 'up')).toEqual([
      { id: 'b', sort_order: 1 },
      { id: 'a', sort_order: 2 },
      { id: 'c', sort_order: 3 },
    ])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run (from `web/`; first `npm install` if `node_modules` is missing): `npx vitest run src/lib/bonusOrder.test.js`
Expected: FAIL — cannot resolve `./bonusOrder`.

- [ ] **Step 3: Implement**

```js
// web/src/lib/bonusOrder.js
export function nextSortOrder(questions) {
  return questions.reduce((max, q) => Math.max(max, q.sort_order ?? 0), 0) + 1
}

export function sortBonusQuestions(questions) {
  return [...questions].sort(
    (a, b) =>
      (a.episodes?.number ?? 0) - (b.episodes?.number ?? 0) ||
      (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
      String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')),
  )
}

// Returns only the rows whose sort_order changes. Renumbering the whole list
// (rather than swapping two values) keeps this correct even if a legacy row
// has a tied or zero sort_order.
export function moveQuestion(questions, id, direction) {
  const sorted = sortBonusQuestions(questions)
  const from = sorted.findIndex((q) => q.id === id)
  const to = direction === 'up' ? from - 1 : from + 1
  if (from === -1 || to < 0 || to >= sorted.length) return []
  const reordered = [...sorted]
  ;[reordered[from], reordered[to]] = [reordered[to], reordered[from]]
  return reordered
    .map((q, i) => ({ id: q.id, sort_order: i + 1, changed: q.sort_order !== i + 1 }))
    .filter((r) => r.changed)
    .map(({ id: rid, sort_order }) => ({ id: rid, sort_order }))
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/bonusOrder.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/bonusOrder.js web/src/lib/bonusOrder.test.js
git commit -m "Add bonus question ordering helpers"
```

---

### Task 3: Edit-rules helper

**Files:**
- Create: `web/src/lib/bonusEditRules.js`
- Test: `web/src/lib/bonusEditRules.test.js`

**Interfaces:**
- Produces: `editRulesFor(status: 'draft'|'open'|'scored'): { prompt: boolean, points: boolean, structure: boolean, canDelete: boolean }`. `structure` covers type, options, pick count, include-eliminated. Unknown statuses get the most restrictive (scored) rules.

- [ ] **Step 1: Write the failing test**

```js
// web/src/lib/bonusEditRules.test.js
import { describe, it, expect } from 'vitest'
import { editRulesFor } from './bonusEditRules'

describe('editRulesFor', () => {
  it('allows everything in draft', () => {
    expect(editRulesFor('draft')).toEqual({ prompt: true, points: true, structure: true, canDelete: true })
  })
  it('locks structure once open, but still allows delete', () => {
    expect(editRulesFor('open')).toEqual({ prompt: true, points: true, structure: false, canDelete: true })
  })
  it('allows only the prompt once scored', () => {
    expect(editRulesFor('scored')).toEqual({ prompt: true, points: false, structure: false, canDelete: false })
  })
  it('falls back to the most restrictive rules for unknown statuses', () => {
    expect(editRulesFor('weird')).toEqual(editRulesFor('scored'))
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/bonusEditRules.test.js`
Expected: FAIL — cannot resolve `./bonusEditRules`.

- [ ] **Step 3: Implement**

```js
// web/src/lib/bonusEditRules.js
// What an admin may change on a bonus question, by its episode's status.
// `structure` = type, options, pick count, include-eliminated: changing those
// after players have answered would leave their saved answers meaningless.
// Points and delete are locked once scored because scores are already
// computed and wouldn't update.
const RULES = {
  draft: { prompt: true, points: true, structure: true, canDelete: true },
  open: { prompt: true, points: true, structure: false, canDelete: true },
  scored: { prompt: true, points: false, structure: false, canDelete: false },
}

export function editRulesFor(status) {
  return RULES[status] ?? RULES.scored
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/bonusEditRules.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/bonusEditRules.js web/src/lib/bonusEditRules.test.js
git commit -m "Add per-status bonus question edit rules"
```

---

### Task 4: Form-field helpers

**Files:**
- Create: `web/src/lib/bonusFields.js`
- Test: `web/src/lib/bonusFields.test.js`

**Interfaces:**
- Produces:
  - `buildBonusFields({ type, options, includeEliminated, pickCount }): { options: string[] | {pick_count:number} | null, include_eliminated: boolean }` — `options` and `pickCount` are the raw form strings. This is the exact logic currently inline in `NewBonusQuestionForm.handleSubmit`.
  - `formStateFromQuestion(bq): { type, options: string, includeEliminated: boolean, pickCount: string }` — inverse, used to seed the edit form. `options` is `bq.options.join(', ')` for `multiple_choice`, else `''`; `pickCount` is `String(bq.options.pick_count)` for `baker_multi_pick`, else `'3'`.

- [ ] **Step 1: Write the failing test**

```js
// web/src/lib/bonusFields.test.js
import { describe, it, expect } from 'vitest'
import { buildBonusFields, formStateFromQuestion } from './bonusFields'

describe('buildBonusFields', () => {
  it('splits and trims multiple_choice options', () => {
    expect(buildBonusFields({ type: 'multiple_choice', options: ' Red, Blue ,, ', includeEliminated: true, pickCount: '3' })).toEqual({
      options: ['Red', 'Blue'],
      include_eliminated: false,
    })
  })
  it('stores pick_count for baker_multi_pick and keeps include_eliminated', () => {
    expect(buildBonusFields({ type: 'baker_multi_pick', options: '', includeEliminated: true, pickCount: '4' })).toEqual({
      options: { pick_count: 4 },
      include_eliminated: true,
    })
  })
  it('falls back to a pick_count of 1 for blank or non-numeric input', () => {
    expect(buildBonusFields({ type: 'baker_multi_pick', options: '', includeEliminated: false, pickCount: '' }).options).toEqual({ pick_count: 1 })
    expect(buildBonusFields({ type: 'baker_multi_pick', options: '', includeEliminated: false, pickCount: 'abc' }).options).toEqual({ pick_count: 1 })
  })
  it('keeps include_eliminated for baker_pick, options null', () => {
    expect(buildBonusFields({ type: 'baker_pick', options: 'x', includeEliminated: true, pickCount: '3' })).toEqual({
      options: null,
      include_eliminated: true,
    })
  })
  it('nulls options and clears include_eliminated for free_text and judge_host_pick', () => {
    for (const type of ['free_text', 'judge_host_pick']) {
      expect(buildBonusFields({ type, options: 'x', includeEliminated: true, pickCount: '3' })).toEqual({
        options: null,
        include_eliminated: false,
      })
    }
  })
})

describe('formStateFromQuestion', () => {
  it('round-trips multiple_choice', () => {
    expect(formStateFromQuestion({ type: 'multiple_choice', options: ['Red', 'Blue'], include_eliminated: false })).toEqual({
      type: 'multiple_choice',
      options: 'Red, Blue',
      includeEliminated: false,
      pickCount: '3',
    })
  })
  it('round-trips baker_multi_pick', () => {
    expect(formStateFromQuestion({ type: 'baker_multi_pick', options: { pick_count: 2 }, include_eliminated: true })).toEqual({
      type: 'baker_multi_pick',
      options: '',
      includeEliminated: true,
      pickCount: '2',
    })
  })
  it('handles null options', () => {
    expect(formStateFromQuestion({ type: 'free_text', options: null, include_eliminated: false })).toEqual({
      type: 'free_text',
      options: '',
      includeEliminated: false,
      pickCount: '3',
    })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/bonusFields.test.js`
Expected: FAIL — cannot resolve `./bonusFields`.

- [ ] **Step 3: Implement**

```js
// web/src/lib/bonusFields.js
export function buildBonusFields({ type, options, includeEliminated, pickCount }) {
  return {
    options:
      type === 'multiple_choice' ? options.split(',').map((s) => s.trim()).filter(Boolean)
      // `|| 1` (not `??`): a cleared field yields Number('') === 0 and a
      // non-numeric one NaN, and a stored pick_count of 0/NaN disables every
      // checkbox for players and admins alike.
      : type === 'baker_multi_pick' ? { pick_count: Number(pickCount) || 1 }
      : null,
    include_eliminated: type === 'baker_pick' || type === 'baker_multi_pick' ? includeEliminated : false,
  }
}

export function formStateFromQuestion(bq) {
  return {
    type: bq.type,
    options: bq.type === 'multiple_choice' ? (bq.options ?? []).join(', ') : '',
    includeEliminated: bq.include_eliminated ?? false,
    pickCount: bq.type === 'baker_multi_pick' ? String(bq.options?.pick_count ?? 3) : '3',
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/bonusFields.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/bonusFields.js web/src/lib/bonusFields.test.js
git commit -m "Extract bonus question form-field helpers"
```

---

### Task 5: Sort queries by sort_order

**Files:**
- Modify: `web/src/lib/queries.js` (lines ~37-45, ~78-121, ~141-190)

**Interfaces:**
- Consumes: `sortBonusQuestions` from `./bonusOrder` (Task 2).
- Produces: every bonus-question list returned by `queries.js` is in `sort_order` (then `created_at`) order; the cross-episode admin lists are grouped by episode number first.

- [ ] **Step 1: Add the import** at the top of `queries.js`

```js
import { sortBonusQuestions } from './bonusOrder'
```

- [ ] **Step 2: `fetchBonusQuestions`** — replace `.order('created_at')` with two orders:

```js
    .order('sort_order')
    .order('created_at')
```

- [ ] **Step 3: Cross-episode lists** — in `fetchUnresolvedBonusQuestions`, `fetchGradedBonusQuestions` and `fetchOpenBonusQuestions`, delete the `.order('created_at')` line and change `return data` to `return sortBonusQuestions(data)` (their rows include `episodes(number, ...)` from the join, which the helper groups by).

- [ ] **Step 4: Unordered fetches** — the two `Promise.all` blocks that do `supabase.from('bonus_questions').select('*').eq('episode_id', episode.id)` (around lines 84 and 113) return `bonusQuestions: bonusQuestions`. Change each return to `bonusQuestions: sortBonusQuestions(bonusQuestions ?? [])`.

- [ ] **Step 5: Verify**

Run: `npx vitest run && npm run lint && npm run build`
Expected: all tests pass; lint shows only the pre-existing warnings; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/queries.js
git commit -m "Order bonus questions by sort_order everywhere they are listed"
```

---

### Task 6: BonusQuestionsManager component

**Files:**
- Create: `web/src/pages/admin/BonusQuestionsManager.jsx`
- Create: `web/src/pages/admin/BonusQuestionsManager.copy.js`
- Modify: `web/src/pages/admin/AdminEpisode.jsx` (remove `NewBonusQuestionForm` lines ~16-98, replace the `<ul>` + form at ~749-756, drop now-unused imports)
- Modify: `web/src/pages/admin/AdminEpisode.copy.js` (remove the `// NewBonusQuestionForm` block and `bonusQuestionLine`)

**Interfaces:**
- Consumes: `moveQuestion`, `nextSortOrder` (Task 2); `editRulesFor` (Task 3); `buildBonusFields`, `formStateFromQuestion` (Task 4); `supabase` from `../../lib/supabaseClient`.
- Produces: default export `BonusQuestionsManager({ episode, bonusQuestions, onChanged })` where `bonusQuestions` is the already-ordered list for this episode and `onChanged` reloads the page data (same contract as the sibling components' `onChanged`/`onAdded`).

- [ ] **Step 1: Create the copy file**

```js
// web/src/pages/admin/BonusQuestionsManager.copy.js

// Add form (moved from AdminEpisode.copy.js)
export const ADD_BONUS_QUESTION_TITLE = 'Add a bonus question'
export const PROMPT_LABEL = 'Prompt'
export const TYPE_LABEL = 'Type'
export const TYPE_BAKER_PICK = 'Pick a baker'
export const TYPE_BAKER_MULTI_PICK = 'Pick multiple bakers'
export const TYPE_JUDGE_HOST_PICK = 'Pick a judge or host'
export const TYPE_MULTIPLE_CHOICE = 'Multiple choice (custom options)'
export const TYPE_FREE_TEXT = 'Free text / number'
export const INCLUDE_ELIMINATED_LABEL = 'Include eliminated bakers'
export const OPTIONS_LABEL = 'Options (comma-separated)'
export const POINTS_LABEL = 'Points'
export const PICK_COUNT_LABEL = 'How many bakers can be picked'
export const ADD_BONUS_QUESTION = 'Add bonus question'

// List rows
export const NO_BONUS_QUESTIONS = 'No bonus questions yet.'
export const MOVE_UP = 'Move up'
export const MOVE_DOWN = 'Move down'
export const EDIT = 'Edit'
export const DELETE = 'Delete'
export const SAVE = 'Save'
export const SAVING = 'Saving…'
export const CANCEL = 'Cancel'
export const DELETE_LOCKED_NOTE = 'Questions on a scored episode can’t be deleted — their points are already counted.'
export const POINTS_LOCKED_NOTE = 'Points are locked once the episode is scored.'
export const STRUCTURE_LOCKED_NOTE = 'Type and options are locked once the episode is open, because players may have already answered.'
export const TYPE_LABELS = {
  baker_pick: TYPE_BAKER_PICK,
  baker_multi_pick: TYPE_BAKER_MULTI_PICK,
  judge_host_pick: TYPE_JUDGE_HOST_PICK,
  multiple_choice: TYPE_MULTIPLE_CHOICE,
  free_text: TYPE_FREE_TEXT,
}
export const bonusQuestionLine = (bq) =>
  `${bq.prompt} — ${TYPE_LABELS[bq.type] ?? bq.type} — ${bq.points} pt${bq.points === 1 ? '' : 's'}`
export const confirmDelete = (bq, answerCount) =>
  answerCount > 0
    ? `Delete “${bq.prompt}”? This will also remove ${answerCount} player answer${answerCount === 1 ? '' : 's'} and can’t be undone.`
    : `Delete “${bq.prompt}”? This can’t be undone.`
export const DELETE_HAD_NO_EFFECT = 'Nothing was deleted (the database refused the change). Try reloading the page.'
```

- [ ] **Step 2: Create the component**

```jsx
// web/src/pages/admin/BonusQuestionsManager.jsx
import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { moveQuestion, nextSortOrder } from '../../lib/bonusOrder'
import { editRulesFor } from '../../lib/bonusEditRules'
import { buildBonusFields, formStateFromQuestion } from '../../lib/bonusFields'
import * as copy from './BonusQuestionsManager.copy'

// The type-specific inputs, shared by the add form and the edit row so the
// two can't drift apart.
function BonusTypeFields({ state, setState, structureLocked }) {
  const { type, options, includeEliminated, pickCount } = state
  const set = (patch) => setState((prev) => ({ ...prev, ...patch }))
  return (
    <>
      <label>
        {copy.TYPE_LABEL}
        <select value={type} onChange={(e) => set({ type: e.target.value })} disabled={structureLocked}>
          <option value="baker_pick">{copy.TYPE_BAKER_PICK}</option>
          <option value="baker_multi_pick">{copy.TYPE_BAKER_MULTI_PICK}</option>
          <option value="judge_host_pick">{copy.TYPE_JUDGE_HOST_PICK}</option>
          <option value="multiple_choice">{copy.TYPE_MULTIPLE_CHOICE}</option>
          <option value="free_text">{copy.TYPE_FREE_TEXT}</option>
        </select>
      </label>
      {(type === 'baker_pick' || type === 'baker_multi_pick') && (
        <label>
          <input
            type="checkbox"
            checked={includeEliminated}
            disabled={structureLocked}
            onChange={(e) => set({ includeEliminated: e.target.checked })}
          />
          {copy.INCLUDE_ELIMINATED_LABEL}
        </label>
      )}
      {type === 'baker_multi_pick' && (
        <label>
          {copy.PICK_COUNT_LABEL}
          <input
            required
            type="number"
            min="1"
            value={pickCount}
            disabled={structureLocked}
            onChange={(e) => set({ pickCount: e.target.value })}
          />
        </label>
      )}
      {type === 'multiple_choice' && (
        <label>
          {copy.OPTIONS_LABEL}
          <input value={options} disabled={structureLocked} onChange={(e) => set({ options: e.target.value })} />
        </label>
      )}
    </>
  )
}

const EMPTY_FORM = { type: 'baker_pick', options: '', includeEliminated: false, pickCount: '3' }

function NewBonusQuestionForm({ episodeId, sortOrder, onAdded }) {
  const [prompt, setPrompt] = useState('')
  const [fields, setFields] = useState(EMPTY_FORM)
  const [points, setPoints] = useState('1')
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const { error: insertError } = await supabase.from('bonus_questions').insert({
      episode_id: episodeId,
      prompt,
      type: fields.type,
      ...buildBonusFields(fields),
      points: Number(points),
      sort_order: sortOrder,
    })
    if (insertError) {
      setError(insertError.message)
      return
    }
    setPrompt('')
    setFields(EMPTY_FORM)
    setPoints('1')
    onAdded()
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h4>{copy.ADD_BONUS_QUESTION_TITLE}</h4>
      <label>
        {copy.PROMPT_LABEL}
        <input required value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </label>
      <BonusTypeFields state={fields} setState={setFields} structureLocked={false} />
      <label>
        {copy.POINTS_LABEL}
        <input type="number" min="1" value={points} onChange={(e) => setPoints(e.target.value)} />
      </label>
      <button type="submit">{copy.ADD_BONUS_QUESTION}</button>
      {error && <p className="error">{error}</p>}
    </form>
  )
}

function BonusQuestionEditForm({ bq, status, onSaved, onCancel }) {
  const rules = editRulesFor(status)
  const [prompt, setPrompt] = useState(bq.prompt)
  const [points, setPoints] = useState(String(bq.points))
  const [fields, setFields] = useState(formStateFromQuestion(bq))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    // Send only what the rules allow, so a locked field can never be written
    // even if the UI were bypassed by stale local state.
    const update = { prompt }
    if (rules.points) update.points = Number(points)
    if (rules.structure) Object.assign(update, { type: fields.type }, buildBonusFields(fields))
    // .select() so a blocked update (RLS) surfaces as "0 rows" instead of a
    // silent success.
    const { data, error: updateError } = await supabase.from('bonus_questions').update(update).eq('id', bq.id).select()
    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    if (!data?.length) {
      setError(copy.DELETE_HAD_NO_EFFECT)
      return
    }
    onSaved()
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <label>
        {copy.PROMPT_LABEL}
        <input required value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </label>
      <BonusTypeFields state={fields} setState={setFields} structureLocked={!rules.structure} />
      {!rules.structure && <p className="note">{copy.STRUCTURE_LOCKED_NOTE}</p>}
      <label>
        {copy.POINTS_LABEL}
        <input
          type="number"
          min="1"
          value={points}
          disabled={!rules.points}
          onChange={(e) => setPoints(e.target.value)}
        />
      </label>
      {!rules.points && <p className="note">{copy.POINTS_LOCKED_NOTE}</p>}
      <button type="submit" disabled={saving}>{saving ? copy.SAVING : copy.SAVE}</button>
      <button type="button" onClick={onCancel} disabled={saving}>{copy.CANCEL}</button>
      {error && <p className="error">{error}</p>}
    </form>
  )
}

export default function BonusQuestionsManager({ episode, bonusQuestions, onChanged }) {
  const [editingId, setEditingId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const rules = editRulesFor(episode.status)

  async function handleMove(id, direction) {
    const changes = moveQuestion(bonusQuestions, id, direction)
    if (changes.length === 0) return
    setError(null)
    setBusy(true)
    const results = await Promise.all(
      changes.map((c) => supabase.from('bonus_questions').update({ sort_order: c.sort_order }).eq('id', c.id).select()),
    )
    setBusy(false)
    const failed = results.find((r) => r.error || !r.data?.length)
    if (failed) setError(failed.error?.message ?? copy.DELETE_HAD_NO_EFFECT)
    // Reload either way: after a partial failure the database is the truth.
    onChanged()
  }

  async function handleDelete(bq) {
    setError(null)
    const { count, error: countError } = await supabase
      .from('bonus_answers')
      .select('id', { count: 'exact', head: true })
      .eq('bonus_question_id', bq.id)
    if (countError) {
      setError(countError.message)
      return
    }
    if (!window.confirm(copy.confirmDelete(bq, count ?? 0))) return
    setBusy(true)
    // .select() forces Postgres to report which rows were deleted; without it
    // an RLS-blocked delete looks identical to a real success.
    const { data, error: deleteError } = await supabase.from('bonus_questions').delete().eq('id', bq.id).select()
    setBusy(false)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    if (!data?.length) {
      setError(copy.DELETE_HAD_NO_EFFECT)
      return
    }
    onChanged()
  }

  return (
    <div>
      {bonusQuestions.length === 0 && <p>{copy.NO_BONUS_QUESTIONS}</p>}
      <ul className="bonus-question-list">
        {bonusQuestions.map((bq, i) => (
          <li key={bq.id}>
            {editingId === bq.id ? (
              <BonusQuestionEditForm
                bq={bq}
                status={episode.status}
                onCancel={() => setEditingId(null)}
                onSaved={() => {
                  setEditingId(null)
                  onChanged()
                }}
              />
            ) : (
              <>
                <span>{copy.bonusQuestionLine(bq)}</span>{' '}
                <button type="button" aria-label={copy.MOVE_UP} title={copy.MOVE_UP} disabled={busy || i === 0} onClick={() => handleMove(bq.id, 'up')}>▲</button>
                <button type="button" aria-label={copy.MOVE_DOWN} title={copy.MOVE_DOWN} disabled={busy || i === bonusQuestions.length - 1} onClick={() => handleMove(bq.id, 'down')}>▼</button>
                <button type="button" onClick={() => setEditingId(bq.id)} disabled={busy}>{copy.EDIT}</button>
                <button
                  type="button"
                  className="button-danger"
                  onClick={() => handleDelete(bq)}
                  disabled={busy || !rules.canDelete}
                  title={rules.canDelete ? undefined : copy.DELETE_LOCKED_NOTE}
                >
                  {copy.DELETE}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      {!rules.canDelete && <p className="note">{copy.DELETE_LOCKED_NOTE}</p>}
      {error && <p className="error">{error}</p>}
      <NewBonusQuestionForm episodeId={episode.id} sortOrder={nextSortOrder(bonusQuestions)} onAdded={onChanged} />
    </div>
  )
}
```

- [ ] **Step 3: Wire into `AdminEpisode.jsx`**

Delete the whole `NewBonusQuestionForm` function (from `function NewBonusQuestionForm` through its closing `}`), add `import BonusQuestionsManager from './BonusQuestionsManager'`, and replace

```jsx
      <ul>
        {bonusQuestions.map((bq) => (
          <li key={bq.id}>{copy.bonusQuestionLine(bq)}</li>
        ))}
      </ul>
      <NewBonusQuestionForm episodeId={episode.id} onAdded={reload} />
```

with

```jsx
      <BonusQuestionsManager episode={episode} bonusQuestions={bonusQuestions} onChanged={reload} />
```

- [ ] **Step 4: Trim `AdminEpisode.copy.js`**

Delete the `// NewBonusQuestionForm` block (`ADD_BONUS_QUESTION_TITLE` … `ADD_BONUS_QUESTION`) and `bonusQuestionLine`. Then confirm nothing else referenced them:

```bash
grep -rn "ADD_BONUS_QUESTION\|PICK_COUNT_LABEL\|OPTIONS_LABEL\|INCLUDE_ELIMINATED_LABEL\|TYPE_LABEL\|bonusQuestionLine\|POINTS_LABEL\|PROMPT_LABEL" web/src | grep -v BonusQuestionsManager
```

Expected: no output (if `POINTS_LABEL` / `PROMPT_LABEL` are used by another admin file's own copy, leave that file's constants alone — only remove the ones from `AdminEpisode.copy.js` that nothing imports).

- [ ] **Step 5: Verify**

Run (from `web/`): `npx vitest run && npm run lint && npm run build`
Expected: all tests pass; no new lint warnings (in particular no unused-import warnings in `AdminEpisode.jsx`); build succeeds.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/admin
git commit -m "Add reorder, edit and delete for bonus questions on the episode admin page"
```

---

### Task 7: Verification

**Files:** none

- [ ] **Step 1: Full checks**

Run (from `web/`): `npx vitest run && npm run lint && npm run build`
Expected: all green, only pre-existing lint warnings.

- [ ] **Step 2: Browser check** (only after Task 1 Step 4 is done — the page queries `sort_order`)

Start the dev server with `preview_start`, sign in as an admin, open an episode's admin page, and confirm:
- ▲/▼ swap neighbours and the order persists after reload; first ▲ and last ▼ are disabled.
- Edit → change prompt/points on a draft/open episode; on an open episode the type/options controls are disabled with the note.
- Delete on an open episode shows a confirm naming the number of answers; on a scored episode the button is disabled with the note.
- The player form (`/`) shows the questions in the new order.

If admin sign-in isn't possible in the preview, say so explicitly rather than claiming it was verified.

- [ ] **Step 3: Hand off**

Report results, then use superpowers:finishing-a-development-branch.
