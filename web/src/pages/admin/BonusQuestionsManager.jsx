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
