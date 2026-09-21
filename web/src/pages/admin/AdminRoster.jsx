import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { fetchAllBakers } from '../../lib/queries'

export default function AdminRoster() {
  const [bakers, setBakers] = useState([])
  const [newName, setNewName] = useState('')
  const [error, setError] = useState(null)

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
    const { error: insertError } = await supabase.from('bakers').insert({ name: newName })
    if (insertError) {
      setError(insertError.message)
      return
    }
    setNewName('')
    await reload()
  }

  async function toggleEliminated(baker) {
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
      <h2>Baker roster</h2>
      <form onSubmit={handleAdd}>
        <label>
          Add a baker
          <input value={newName} onChange={(e) => setNewName(e.target.value)} required />
        </label>
        <button type="submit">Add</button>
      </form>
      {error && <p className="error">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {bakers.map((b) => (
            <tr key={b.id}>
              <td>{b.name}</td>
              <td>{b.eliminated ? 'Eliminated' : 'In the tent'}</td>
              <td>
                <button onClick={() => toggleEliminated(b)}>
                  {b.eliminated ? 'Mark still in' : 'Mark eliminated'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
