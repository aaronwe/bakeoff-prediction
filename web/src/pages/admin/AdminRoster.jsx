import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { fetchAllBakers } from '../../lib/queries'
import * as copy from './AdminRoster.copy'

export default function AdminRoster() {
  const [bakers, setBakers] = useState([])
  const [newName, setNewName] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  async function reload() {
    try {
      setBakers(await fetchAllBakers())
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    reload()
  }, [])

  async function handleAdd(e) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    const { error: insertError } = await supabase.from('bakers').insert({ name: newName.trim() })
    if (insertError) {
      setError(insertError.message)
      setSaving(false)
      return
    }
    setNewName('')
    setSaving(false)
    await reload()
  }

  async function toggleEliminated(baker) {
    setError(null)
    const { error: updateError } = await supabase
      .from('bakers')
      .update({ eliminated: !baker.eliminated })
      .eq('id', baker.id)
    if (updateError) {
      setError(updateError.message)
      return
    }
    await reload()
  }

  return (
    <div>
      <h2>{copy.TITLE}</h2>
      <form className="card" onSubmit={handleAdd}>
        <label>
          {copy.ADD_A_BAKER}
          <input value={newName} onChange={(e) => setNewName(e.target.value)} required />
        </label>
        <button type="submit" disabled={saving}>{copy.ADD}</button>
      </form>
      {error && <p className="error">{error}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{copy.NAME}</th>
              <th>{copy.STATUS}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {bakers.map((b) => (
              <tr key={b.id}>
                <td>{b.name}</td>
                <td>
                  <span className={b.eliminated ? 'badge' : 'badge badge-open'}>
                    {b.eliminated ? copy.ELIMINATED : copy.IN_THE_TENT}
                  </span>
                </td>
                <td>
                  <button className="button-ghost" onClick={() => toggleEliminated(b)}>
                    {b.eliminated ? copy.MARK_STILL_IN : copy.MARK_ELIMINATED}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
