import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { fetchAllBakers, fetchActiveBakers, fetchBonusQuestions, fetchDraftAnswerKey } from '../../lib/queries'
import { computeScoreForPlayer } from '../../lib/scoring'
import { resolveEpisodeAnswerKeyDefaults } from '../../lib/draftAnswerKeys'
import BakerPicker from '../../components/BakerPicker'
import BonusQuestionsManager from './BonusQuestionsManager'
import * as copy from './AdminEpisode.copy'

function statusBadgeClass(status) {
  if (status === 'open') return 'badge badge-open'
  if (status === 'scored') return 'badge badge-scored'
  return 'badge'
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

function EpisodeTitleEditor({ episode, onChanged }) {
  const [title, setTitle] = useState(episode.title ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setTitle(episode.title ?? '')
  }, [episode.id, episode.title])

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const { error: updateError } = await supabase
      .from('episodes')
      .update({ title: title.trim() || null })
      .eq('id', episode.id)
    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    onChanged()
  }

  return (
    <form className="card" onSubmit={handleSave}>
      <label>
        {copy.TITLE_LABEL}
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <button type="submit" disabled={saving}>{copy.SAVE_TITLE}</button>
      {error && <p className="error">{error}</p>}
    </form>
  )
}

const workflowUrl = (file) => `https://github.com/${import.meta.env.VITE_GITHUB_REPO}/actions/workflows/${file}`

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
      <label className="intro-note-label">
        {copy.INTRO_NOTE_LABEL}
        <textarea rows="8" value={introNote} onChange={(e) => setIntroNote(e.target.value)} />
      </label>
      <div className="weekly-email-actions">
        <button onClick={handleSaveNote} disabled={saving}>{copy.SAVE_NOTE}</button>
        {episode.email_locked_at ? (
          <>
            <button className="button-ghost" onClick={handleUnlock} disabled={saving}>{copy.UNLOCK}</button>
            <span className="muted">{copy.LOCKED_MESSAGE}</span>
          </>
        ) : (
          <button onClick={handleLock} disabled={saving}>{copy.LOCK_AND_READY}</button>
        )}
      </div>
      <ul className="weekly-email-links">
        <li>
          <a href={workflowUrl('test-weekly-email.yml')} target="_blank" rel="noreferrer">{copy.SEND_TEST}</a>
        </li>
        {episode.email_locked_at && (
          <li>
            <a href={workflowUrl('thursday-send.yml')} target="_blank" rel="noreferrer">{copy.SEND_NOW}</a>
          </li>
        )}
      </ul>
      <p className="note">{copy.RUN_WORKFLOW_HINT}</p>
      {episode.email_sent_at && <p className="muted">{copy.emailSentAt(new Date(episode.email_sent_at).toLocaleString())}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  )
}

function RegularQuestionsToggle({ episode, onChanged }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleToggle(field, checked) {
    setError(null)
    setSaving(true)
    const { error: updateError } = await supabase
      .from('episodes')
      .update({ [field]: checked })
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
      <h3>{copy.REGULAR_QUESTIONS_TITLE}</h3>
      <p className="muted">{copy.REGULAR_QUESTIONS_NOTE}</p>
      <label>
        <input
          type="checkbox"
          checked={episode.technical_enabled !== false}
          disabled={saving}
          onChange={(e) => handleToggle('technical_enabled', e.target.checked)}
        />
        {' '}{copy.TECHNICAL_LABEL}
      </label>
      <label>
        <input
          type="checkbox"
          checked={episode.star_baker_enabled !== false}
          disabled={saving}
          onChange={(e) => handleToggle('star_baker_enabled', e.target.checked)}
        />
        {' '}{copy.STAR_BAKER_LABEL}
      </label>
      <label>
        <input
          type="checkbox"
          checked={episode.eliminated_enabled !== false}
          disabled={saving}
          onChange={(e) => handleToggle('eliminated_enabled', e.target.checked)}
        />
        {' '}{copy.ELIMINATED_LABEL}
      </label>
      <label>
        <input
          type="checkbox"
          checked={episode.handshake_enabled !== false}
          disabled={saving}
          onChange={(e) => handleToggle('handshake_enabled', e.target.checked)}
        />
        {' '}{copy.HANDSHAKE_COUNT_LABEL}
      </label>
      {error && <p className="error">{error}</p>}
    </div>
  )
}

function AnswerKeyAndScore({ episode, allBakers, draftAnswerKey, onChanged }) {
  const defaults = resolveEpisodeAnswerKeyDefaults(episode, draftAnswerKey)
  const [technicalWinner, setTechnicalWinner] = useState(defaults.technicalWinner)
  const [starBaker, setStarBaker] = useState(defaults.starBaker)
  const [eliminated, setEliminated] = useState(defaults.eliminated)
  const [handshakeCount, setHandshakeCount] = useState(defaults.handshakeCount)
  const [error, setError] = useState(null)
  const [summary, setSummary] = useState(null)
  // Discriminates which action is in flight (mirrors IntroNoteAndLock's
  // single `saving` flag, but as a tri-state): both actions write to
  // different tables but mutate this component's shared form fields, so
  // letting one fire while the other is in flight risks a stale-value race,
  // and the button labels need to know which action is actually running.
  const [busyAction, setBusyAction] = useState(null) // null | 'draft' | 'lock'
  const busy = busyAction !== null

  async function handleSaveDraft() {
    setBusyAction('draft')
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
    setBusyAction(null)
    if (draftError) {
      setError(draftError.message)
      return
    }
    setSummary(copy.DRAFT_SAVED)
    onChanged()
  }

  function handleFormSubmit(e) {
    e.preventDefault()
    handleSaveDraft()
  }

  function handleLockAndScoreClick() {
    if (episode.status === 'open' && !window.confirm(copy.LOCK_AND_SCORE_CONFIRM)) return
    handleLockAndScore()
  }

  async function handleLockAndScore() {
    setBusyAction('lock')
    setError(null)
    setSummary(null)

    // Must set the answer key and status: 'scored' in this one update — the
    // episodes_answer_key_only_when_scored constraint rejects a non-null
    // answer key on any row that isn't already 'scored'.
    const { error: episodeError } = await supabase
      .from('episodes')
      .update({
        technical_winner_baker_id: episode.technical_enabled !== false ? (technicalWinner || null) : null,
        star_baker_id: episode.star_baker_enabled !== false ? (starBaker || null) : null,
        eliminated_baker_id: episode.eliminated_enabled !== false ? (eliminated || null) : null,
        handshake_count: episode.handshake_enabled !== false ? (handshakeCount === '' ? null : Number(handshakeCount)) : null,
        status: 'scored',
      })
      .eq('id', episode.id)

    if (episodeError) {
      setError(episodeError.message)
      setBusyAction(null)
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
      setBusyAction(null)
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
      setBusyAction(null)
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
        setBusyAction(null)
        return
      }
      recomputed += 1
    }

    setSummary(copy.scoreSummary(recomputed, preserved))
    setBusyAction(null)
    onChanged()
  }

  return (
    <form className="card" onSubmit={handleFormSubmit}>
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
      <button type="submit" disabled={busy}>
        {busyAction === 'draft' ? copy.SAVING_DRAFT : copy.SAVE_DRAFT}
      </button>{' '}
      <button type="button" onClick={handleLockAndScoreClick} disabled={busy}>
        {busyAction === 'lock' ? copy.SCORING : episode.status === 'scored' ? copy.RE_SCORE : copy.ENTER_ANSWER_KEY_AND_SCORE}
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
  const navigate = useNavigate()
  const [episode, setEpisode] = useState(null)
  const [bonusQuestions, setBonusQuestions] = useState([])
  const [allBakers, setAllBakers] = useState([])
  const [activeBakers, setActiveBakers] = useState([])
  const [players, setPlayers] = useState([])
  const [scores, setScores] = useState([])
  const [draftAnswerKey, setDraftAnswerKey] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [retryCount, setRetryCount] = useState(0)
  const [error, setError] = useState(null)
  const [publishing, setPublishing] = useState(false)
  const [deleting, setDeleting] = useState(false)

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
        setDraftAnswerKey(result.draftAnswerKey)
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
      setDraftAnswerKey(result.draftAnswerKey)
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

  async function handleDelete() {
    if (!window.confirm(copy.confirmDeleteEpisode(episode.number))) return
    setError(null)
    setDeleting(true)
    // .select() forces Postgres to report which rows were actually deleted.
    // Without it, a delete blocked by RLS or a foreign key look identical to
    // a real success (no error, just zero rows affected) — the admin would
    // stay on this page with no feedback that nothing happened.
    const { data, error: deleteError } = await supabase.from('episodes').delete().eq('id', episode.id).select()
    setDeleting(false)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    if (!data?.length) {
      setError(copy.DELETE_HAD_NO_EFFECT)
      return
    }
    navigate('/admin')
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
        {copy.episodeHeading(episode)}{' '}
        <span className={statusBadgeClass(episode.status)}>{episode.status}</span>
      </h2>
      {error && <p className="error">{error}</p>}

      {episode.status === 'draft' && (
        <p>
          <button onClick={handlePublish} disabled={publishing}>{copy.PUBLISH}</button>
        </p>
      )}

      <EpisodeTitleEditor episode={episode} onChanged={reload} />
      <RegularQuestionsToggle episode={episode} onChanged={reload} />

      <h3>{copy.BONUS_QUESTIONS_TITLE}</h3>
      <BonusQuestionsManager episode={episode} bonusQuestions={bonusQuestions} onChanged={reload} />

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
          draftAnswerKey={draftAnswerKey}
          onChanged={reload}
        />
      )}
      <ManualOverrides episode={episode} players={players} scores={scores} onChanged={reload} />

      <div className="card">
        <h3>{copy.DANGER_ZONE_TITLE}</h3>
        <button className="button-danger" onClick={handleDelete} disabled={deleting}>
          {copy.DELETE_EPISODE}
        </button>
      </div>
    </div>
  )
}
