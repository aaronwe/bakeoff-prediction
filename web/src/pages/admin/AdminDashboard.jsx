import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'

export default function AdminDashboard() {
  const [episodes, setEpisodes] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    supabase
      .from('episodes')
      .select('*')
      .order('number', { ascending: false })
      .then(({ data, error: fetchError }) => {
        if (cancelled) return
        if (fetchError) {
          setError(fetchError.message)
          return
        }
        setEpisodes(data ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div>
      <h2>Admin</h2>
      <p>
        <Link to="/admin/roster">Manage baker roster</Link>
      </p>
      <p>
        <Link to="/admin/episodes/new">Create new episode</Link>
      </p>
      {error && <p className="error">Couldn't load episodes: {error}</p>}
      <table>
        <thead>
          <tr>
            <th>Episode</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {episodes.map((ep) => (
            <tr key={ep.id}>
              <td>{ep.number}</td>
              <td>{ep.status}</td>
              <td>
                <Link to={`/admin/episodes/${ep.number}`}>Manage</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
