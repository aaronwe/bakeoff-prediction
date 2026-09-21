export function scoreHandshake(guess, actual) {
  if (guess == null || actual == null) return 0
  const diff = Math.abs(guess - actual)
  if (diff === 0) return 2
  if (diff === 1) return 1
  return 0
}

export function scoreBonusAnswer(bonusQuestion, answerText) {
  if (!answerText || !bonusQuestion.correct_answer) return 0
  const normalize = (s) => s.trim().toLowerCase()
  return normalize(answerText) === normalize(bonusQuestion.correct_answer)
    ? bonusQuestion.points
    : 0
}

export function computeScoreForPlayer({ episode, answer, bonusQuestions, bonusAnswers }) {
  const breakdown = {
    technical: answer.technical_pick_id && answer.technical_pick_id === episode.technical_winner_baker_id ? 1 : 0,
    star_baker: answer.star_baker_pick_id && answer.star_baker_pick_id === episode.star_baker_id ? 1 : 0,
    eliminated: answer.eliminated_pick_id && answer.eliminated_pick_id === episode.eliminated_baker_id ? 2 : 0,
    handshake: scoreHandshake(answer.handshake_guess, episode.handshake_count),
  }

  for (const bq of bonusQuestions) {
    const ba = bonusAnswers.find((a) => a.bonus_question_id === bq.id)
    breakdown[`bonus_${bq.id}`] = scoreBonusAnswer(bq, ba?.answer_text)
  }

  const total = Object.values(breakdown).reduce((sum, v) => sum + v, 0)
  return { breakdown, total }
}
