import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'

export default function AdminNewEpisode() {
  const [number, setNumber] = useState('')
  const [airDate, setAirDate] = useState('')
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const { data, error: insertError } = await supabase
      .from('episodes')
      .insert({ number: Number(number), air_date: airDate || null })
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
      <h2>New episode</h2>
      <form onSubmit={handleSubmit}>
        <label>
          Episode number
          <input type="number" min="1" required value={number} onChange={(e) => setNumber(e.target.value)} />
        </label>
        <label>
          Air date (optional)
          <input type="date" value={airDate} onChange={(e) => setAirDate(e.target.value)} />
        </label>
        <button type="submit">Create</button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
