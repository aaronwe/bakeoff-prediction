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
