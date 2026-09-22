import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import {
  fetchBonusQuestions,
  fetchMyAnswer,
  fetchMyBonusAnswers,
} from '../lib/queries'
import BakerPicker from './BakerPicker'
import * as copy from './WeeklyForm.copy'

function bonusOptionsFor(question, allBakers, activeBakers) {
  if (question.type === 'baker_pick') {
    const pool = question.include_eliminated ? allBakers : activeBakers
    return pool.map((b) => b.name)
  }
  if (question.type === 'multiple_choice') {
    return question.options ?? []
  }
  return null // free_text
}

export default function WeeklyForm({ episode, player, allBakers, activeBakers }) {
  const [bonusQuestions, setBonusQuestions] = useState([])
  const [technicalPick, setTechnicalPick] = useState('')
  const [starBakerPick, setStarBakerPick] = useState('')
  const [eliminatedPick, setEliminatedPick] = useState('')
  const [handshakeGuess, setHandshakeGuess] = useState('')
  const [bonusAnswerText, setBonusAnswerText] = useState({})
  const [bonusAnswerBakerIds, setBonusAnswerBakerIds] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [retryCount, setRetryCount] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError(null)
      try {
        const bqs = await fetchBonusQuestions(episode.id)
        const existingAnswer = await fetchMyAnswer(episode.id, player.id)
        const existingBonus = await fetchMyBonusAnswers(bqs.map((b) => b.id), player.id)
        if (cancelled) return
        setBonusQuestions(bqs)
        if (existingAnswer) {
          setTechnicalPick(existingAnswer.technical_pick_id ?? '')
          setStarBakerPick(existingAnswer.star_baker_pick_id ?? '')
          setEliminatedPick(existingAnswer.eliminated_pick_id ?? '')
          setHandshakeGuess(existingAnswer.handshake_guess ?? '')
        }
        const bonusTextMap = {}
        const bonusBakerIdsMap = {}
        for (const ba of existingBonus) {
          bonusTextMap[ba.bonus_question_id] = ba.answer_text
          bonusBakerIdsMap[ba.bonus_question_id] = ba.answer_baker_ids ?? []
        }
        setBonusAnswerText(bonusTextMap)
        setBonusAnswerBakerIds(bonusBakerIdsMap)
      } catch (err) {
        if (!cancelled) setLoadError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [episode.id, player.id, retryCount])

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)

    const { error: answerError } = await supabase.from('answers').upsert(
      {
        episode_id: episode.id,
        player_id: player.id,
        technical_pick_id: technicalPick || null,
        star_baker_pick_id: starBakerPick || null,
        eliminated_pick_id: eliminatedPick || null,
        handshake_guess: handshakeGuess === '' ? null : Number(handshakeGuess),
      },
      { onConflict: 'episode_id,player_id' },
    )

    if (answerError) {
      setError(answerError.message)
      setSaving(false)
      return
    }

    // Always upsert, even a blank answer (as null) — skipping blank fields
    // would silently keep a previously-saved answer in place while the UI
    // told the player their (cleared) answer was saved.
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

    setSaving(false)
    setSaved(true)
  }

  if (loading) return <p>{copy.LOADING_QUESTIONS}</p>

  if (loadError) {
    return (
      <div>
        <p className="error">{copy.LOAD_ERROR_PREFIX}{loadError}</p>
        <button onClick={() => setRetryCount((n) => n + 1)}>{copy.TRY_AGAIN}</button>
      </div>
    )
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2>{copy.episodeTitle(episode)}</h2>
      {episode.intro_note && <p className="muted">{episode.intro_note}</p>}

      <BakerPicker
        groupName="technical-pick"
        label={copy.TECHNICAL_LABEL}
        bakers={activeBakers}
        value={technicalPick}
        onChange={setTechnicalPick}
      />

      <BakerPicker
        groupName="star-baker-pick"
        label={copy.STAR_BAKER_LABEL}
        bakers={activeBakers}
        value={starBakerPick}
        onChange={setStarBakerPick}
      />

      <BakerPicker
        groupName="eliminated-pick"
        label={copy.ELIMINATED_LABEL}
        bakers={activeBakers}
        value={eliminatedPick}
        onChange={setEliminatedPick}
      />

      <label>
        {copy.HANDSHAKE_LABEL}
        <input
          type="number"
          min="0"
          value={handshakeGuess}
          onChange={(e) => setHandshakeGuess(e.target.value)}
        />
      </label>

      {bonusQuestions.map((bq) => {
        if (bq.type === 'baker_multi_pick') {
          const pool = bq.include_eliminated ? allBakers : activeBakers
          return (
            <BakerPicker
              key={bq.id}
              groupName={`bonus-${bq.id}`}
              label={`${bq.prompt} ${copy.bonusPoints(bq.type, bq.points)}`}
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
            {bq.prompt} {copy.bonusPoints(bq.type, bq.points)}
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

      <button type="submit" disabled={saving}>
        {saving ? copy.SAVING : copy.SUBMIT}
      </button>
      {saved && <p>{copy.SAVED}</p>}
      {error && <p className="error">{error}</p>}
    </form>
  )
}
