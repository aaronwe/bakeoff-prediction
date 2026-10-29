import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { fetchAllPlayers } from '../../lib/queries'
import * as copy from './AdminPlayers.copy'

export default function AdminPlayers() {
  const [players, setPlayers] = useState([])
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [selected, setSelected] = useState([])
  const [keepId, setKeepId] = useState(null)
  const [merging, setMerging] = useState(false)

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
    setNotice(null)
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
    setSelected((prev) => prev.filter((id) => id !== player.id))
    await reload()
  }

  function toggleSelected(player) {
    setSelected((prev) => {
      if (prev.includes(player.id)) return prev.filter((id) => id !== player.id)
      if (prev.length >= 2) return prev
      return [...prev, player.id]
    })
  }

  // Default to keeping whichever of the pair signed up first; the admin can
  // flip it. Re-derived whenever the checked pair changes.
  const pair = selected.map((id) => players.find((p) => p.id === id)).filter(Boolean)
  const effectiveKeepId =
    pair.length === 2 && pair.some((p) => p.id === keepId)
      ? keepId
      : [...pair].sort((a, b) => a.created_at.localeCompare(b.created_at))[0]?.id

  async function handleMerge() {
    const keep = pair.find((p) => p.id === effectiveKeepId)
    const drop = pair.find((p) => p.id !== effectiveKeepId)
    if (!keep || !drop) return
    if (!window.confirm(copy.confirmMerge(keep.display_name, keep.email, drop.display_name, drop.email))) return
    setError(null)
    setNotice(null)
    setMerging(true)
    const { data, error: mergeError } = await supabase.rpc('merge_players', {
      keep_id: keep.id,
      drop_id: drop.id,
    })
    setMerging(false)
    if (mergeError) {
      setError(`${copy.MERGE_FAILED} ${mergeError.message}`)
      return
    }
    setSelected([])
    setKeepId(null)
    setNotice(copy.mergeDone(keep.display_name, data?.overlapping_episodes ?? 0))
    await reload()
  }

  return (
    <div>
      <h2>{copy.TITLE}</h2>
      {error && <p className="error">{error}</p>}
      {notice && <p>{notice}</p>}
      <div className="card">
        <h3>{copy.MERGE_TITLE}</h3>
        <p>{copy.MERGE_HELP}</p>
        {pair.length < 2 ? (
          <p>{copy.MERGE_PICK_TWO}</p>
        ) : (
          <>
            {pair.map((p) => (
              <label key={p.id}>
                <input
                  type="radio"
                  name="keep-player"
                  checked={p.id === effectiveKeepId}
                  onChange={() => setKeepId(p.id)}
                />
                {copy.KEEP}: {p.display_name} ({p.email})
              </label>
            ))}
            <button onClick={handleMerge} disabled={merging}>
              {merging ? copy.MERGING : copy.MERGE}
            </button>
          </>
        )}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>{copy.NAME}</th>
              <th>{copy.EMAIL}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.includes(p.id)}
                    disabled={!selected.includes(p.id) && selected.length >= 2}
                    onChange={() => toggleSelected(p)}
                    aria-label={`Select ${p.display_name}`}
                  />
                </td>
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
