import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { fetchAllBakers, fetchActiveBakers, fetchBonusQuestions } from '../../lib/queries'
import { computeScoreForPlayer } from '../../lib/scoring'
import BakerPicker from '../../components/BakerPicker'
import * as copy from './AdminEpisode.copy'

function statusBadgeClass(status) {
  if (status === 'open') return 'badge badge-open'
  if (status === 'scored') return 'badge badge-scored'
  return 'badge'
}

function NewBonusQuestionForm({ episodeId, onAdded }) {
  const [prompt, setPrompt] = useState('')
  const [type, setType] = useState('baker_pick')
  const [options, setOptions] = useState('')
  const [includeEliminated, setIncludeEliminated] = useState(false)
  const [points, setPoints] = useState('1')
  const [pickCount, setPickCount] = useState('3')
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const { error: insertError } = await supabase.from('bonus_questions').insert({
      episode_id: episodeId,
      prompt,
      type,
      options:
        type === 'multiple_choice' ? options.split(',').map((s) => s.trim()).filter(Boolean)
        // `|| 1` (not `??`): a cleared field yields Number('') === 0 and a
        // non-numeric one NaN, and a stored pick_count of 0/NaN disables every
        // checkbox for players and admins alike — with no way to edit it after
        // creation.
        : type === 'baker_multi_pick' ? { pick_count: Number(pickCount) || 1 }
        : null,
      include_eliminated: type === 'baker_pick' || type === 'baker_multi_pick' ? includeEliminated : false,
      points: Number(points),
    })
    if (insertError) {
      setError(insertError.message)
      return
    }
    setPrompt('')
    setOptions('')
    setPoints('1')
    setPickCount('3')
    onAdded()
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h4>{copy.ADD_BONUS_QUESTION_TITLE}</h4>
      <label>
        {copy.PROMPT_LABEL}
        <input required value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </label>
      <label>
        {copy.TYPE_LABEL}
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="baker_pick">{copy.TYPE_BAKER_PICK}</option>
          <option value="baker_multi_pick">{copy.TYPE_BAKER_MULTI_PICK}</option>
          <option value="multiple_choice">{copy.TYPE_MULTIPLE_CHOICE}</option>
          <option value="free_text">{copy.TYPE_FREE_TEXT}</option>
        </select>
      </label>
      {(type === 'baker_pick' || type === 'baker_multi_pick') && (
        <label>
          <input
            type="checkbox"
            checked={includeEliminated}
            onChange={(e) => setIncludeEliminated(e.target.checked)}
          />
          {copy.INCLUDE_ELIMINATED_LABEL}
        </label>
      )}
      {type === 'baker_multi_pick' && (
        <label>
          {copy.PICK_COUNT_LABEL}
          <input required type="number" min="1" value={pickCount} onChange={(e) => setPickCount(e.target.value)} />
        </label>
      )}
      {type === 'multiple_choice' && (
        <label>
          {copy.OPTIONS_LABEL}
          <input value={options} onChange={(e) => setOptions(e.target.value)} />
        </label>
      )}
      <label>
        {copy.POINTS_LABEL}
        <input type="number" min="1" value={points} onChange={(e) => setPoints(e.target.value)} />
      </label>
      <button type="submit">{copy.ADD_BONUS_QUESTION}</button>
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
      setError(copy.LOCK_ERROR)
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
    <div className="card">
      <h3>{copy.WEEKLY_EMAIL_TITLE}</h3>
      <label>
        {copy.INTRO_NOTE_LABEL}
        <textarea rows="4" value={introNote} onChange={(e) => setIntroNote(e.target.value)} />
      </label>
      <button onClick={handleSaveNote} disabled={saving}>{copy.SAVE_NOTE}</button>{' '}
      {episode.email_locked_at ? (
        <>
          <span> {copy.LOCKED_MESSAGE}</span>{' '}
          <button className="button-ghost" onClick={handleUnlock} disabled={saving}>{copy.UNLOCK}</button>
          {' '}
          <a
            href={`https://github.com/${import.meta.env.VITE_GITHUB_REPO}/actions/workflows/thursday-send.yml`}
            target="_blank"
            rel="noreferrer"
          >
            {copy.SEND_NOW}
          </a>
        </>
      ) : (
        <button onClick={handleLock} disabled={saving}>{copy.LOCK_AND_READY}</button>
      )}
      {episode.email_sent_at && <p className="muted">{copy.emailSentAt(new Date(episode.email_sent_at).toLocaleString())}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  )
}

function AnswerKeyAndScore({ episode, allBakers, onChanged }) {
  const [technicalWinner, setTechnicalWinner] = useState(episode.technical_winner_baker_id ?? '')
  const [starBaker, setStarBaker] = useState(episode.star_baker_id ?? '')
  const [eliminated, setEliminated] = useState(episode.eliminated_baker_id ?? '')
  const [handshakeCount, setHandshakeCount] = useState(episode.handshake_count ?? '')
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
    <form className="card" onSubmit={handleSubmit}>
      <h3>{copy.ANSWER_KEY_TITLE}</h3>
      <BakerPicker
        groupName="answer-key-technical"
        label={copy.TECHNICAL_LABEL}
        bakers={allBakers}
        value={technicalWinner}
        onChange={setTechnicalWinner}
      />
      <BakerPicker
        groupName="answer-key-star-baker"
        label={copy.STAR_BAKER_LABEL}
        bakers={allBakers}
        value={starBaker}
        onChange={setStarBaker}
      />
      <BakerPicker
        groupName="answer-key-eliminated"
        label={copy.ELIMINATED_LABEL}
        bakers={allBakers}
        value={eliminated}
        onChange={setEliminated}
      />
      <label>
        {copy.HANDSHAKE_COUNT_LABEL}
        <input type="number" min="0" value={handshakeCount} onChange={(e) => setHandshakeCount(e.target.value)} />
      </label>
      <p className="muted">{copy.SCORING_NOTE}</p>
      <button type="submit" disabled={scoring}>
        {scoring ? copy.SCORING : episode.status === 'scored' ? copy.RE_SCORE : copy.ENTER_ANSWER_KEY_AND_SCORE}
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
    <div className="card">
      <h3>{copy.MANUAL_OVERRIDES_TITLE}</h3>
      <table>
        <thead>
          <tr><th>{copy.PLAYER}</th><th>{copy.TOTAL}</th><th>{copy.OVERRIDDEN}</th><th></th></tr>
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
                <td>{s?.manually_overridden ? copy.YES : copy.NO}</td>
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

  if (loading) return <p>{copy.LOADING}</p>

  if (loadError) {
    return (
      <div>
        <p className="error">{copy.LOAD_ERROR_PREFIX}{loadError}</p>
        <button onClick={() => setRetryCount((n) => n + 1)}>{copy.TRY_AGAIN}</button>
      </div>
    )
  }

  if (!episode) return <p>{copy.EPISODE_NOT_FOUND}</p>

  return (
    <div>
      <h2>
        {copy.episodeHeading(episode.number)}{' '}
        <span className={statusBadgeClass(episode.status)}>{episode.status}</span>
      </h2>
      {error && <p className="error">{error}</p>}

      {episode.status === 'draft' && (
        <button onClick={handlePublish} disabled={publishing}>{copy.PUBLISH}</button>
      )}

      <h3>{copy.BONUS_QUESTIONS_TITLE}</h3>
      <ul>
        {bonusQuestions.map((bq) => (
          <li key={bq.id}>{copy.bonusQuestionLine(bq)}</li>
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
          allBakers={allBakers}
          onChanged={reload}
        />
      )}
      <ManualOverrides episode={episode} players={players} scores={scores} onChanged={reload} />
    </div>
  )
}
