export function scoreHandshake(guess, actual) {
  if (guess == null || actual == null) return 0
  const diff = Math.abs(guess - actual)
  if (diff === 0) return 2
  if (diff === 1) return 1
  return 0
}

export function scoreBonusAnswer(bonusQuestion, bonusAnswer) {
  if (bonusQuestion.type === 'baker_multi_pick') {
    const picks = bonusAnswer?.answer_baker_ids
    const correct = bonusQuestion.correct_baker_ids
    if (!picks?.length || !correct?.length) return 0
    const correctSet = new Set(correct)
    const matches = picks.filter((id) => correctSet.has(id)).length
    return matches * bonusQuestion.points
  }
  const answerText = bonusAnswer?.answer_text
  if (!answerText || !bonusQuestion.correct_answer) return 0
  const normalize = (s) => s.trim().toLowerCase()
  return normalize(answerText) === normalize(bonusQuestion.correct_answer)
    ? bonusQuestion.points
    : 0
}

// bonusAnswers must already be scoped to the player being scored (i.e. every
// row's player_id matches `answer`'s player) — this function doesn't filter
// by player itself, so passing an unfiltered/multi-player array would
// silently cross-contaminate bonus scores between players.
export function computeScoreForPlayer({ episode, answer, bonusQuestions, bonusAnswers }) {
  // The `&&` guards below are load-bearing, not redundant: an unset answer
  // key (episode.*_id is null) and a skipped question (answer.*_id is null)
  // would otherwise both be null and a bare `===` would wrongly score it as
  // a match. `&&` short-circuits that null-vs-null case to 0.
  const breakdown = {
    technical: answer.technical_pick_id && answer.technical_pick_id === episode.technical_winner_baker_id ? 1 : 0,
    star_baker: answer.star_baker_pick_id && answer.star_baker_pick_id === episode.star_baker_id ? 1 : 0,
    eliminated: answer.eliminated_pick_id && answer.eliminated_pick_id === episode.eliminated_baker_id ? 2 : 0,
    handshake: scoreHandshake(answer.handshake_guess, episode.handshake_count),
  }

  for (const bq of bonusQuestions) {
    const ba = bonusAnswers.find((a) => a.bonus_question_id === bq.id)
    breakdown[`bonus_${bq.id}`] = scoreBonusAnswer(bq, ba)
  }

  const total = Object.values(breakdown).reduce((sum, v) => sum + v, 0)
  return { breakdown, total }
}
