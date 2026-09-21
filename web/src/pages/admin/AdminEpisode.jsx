import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { fetchAllBakers, fetchActiveBakers, fetchBonusQuestions } from '../../lib/queries'
import { computeScoreForPlayer } from '../../lib/scoring'

function NewBonusQuestionForm({ episodeId, onAdded }) {
  const [prompt, setPrompt] = useState('')
  const [type, setType] = useState('baker_pick')
  const [options, setOptions] = useState('')
  const [includeEliminated, setIncludeEliminated] = useState(false)
  const [points, setPoints] = useState('1')
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const { error: insertError } = await supabase.from('bonus_questions').insert({
      episode_id: episodeId,
      prompt,
      type,
      options: type === 'multiple_choice' ? options.split(',').map((s) => s.trim()).filter(Boolean) : null,
      include_eliminated: type === 'baker_pick' ? includeEliminated : false,
      points: Number(points),
    })
    if (insertError) {
      setError(insertError.message)
      return
    }
    setPrompt('')
    setOptions('')
    setPoints('1')
    onAdded()
  }

  return (
    <form onSubmit={handleSubmit}>
      <h4>Add a bonus question</h4>
      <label>
        Prompt
        <input required value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </label>
      <label>
        Type
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="baker_pick">Pick a baker</option>
          <option value="multiple_choice">Multiple choice (custom options)</option>
          <option value="free_text">Free text / number</option>
        </select>
      </label>
      {type === 'baker_pick' && (
        <label>
          <input
            type="checkbox"
            checked={includeEliminated}
            onChange={(e) => setIncludeEliminated(e.target.checked)}
          />
          Include eliminated bakers
        </label>
      )}
      {type === 'multiple_choice' && (
        <label>
          Options (comma-separated)
          <input value={options} onChange={(e) => setOptions(e.target.value)} />
        </label>
      )}
      <label>
        Points
        <input type="number" min="1" value={points} onChange={(e) => setPoints(e.target.value)} />
      </label>
      <button type="submit">Add bonus question</button>
      {error && <p className="error">{error}</p>}
    </form>
  )
}

// Fetches everything the admin episode page needs and either returns it or
// throws — shared by the mount/param-change effect below (which needs a
// `cancelled` guard, since `number` can change while this component stays
// mounted) and by reload(), which callers invoke directly after a mutation.
// Defined at module scope (taking episodeNumber explicitly, rather than
// closing over component state) so its identity is stable across renders.
async function loadEpisodeData(episodeNumber) {
  // maybeSingle, not single: a nonexistent episode number should surface as
  // `episode: null` (a normal, recoverable "not found" render) rather than
  // a thrown fetch error that leaves the page stuck on the error/retry view
  // forever, since retrying can never make a bad episode number exist.
  const { data: ep, error: episodeError } = await supabase
    .from('episodes')
    .select('*')
    .eq('number', episodeNumber)
    .maybeSingle()
  if (episodeError) throw episodeError
  if (!ep) {
    return { episode: null, bonusQuestions: [], allBakers: [], activeBakers: [], players: [], scores: [] }
  }
  const [bqs, all, active, { data: playerRows, error: playersError }, { data: scoreRows, error: scoresError }] =
    await Promise.all([
      fetchBonusQuestions(ep.id),
      fetchAllBakers(),
      fetchActiveBakers(),
      supabase.from('players').select('*'),
      supabase.from('scores').select('*').eq('episode_id', ep.id),
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
  }
}

function IntroNoteAndLock({ episode, onChanged }) {
  const [introNote, setIntroNote] = useState(episode.intro_note ?? '')
  const [error, setError] = useState(null)
  // One flag shared by all three actions, not a separate one per button:
  // they all write to the same episode row (intro_note and/or
  // email_locked_at), so letting one fire while another is still in flight
  // risks a last-write-wins race that silently reverts a just-saved note.
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setIntroNote(episode.intro_note ?? '')
  }, [episode.id, episode.intro_note])

  async function handleSaveNote() {
    setSaving(true)
    setError(null)
    const { error: updateError } = await supabase
      .from('episodes')
      .update({ intro_note: introNote })
      .eq('id', episode.id)
    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    onChanged()
  }

  async function handleLock() {
    setError(null)
    if (!introNote.trim()) {
      setError('Write an intro note before locking.')
      return
    }
    setSaving(true)
    const { error: updateError } = await supabase
      .from('episodes')
      .update({ intro_note: introNote, email_locked_at: new Date().toISOString() })
      .eq('id', episode.id)
    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    onChanged()
  }

  async function handleUnlock() {
    setError(null)
    setSaving(true)
    const { error: updateError } = await supabase
      .from('episodes')
      .update({ email_locked_at: null })
      .eq('id', episode.id)
    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    onChanged()
  }

  return (
    <div>
      <h3>Weekly email</h3>
      <label>
        Intro note (shown at the top of Thursday's email)
        <textarea rows="4" value={introNote} onChange={(e) => setIntroNote(e.target.value)} />
      </label>
      <button onClick={handleSaveNote} disabled={saving}>Save note</button>{' '}
      {episode.email_locked_at ? (
        <>
          <span> Locked and ready to send.</span>{' '}
          <button onClick={handleUnlock} disabled={saving}>Unlock</button>
          {' '}
          <a
            href={`https://github.com/${import.meta.env.VITE_GITHUB_REPO}/actions/workflows/thursday-send.yml`}
            target="_blank"
            rel="noreferrer"
          >
            Send now (opens GitHub Actions — click "Run workflow")
          </a>
        </>
      ) : (
        <button onClick={handleLock} disabled={saving}>Lock &amp; ready to send</button>
      )}
      {episode.email_sent_at && <p>Email sent at {new Date(episode.email_sent_at).toLocaleString()}.</p>}
      {error && <p className="error">{error}</p>}
    </div>
  )
}

function AnswerKeyAndScore({ episode, bonusQuestions, allBakers, onChanged }) {
  const [technicalWinner, setTechnicalWinner] = useState(episode.technical_winner_baker_id ?? '')
  const [starBaker, setStarBaker] = useState(episode.star_baker_id ?? '')
  const [eliminated, setEliminated] = useState(episode.eliminated_baker_id ?? '')
  const [handshakeCount, setHandshakeCount] = useState(episode.handshake_count ?? '')
  const [bonusCorrect, setBonusCorrect] = useState(
    Object.fromEntries(bonusQuestions.map((bq) => [bq.id, bq.correct_answer ?? ''])),
  )
  const [error, setError] = useState(null)
  const [summary, setSummary] = useState(null)
  const [scoring, setScoring] = useState(false)

  async function handleSubmit(e) {
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

    setSummary(`${recomputed} player score(s) recomputed, ${preserved} manual override(s) preserved.`)
    setScoring(false)
    onChanged()
  }

  return (
    <form onSubmit={handleSubmit}>
      <h3>Answer key &amp; scoring</h3>
      <label>
        Technical challenge winner
        <select value={technicalWinner} onChange={(e) => setTechnicalWinner(e.target.value)}>
          <option value="">Select a baker</option>
          {allBakers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <label>
        Star Baker
        <select value={starBaker} onChange={(e) => setStarBaker(e.target.value)}>
          <option value="">Select a baker</option>
          {allBakers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <label>
        Who went home
        <select value={eliminated} onChange={(e) => setEliminated(e.target.value)}>
          <option value="">Select a baker</option>
          {allBakers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <label>
        Handshake count
        <input type="number" min="0" value={handshakeCount} onChange={(e) => setHandshakeCount(e.target.value)} />
      </label>
      {bonusQuestions.map((bq) => (
        <label key={bq.id}>
          Correct answer: {bq.prompt}
          <input
            value={bonusCorrect[bq.id] ?? ''}
            onChange={(e) => setBonusCorrect((prev) => ({ ...prev, [bq.id]: e.target.value }))}
          />
        </label>
      ))}
      <p>
        Nothing here is saved until you submit — the database won't accept a partial answer key while the
        episode is still open, so entering the key and scoring happen together in one step.
      </p>
      <button type="submit" disabled={scoring}>
        {scoring ? 'Scoring…' : episode.status === 'scored' ? 'Re-score' : 'Enter answer key & score'}
      </button>
      {summary && <p>{summary}</p>}
      {error && <p className="error">{error}</p>}
    </form>
  )
}

// scores comes from AdminEpisode's loadEpisodeData/reload — not fetched
// locally — so it's always current after AnswerKeyAndScore recomputes
// scores and calls onChanged(). A locally-fetched copy here would go stale
// the moment scoring runs (mount effects don't re-run on a sibling's
// reload), and blurring an input showing a stale total would silently
// upsert that stale value over the real, just-computed one.
function ManualOverrides({ episode, players, scores, onChanged }) {
  const [error, setError] = useState(null)

  async function handleOverride(playerId, newTotal) {
    setError(null)
    const existing = scores.find((s) => s.player_id === playerId)
    const { error: upsertError } = await supabase.from('scores').upsert(
      {
        episode_id: episode.id,
        player_id: playerId,
        points_breakdown: existing?.points_breakdown ?? {},
        total: Number(newTotal),
        manually_overridden: true,
      },
      { onConflict: 'episode_id,player_id' },
    )
    if (upsertError) {
      setError(upsertError.message)
      return
    }
    await onChanged()
  }

  if (episode.status !== 'scored') return null

  return (
    <div>
      <h3>Manual overrides</h3>
      <table>
        <thead>
          <tr><th>Player</th><th>Total</th><th>Overridden?</th><th></th></tr>
        </thead>
        <tbody>
          {players.map((p) => {
            const s = scores.find((sc) => sc.player_id === p.id)
            return (
              <tr key={p.id}>
                <td>{p.display_name}</td>
                <td>
                  <input
                    // Keyed by the displayed total, not just p.id: this is an
                    // uncontrolled input (defaultValue), which React only
                    // applies on mount — without this, a fresh total flowing
                    // in from a recompute wouldn't visually update an input
                    // the admin isn't actively editing, and blurring it would
                    // re-submit the stale number shown.
                    key={`${p.id}-${s?.total ?? 0}`}
                    type="number"
                    defaultValue={s?.total ?? 0}
                    onBlur={(e) => handleOverride(p.id, e.target.value)}
                  />
                </td>
                <td>{s?.manually_overridden ? 'Yes' : 'No'}</td>
                <td></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {error && <p className="error">{error}</p>}
    </div>
  )
}

export default function AdminEpisode() {
  const { number } = useParams()
  const [episode, setEpisode] = useState(null)
  const [bonusQuestions, setBonusQuestions] = useState([])
  const [allBakers, setAllBakers] = useState([])
  const [activeBakers, setActiveBakers] = useState([])
  const [players, setPlayers] = useState([])
  const [scores, setScores] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [retryCount, setRetryCount] = useState(0)
  const [error, setError] = useState(null)
  const [publishing, setPublishing] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    loadEpisodeData(Number(number))
      .then((result) => {
        if (cancelled) return
        setEpisode(result.episode)
        setBonusQuestions(result.bonusQuestions)
        setAllBakers(result.allBakers)
        setActiveBakers(result.activeBakers)
        setPlayers(result.players)
        setScores(result.scores)
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
  }, [number, retryCount])

  async function reload() {
    try {
      const result = await loadEpisodeData(Number(number))
      setEpisode(result.episode)
      setBonusQuestions(result.bonusQuestions)
      setAllBakers(result.allBakers)
      setActiveBakers(result.activeBakers)
      setPlayers(result.players)
      setScores(result.scores)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handlePublish() {
    setError(null)
    setPublishing(true)
    // .eq('status', 'draft') guards against a double-click racing two
    // publishes; the disabled button below is the first line of defense,
    // this is the one that actually matters.
    const { error: updateError } = await supabase
      .from('episodes')
      .update({ status: 'open' })
      .eq('id', episode.id)
      .eq('status', 'draft')
    setPublishing(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    await reload()
  }

  if (loading) return <p>Loading…</p>

  if (loadError) {
    return (
      <div>
        <p className="error">Couldn't load this episode: {loadError}</p>
        <button onClick={() => setRetryCount((n) => n + 1)}>Try again</button>
      </div>
    )
  }

  if (!episode) return <p>Episode not found.</p>

  return (
    <div>
      <h2>Episode {episode.number} — {episode.status}</h2>
      {error && <p className="error">{error}</p>}

      {episode.status === 'draft' && (
        <button onClick={handlePublish} disabled={publishing}>Publish (open for predictions)</button>
      )}

      <h3>Bonus questions</h3>
      <ul>
        {bonusQuestions.map((bq) => (
          <li key={bq.id}>
            {bq.prompt} — {bq.type} — {bq.points} pt{bq.points === 1 ? '' : 's'}
          </li>
        ))}
      </ul>
      <NewBonusQuestionForm episodeId={episode.id} onAdded={reload} />

      {episode.status !== 'draft' && <IntroNoteAndLock episode={episode} onChanged={reload} />}
      {episode.status !== 'draft' && (
        // key={episode.id}, not a resync effect: this component's local form
        // state must survive a reload() triggered by a sibling action on this
        // same page (adding a bonus question, locking the email, etc.) without
        // clobbering whatever the admin is mid-typing — it should only reset
        // when the admin actually navigates to a different episode.
        <AnswerKeyAndScore
          key={episode.id}
          episode={episode}
          bonusQuestions={bonusQuestions}
          allBakers={allBakers}
          onChanged={reload}
        />
      )}
      <ManualOverrides episode={episode} players={players} scores={scores} onChanged={reload} />
    </div>
  )
}
