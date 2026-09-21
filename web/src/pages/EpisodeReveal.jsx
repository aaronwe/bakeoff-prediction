import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchEpisodeRevealData } from '../lib/queries'

function bakerName(bakers, id) {
  return bakers.find((b) => b.id === id)?.name ?? '—'
}

export default function EpisodeReveal() {
  const { number } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(null)
    fetchEpisodeRevealData(Number(number))
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [number])

  if (error) return <p className="error">{error}</p>
  if (!data) return <p>Loading…</p>

  const { episode, bakers, players, answers, bonusQuestions, bonusAnswers, scores } = data

  if (episode.status !== 'scored') {
    return <p>Episode {episode.number} hasn't been scored yet — check back after Wednesday.</p>
  }

  return (
    <div>
      <h2>Episode {episode.number} results</h2>
      <p>
        Technical winner: {bakerName(bakers, episode.technical_winner_baker_id)} · Star Baker:{' '}
        {bakerName(bakers, episode.star_baker_id)} · Went home: {bakerName(bakers, episode.eliminated_baker_id)} ·
        Handshakes: {episode.handshake_count}
      </p>

      <table>
        <thead>
          <tr>
            <th>Player</th>
            <th>Technical</th>
            <th>Star Baker</th>
            <th>Eliminated</th>
            <th>Handshakes</th>
            {bonusQuestions.map((bq) => (
              <th key={bq.id}>{bq.prompt}</th>
            ))}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => {
            const answer = answers.find((a) => a.player_id === p.id)
            const score = scores.find((s) => s.player_id === p.id)
            if (!answer) return null
            return (
              <tr key={p.id}>
                <td>{p.display_name}</td>
                <td>{bakerName(bakers, answer.technical_pick_id)}</td>
                <td>{bakerName(bakers, answer.star_baker_pick_id)}</td>
                <td>{bakerName(bakers, answer.eliminated_pick_id)}</td>
                <td>{answer.handshake_guess ?? '—'}</td>
                {bonusQuestions.map((bq) => {
                  const ba = bonusAnswers.find((a) => a.bonus_question_id === bq.id && a.player_id === p.id)
                  return <td key={bq.id}>{ba?.answer_text ?? '—'}</td>
                })}
                <td>{score ? score.total : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
