import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import {
  fetchUnresolvedBonusQuestions,
  fetchGradedBonusQuestions,
  fetchOpenBonusQuestions,
  fetchBonusQuestionDraftAnswerKeys,
  fetchAllBakers,
} from '../../lib/queries'
import { resolveBonusAnswerKeyDefaults } from '../../lib/draftAnswerKeys'
import { scoreBonusAnswer } from '../../lib/scoring'
import BakerPicker from '../../components/BakerPicker'
import JudgeHostPicker from '../../components/JudgeHostPicker'
import { JUDGES_AND_HOSTS } from '../../lib/judgesAndHosts'
import { bonusOptionsFor, withSavedValue } from '../../lib/bonusOptions'
import * as copy from './AdminBonusQuestions.copy'

// Mirrors WeeklyForm's conversion: judge_host_pick's correct_answer is the
// same plain name string ("Paul") that answer_text uses, so JudgeHostPicker
// (which works in terms of person ids) converts at the boundary.
function idForShortName(shortName) {
  return JUDGES_AND_HOSTS.find((p) => p.shortName === shortName)?.id ?? ''
}

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
  if (bq.type === 'closest_number') {
    return (
      <label className="answer-key-field">
        {copy.correctAnswerLabel(bq.prompt)}
        <input type="number" min="0" step="1" value={text} onChange={(e) => setText(e.target.value)} />
      </label>
    )
  }
  // Full roster even for active-only questions: scoring can happen after a
  // baker who was pickable at answer time has since been eliminated.
  const options = bonusOptionsFor(bq, allBakers, allBakers)
  if (options) {
    return (
      <label className="answer-key-field">
        {copy.correctAnswerLabel(bq.prompt)}
        <select value={text} onChange={(e) => setText(e.target.value)}>
          <option value="">{copy.SELECT_AN_OPTION}</option>
          {withSavedValue(options, text).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </label>
    )
  }
  return (
    <label className="answer-key-field">
      {copy.correctAnswerLabel(bq.prompt)}
      <input value={text} onChange={(e) => setText(e.target.value)} />
    </label>
  )
}

function BonusQuestionRow({ bq, allBakers, draftAnswerKey, onResolved, scoringId, setScoringId }) {
  // Seeded from the existing answer key so an already-graded question opens
  // prefilled and can be corrected in place; an ungraded row instead seeds
  // from a saved draft when one exists, and only falls back to blank/empty
  // when there's neither a real answer nor a draft.
  const defaults = resolveBonusAnswerKeyDefaults(bq, draftAnswerKey)
  const [text, setText] = useState(defaults.text)
  const [bakerIds, setBakerIds] = useState(defaults.bakerIds)
  const [error, setError] = useState(null)
  const [summary, setSummary] = useState(null)
  const isMultiPick = bq.type === 'baker_multi_pick'
  const isScoring = scoringId === bq.id
  // Disabled while ANY row is scoring, not just this one: every row's upsert
  // loop reads a snapshot of `scores` taken at click time, so if question A's
  // loop is still running when question B is scored, B's snapshot predates
  // A's writes and its merge would silently drop A's just-written
  // `bonus_<A>` breakdown key. One shared lock across all rows (mirroring
  // AdminEpisode.jsx's IntroNoteAndLock `saving` flag) serializes them.
  const disabled = scoringId !== null

  async function handleScore() {
    setError(null)
    setSummary(null)

    if (isMultiPick) {
      if (bakerIds.length === 0) {
        setError(copy.PICK_BAKER_ERROR)
        return
      }
    } else if (!text.trim()) {
      setError(copy.ENTER_ANSWER_ERROR)
      return
    }

    setScoringId(bq.id)

    // Allowed by enforce_bonus_correct_answer_only_when_scored because this
    // question's own episode was already marked 'scored' long ago — that
    // trigger only blocks setting the key before then, not after.
    const { error: updateError } = await supabase
      .from('bonus_questions')
      .update(
        isMultiPick
          ? { correct_baker_ids: bakerIds }
          : { correct_answer: text || null },
      )
      .eq('id', bq.id)
    if (updateError) {
      setError(updateError.message)
      setScoringId(null)
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
      setScoringId(null)
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
      const points = scoreBonusAnswer(resolvedBq, ba, bonusAnswers)
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
        setScoringId(null)
        return
      }
      recomputed += 1
    }

    setSummary(copy.scoreSummary(recomputed, preserved))
    setScoringId(null)
    onResolved()
  }

  return (
    <div className="card">
      <p>{copy.questionLine(bq)}</p>
      <BonusAnswerKeyFields
        bq={bq}
        allBakers={allBakers}
        groupPrefix="resolve"
        text={text}
        setText={setText}
        bakerIds={bakerIds}
        setBakerIds={setBakerIds}
      />
      <button onClick={handleScore} disabled={disabled}>
        {isScoring ? copy.SCORING : copy.SCORE}
      </button>
      {summary && <p>{summary}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  )
}

function DraftBonusQuestionRow({ bq, allBakers, draftAnswerKey, onSaved }) {
  const defaults = resolveBonusAnswerKeyDefaults(bq, draftAnswerKey)
  const [text, setText] = useState(defaults.text)
  const [bakerIds, setBakerIds] = useState(defaults.bakerIds)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [summary, setSummary] = useState(null)
  const isMultiPick = bq.type === 'baker_multi_pick'

  async function handleSaveDraft() {
    setSaving(true)
    setError(null)
    setSummary(null)
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
    setSummary(copy.DRAFT_SAVED)
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
      {summary && <p>{summary}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  )
}

export default function AdminBonusQuestions() {
  const [bonusQuestions, setBonusQuestions] = useState([])
  const [gradedBonusQuestions, setGradedBonusQuestions] = useState([])
  const [openBonusQuestions, setOpenBonusQuestions] = useState([])
  const [draftAnswerKeysByQuestionId, setDraftAnswerKeysByQuestionId] = useState({})
  const [allBakers, setAllBakers] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [retryCount, setRetryCount] = useState(0)
  // Shared across every row (see the comment in BonusQuestionRow) so only one
  // question's grading can be in flight across the whole list at a time.
  const [scoringId, setScoringId] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    loadData()
      .then((result) => {
        if (cancelled) return
        setBonusQuestions(result.bonusQuestions)
        setGradedBonusQuestions(result.gradedBonusQuestions)
        setOpenBonusQuestions(result.openBonusQuestions)
        setDraftAnswerKeysByQuestionId(result.draftAnswerKeysByQuestionId)
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
    setGradedBonusQuestions(result.gradedBonusQuestions)
    setOpenBonusQuestions(result.openBonusQuestions)
    setDraftAnswerKeysByQuestionId(result.draftAnswerKeysByQuestionId)
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
      <h3>{copy.NEEDS_GRADING_HEADING}</h3>
      {bonusQuestions.length === 0 ? (
        <p>{copy.NONE_UNRESOLVED}</p>
      ) : (
        bonusQuestions.map((bq) => (
          <BonusQuestionRow
            key={bq.id}
            bq={bq}
            allBakers={allBakers}
            draftAnswerKey={draftAnswerKeysByQuestionId[bq.id]}
            onResolved={reload}
            scoringId={scoringId}
            setScoringId={setScoringId}
          />
        ))
      )}
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
      <h3>{copy.ALREADY_GRADED_HEADING}</h3>
      <p>{copy.ALREADY_GRADED_HELP}</p>
      {gradedBonusQuestions.length === 0 ? (
        <p>{copy.NONE_GRADED}</p>
      ) : (
        gradedBonusQuestions.map((bq) => (
          <BonusQuestionRow
            key={bq.id}
            bq={bq}
            allBakers={allBakers}
            draftAnswerKey={draftAnswerKeysByQuestionId[bq.id]}
            onResolved={reload}
            scoringId={scoringId}
            setScoringId={setScoringId}
          />
        ))
      )}
    </div>
  )
}
