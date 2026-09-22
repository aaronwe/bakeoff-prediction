import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchEpisodeRevealData } from '../lib/queries'
import * as copy from './EpisodeReveal.copy'

function bakerName(bakers, id) {
  return bakers.find((b) => b.id === id)?.name ?? copy.NO_ANSWER
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
  if (!data) return <p>{copy.LOADING}</p>

  const { episode, bakers, players, answers, bonusQuestions, bonusAnswers, scores } = data

  if (episode.status !== 'scored') {
    return <p>{copy.notScoredYet(episode.number)}</p>
  }

  return (
    <div>
      <h2>{copy.resultsTitle(episode.number)}</h2>
      <p>
        {copy.summaryLine({
          technicalWinner: bakerName(bakers, episode.technical_winner_baker_id),
          starBaker: bakerName(bakers, episode.star_baker_id),
          eliminatedBaker: bakerName(bakers, episode.eliminated_baker_id),
          handshakeCount: episode.handshake_count,
        })}
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{copy.PLAYER}</th>
              <th>{copy.TECHNICAL}</th>
              <th>{copy.STAR_BAKER}</th>
              <th>{copy.ELIMINATED}</th>
              <th>{copy.HANDSHAKES}</th>
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
              if (!answer) return null
              return (
                <tr key={p.id}>
                  <td>{p.display_name}</td>
                  <td>{bakerName(bakers, answer.technical_pick_id)}</td>
                  <td>{bakerName(bakers, answer.star_baker_pick_id)}</td>
                  <td>{bakerName(bakers, answer.eliminated_pick_id)}</td>
                  <td>{answer.handshake_guess ?? copy.NO_ANSWER}</td>
                  {bonusQuestions.map((bq) => {
                    const ba = bonusAnswers.find((a) => a.bonus_question_id === bq.id && a.player_id === p.id)
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
