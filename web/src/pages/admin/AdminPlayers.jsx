import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { fetchAllPlayers } from '../../lib/queries'
import * as copy from './AdminPlayers.copy'

export default function AdminPlayers() {
  const [players, setPlayers] = useState([])
  const [error, setError] = useState(null)

  async function reload() {
    try {
      setPlayers(await fetchAllPlayers())
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    reload()
  }, [])

  async function handleDelete(player) {
    if (!window.confirm(copy.confirmDelete(player.display_name))) return
    setError(null)
    // .select() forces Postgres to report which rows were actually deleted.
    // Without it, a delete blocked by RLS (no matching policy, or the row
    // just doesn't exist) still comes back with no error and looks
    // identical to a real success — the row would silently stay put with
    // no feedback at all.
    const { data, error: deleteError } = await supabase.from('players').delete().eq('id', player.id).select()
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    if (!data?.length) {
      setError(copy.DELETE_HAD_NO_EFFECT)
      return
    }
    await reload()
  }

  return (
    <div>
      <h2>{copy.TITLE}</h2>
      {error && <p className="error">{error}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{copy.NAME}</th>
              <th>{copy.EMAIL}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id}>
                <td>{p.display_name}</td>
                <td>{p.email}</td>
                <td>
                  <button className="button-danger" onClick={() => handleDelete(p)}>{copy.DELETE}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
