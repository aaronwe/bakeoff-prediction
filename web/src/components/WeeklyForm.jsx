import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import {
  fetchBonusQuestions,
  fetchMyAnswer,
  fetchMyBonusAnswers,
} from '../lib/queries'

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
        const bonusMap = {}
        for (const ba of existingBonus) bonusMap[ba.bonus_question_id] = ba.answer_text
        setBonusAnswerText(bonusMap)
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

    setSaving(false)
    setSaved(true)
  }

  if (loading) return <p>Loading this week's questions…</p>

  if (loadError) {
    return (
      <div>
        <p className="error">Couldn't load this week's questions: {loadError}</p>
        <button onClick={() => setRetryCount((n) => n + 1)}>Try again</button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Episode {episode.number}</h2>
      {episode.intro_note && <p>{episode.intro_note}</p>}

      <label>
        Technical challenge winner
        <select value={technicalPick} onChange={(e) => setTechnicalPick(e.target.value)}>
          <option value="">Select a baker</option>
          {activeBakers.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </label>

      <label>
        Star Baker
        <select value={starBakerPick} onChange={(e) => setStarBakerPick(e.target.value)}>
          <option value="">Select a baker</option>
          {activeBakers.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </label>

      <label>
        Who goes home
        <select value={eliminatedPick} onChange={(e) => setEliminatedPick(e.target.value)}>
          <option value="">Select a baker</option>
          {activeBakers.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </label>

      <label>
        Paul Hollywood handshakes
        <input
          type="number"
          min="0"
          value={handshakeGuess}
          onChange={(e) => setHandshakeGuess(e.target.value)}
        />
      </label>

      {bonusQuestions.map((bq) => {
        const options = bonusOptionsFor(bq, allBakers, activeBakers)
        return (
          <label key={bq.id}>
            {bq.prompt} ({bq.points} pt{bq.points === 1 ? '' : 's'})
            {options ? (
              <select
                value={bonusAnswerText[bq.id] ?? ''}
                onChange={(e) => setBonusAnswerText((prev) => ({ ...prev, [bq.id]: e.target.value }))}
              >
                <option value="">Select an option</option>
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
        {saving ? 'Saving…' : 'Submit answers'}
      </button>
      {saved && <p>Saved! You can come back and change your answers until scoring.</p>}
      {error && <p className="error">{error}</p>}
    </form>
  )
}
