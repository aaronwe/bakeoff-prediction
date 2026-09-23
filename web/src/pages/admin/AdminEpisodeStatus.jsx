import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchEpisodeStatusData } from '../../lib/queries'
import * as copy from './AdminEpisodeStatus.copy'

function bakerName(bakers, id) {
  return bakers.find((b) => b.id === id)?.name ?? copy.NO_ANSWER
}

export default function AdminEpisodeStatus() {
  const { number } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(null)
    fetchEpisodeStatusData(Number(number))
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
  if (!data) return <p>{copy.LOADING}</p>

  const { episode, bakers, players, answers, bonusQuestions, bonusAnswers, scores } = data

  if (!episode) return <p>{copy.EPISODE_NOT_FOUND}</p>

  return (
    <div>
      <h2>{copy.statusTitle(episode)}</h2>

      <div className="table-wrap">
        <table className="wrap-headers">
          <thead>
            <tr>
              <th>{copy.PLAYER}</th>
              {episode.technical_enabled !== false && <th>{copy.TECHNICAL}</th>}
              {episode.star_baker_enabled !== false && <th>{copy.STAR_BAKER}</th>}
              {episode.eliminated_enabled !== false && <th>{copy.ELIMINATED}</th>}
              {episode.handshake_enabled !== false && <th>{copy.HANDSHAKES}</th>}
              {bonusQuestions.map((bq) => (
                <th key={bq.id}>{bq.prompt}</th>
              ))}
              <th>{copy.TOTAL}</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const answer = answers.find((a) => a.player_id === p.id)
              const score = scores.find((s) => s.player_id === p.id)
              return (
                <tr key={p.id}>
                  <td>{p.display_name}</td>
                  {episode.technical_enabled !== false && <td>{answer ? bakerName(bakers, answer.technical_pick_id) : copy.NO_ANSWER}</td>}
                  {episode.star_baker_enabled !== false && <td>{answer ? bakerName(bakers, answer.star_baker_pick_id) : copy.NO_ANSWER}</td>}
                  {episode.eliminated_enabled !== false && <td>{answer ? bakerName(bakers, answer.eliminated_pick_id) : copy.NO_ANSWER}</td>}
                  {episode.handshake_enabled !== false && <td>{answer?.handshake_guess ?? copy.NO_ANSWER}</td>}
                  {bonusQuestions.map((bq) => {
                    const ba = bonusAnswers.find((a) => a.bonus_question_id === bq.id && a.player_id === p.id)
                    if (bq.type === 'baker_multi_pick') {
                      const ids = ba?.answer_baker_ids ?? []
                      return (
                        <td key={bq.id}>
                          {ids.length ? ids.map((id) => bakerName(bakers, id)).join(', ') : copy.NO_ANSWER}
                        </td>
                      )
                    }
                    return <td key={bq.id}>{ba?.answer_text ?? copy.NO_ANSWER}</td>
                  })}
                  <td>{score ? score.total : copy.NO_ANSWER}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
