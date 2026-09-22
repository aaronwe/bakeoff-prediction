import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import * as copy from './AdminDashboard.copy'

function statusBadgeClass(status) {
  if (status === 'open') return 'badge badge-open'
  if (status === 'scored') return 'badge badge-scored'
  return 'badge'
}

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
      <h2>{copy.TITLE}</h2>
      <p>
        <Link to="/admin/roster">{copy.MANAGE_ROSTER}</Link>
      </p>
      <p>
        <Link to="/admin/episodes/new">{copy.CREATE_EPISODE}</Link>
      </p>
      <p>
        <Link to="/admin/bonus-questions">{copy.GRADE_BONUS_QUESTIONS}</Link>
      </p>
      {error && <p className="error">{copy.LOAD_ERROR_PREFIX}{error}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{copy.EPISODE}</th>
              <th>{copy.STATUS}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {episodes.map((ep) => (
              <tr key={ep.id}>
                <td>{ep.number}</td>
                <td><span className={statusBadgeClass(ep.status)}>{ep.status}</span></td>
                <td>
                  <Link to={`/admin/episodes/${ep.number}`}>{copy.MANAGE}</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
