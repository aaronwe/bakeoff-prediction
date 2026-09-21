import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchLeaderboardData } from '../lib/queries'

export default function Leaderboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    setError(null)
    fetchLeaderboardData()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [retryCount])

  if (error) {
    return (
      <div>
        <p className="error">Couldn't load the leaderboard: {error}</p>
        <button onClick={() => setRetryCount((n) => n + 1)}>Try again</button>
      </div>
    )
  }

  if (!data) return <p>Loading…</p>

  const { players, scores, episodes } = data

  const totals = players.map((p) => {
    const playerScores = scores.filter((s) => s.player_id === p.id)
    const total = playerScores.reduce((sum, s) => sum + s.total, 0)
    return { player: p, total, playerScores }
  })
  totals.sort((a, b) => b.total - a.total)

  return (
    <div>
      <h2>Standings</h2>
      <table>
        <thead>
          <tr>
            <th>Player</th>
            {episodes.map((ep) => (
              <th key={ep.id}>
                <Link to={`/episodes/${ep.number}`}>E{ep.number}</Link>
              </th>
            ))}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {totals.map(({ player, total, playerScores }) => (
            <tr key={player.id}>
              <td>{player.display_name}</td>
              {episodes.map((ep) => {
                const s = playerScores.find((sc) => sc.episode_id === ep.id)
                return <td key={ep.id}>{s ? s.total : '—'}</td>
              })}
              <td>{total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
