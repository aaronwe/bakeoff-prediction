import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import * as copy from './AdminNewEpisode.copy'

export default function AdminNewEpisode() {
  const [number, setNumber] = useState('')
  const [airDate, setAirDate] = useState('')
  const [title, setTitle] = useState('')
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const { data, error: insertError } = await supabase
      .from('episodes')
      .insert({ number: Number(number), air_date: airDate || null, title: title.trim() || null })
      .select()
      .single()
    if (insertError) {
      setError(insertError.message)
      return
    }
    navigate(`/admin/episodes/${data.number}`)
  }

  return (
    <div>
      <h2>{copy.TITLE}</h2>
      <form className="card" onSubmit={handleSubmit}>
        <label>
          {copy.EPISODE_NUMBER_LABEL}
          <input type="number" min="1" required value={number} onChange={(e) => setNumber(e.target.value)} />
        </label>
        <label>
          {copy.AIR_DATE_LABEL}
          <input type="date" value={airDate} onChange={(e) => setAirDate(e.target.value)} />
        </label>
        <label>
          {copy.EPISODE_TITLE_LABEL}
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <button type="submit">{copy.CREATE}</button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
