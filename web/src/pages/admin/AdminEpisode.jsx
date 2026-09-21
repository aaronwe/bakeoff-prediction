import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { fetchAllBakers, fetchActiveBakers, fetchBonusQuestions } from '../../lib/queries'

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
  if (!ep) return { episode: null, bonusQuestions: [], allBakers: [], activeBakers: [] }
  const [bqs, all, active] = await Promise.all([
    fetchBonusQuestions(ep.id),
    fetchAllBakers(),
    fetchActiveBakers(),
  ])
  return { episode: ep, bonusQuestions: bqs, allBakers: all, activeBakers: active }
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

export default function AdminEpisode() {
  const { number } = useParams()
  const [episode, setEpisode] = useState(null)
  const [bonusQuestions, setBonusQuestions] = useState([])
  const [allBakers, setAllBakers] = useState([])
  const [activeBakers, setActiveBakers] = useState([])
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
    </div>
  )
}
