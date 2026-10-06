import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchEpisodeRevealData } from '../lib/queries'
import {
  technicalResult,
  starBakerResult,
  eliminatedResult,
  handshakeResult,
  bonusTextResult,
  bonusBakerResult,
} from '../lib/answerCorrectness'
import BakerThumb from '../components/BakerThumb'
import * as copy from './EpisodeReveal.copy'

function SummaryBaker({ label, baker }) {
  return (
    <div className="results-summary-card">
      <span className="results-summary-label">{label}</span>
      {baker ? (
        <>
          <BakerThumb baker={baker} />
          <span className="results-summary-name">{baker.name}</span>
        </>
      ) : (
        <span className="results-summary-name">{copy.NO_ONE}</span>
      )}
    </div>
  )
}

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
    return <p>{copy.notScoredYet(episode)}</p>
  }

  return (
    <div>
      <h2>{copy.resultsTitle(episode)}</h2>
      <div className="results-summary">
        {episode.technical_enabled !== false && (
          <SummaryBaker label={copy.SUMMARY_TECHNICAL} baker={bakers.find((b) => b.id === episode.technical_winner_baker_id)} />
        )}
        {episode.star_baker_enabled !== false && (
          <SummaryBaker label={copy.SUMMARY_STAR_BAKER} baker={bakers.find((b) => b.id === episode.star_baker_id)} />
        )}
        {episode.eliminated_enabled !== false && (
          <SummaryBaker label={copy.SUMMARY_ELIMINATED} baker={bakers.find((b) => b.id === episode.eliminated_baker_id)} />
        )}
        {episode.handshake_enabled !== false && (
          <div className="results-summary-card">
            <span className="results-summary-label">{copy.SUMMARY_HANDSHAKES}</span>
            <span className="results-summary-handshakes">{episode.handshake_count ?? copy.NO_ANSWER}</span>
          </div>
        )}
      </div>

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
              if (!answer) return null
              return (
                <tr key={p.id}>
                  <td>{p.display_name}</td>
                  {episode.technical_enabled !== false && <td className={`answer-${technicalResult(answer, episode)}`}>{bakerName(bakers, answer.technical_pick_id)}</td>}
                  {episode.star_baker_enabled !== false && <td className={`answer-${starBakerResult(answer, episode)}`}>{bakerName(bakers, answer.star_baker_pick_id)}</td>}
                  {episode.eliminated_enabled !== false && <td className={`answer-${eliminatedResult(answer, episode)}`}>{bakerName(bakers, answer.eliminated_pick_id)}</td>}
                  {episode.handshake_enabled !== false && <td className={`answer-${handshakeResult(answer, episode)}`}>{answer.handshake_guess ?? copy.NO_ANSWER}</td>}
                  {bonusQuestions.map((bq) => {
                    const ba = bonusAnswers.find((a) => a.bonus_question_id === bq.id && a.player_id === p.id)
                    if (bq.type === 'baker_multi_pick') {
                      const ids = ba?.answer_baker_ids ?? []
                      return (
                        <td key={bq.id}>
                          {ids.length
                            ? ids.map((id, i) => (
                                <span key={id} className={`answer-${bonusBakerResult(bq, id)}`}>
                                  {i > 0 && ', '}
                                  {bakerName(bakers, id)}
                                </span>
                              ))
                            : copy.NO_ANSWER}
                        </td>
                      )
                    }
                    return (
                      <td key={bq.id} className={`answer-${bonusTextResult(bq, ba, bonusAnswers.filter((a) => a.bonus_question_id === bq.id))}`}>
                        {ba?.answer_text ?? copy.NO_ANSWER}
                      </td>
                    )
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
