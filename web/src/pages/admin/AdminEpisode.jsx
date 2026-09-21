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
  const { data: ep, error: episodeError } = await supabase
    .from('episodes')
    .select('*')
    .eq('number', episodeNumber)
    .single()
  if (episodeError) throw episodeError
  const [bqs, all, active] = await Promise.all([
    fetchBonusQuestions(ep.id),
    fetchAllBakers(),
    fetchActiveBakers(),
  ])
  return { episode: ep, bonusQuestions: bqs, allBakers: all, activeBakers: active }
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
    const { error: updateError } = await supabase
      .from('episodes')
      .update({ status: 'open' })
      .eq('id', episode.id)
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
        <button onClick={handlePublish}>Publish (open for predictions)</button>
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
    </div>
  )
}
