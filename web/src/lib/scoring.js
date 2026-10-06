export function scoreHandshake(guess, actual) {
  if (guess == null || actual == null) return 0
  const diff = Math.abs(guess - actual)
  if (diff === 0) return 2
  if (diff === 1) return 1
  return 0
}

const CLOSEST_NUMBER_POINTS = [3, 2, 1]

// Blank or non-numeric text is not a guess; Number('') would be 0, so check first.
function parseGuess(text) {
  if (text == null || String(text).trim() === '') return null
  const n = Number(text)
  return Number.isFinite(n) ? n : null
}

// Ranks by distance to the key. Ties share the better place and the places
// they cover are skipped (competition ranking), so 3, 2, 2, 2 is possible.
// Fixed 3/2/1 — the question's own `points` field is deliberately ignored.
// `allAnswers` must be every player's answer to this one question.
export function scoreClosestNumber(bonusQuestion, bonusAnswer, allAnswers) {
  const key = parseGuess(bonusQuestion.correct_answer)
  const guess = parseGuess(bonusAnswer?.answer_text)
  if (key == null || guess == null) return 0
  const distance = Math.abs(guess - key)
  const closerCount = allAnswers.filter((a) => {
    const g = parseGuess(a.answer_text)
    return g != null && Math.abs(g - key) < distance
  }).length
  return CLOSEST_NUMBER_POINTS[closerCount] ?? 0
}

export function scoreBonusAnswer(bonusQuestion, bonusAnswer, allAnswersForQuestion = []) {
  if (bonusQuestion.type === 'closest_number') {
    return scoreClosestNumber(bonusQuestion, bonusAnswer, allAnswersForQuestion)
  }
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
//
// allBonusAnswers is every player's bonus answers for the episode: closest_number
// is ranked against the whole field, so it can't be scored from one player's
// answers alone.
export function computeScoreForPlayer({ episode, answer, bonusQuestions, bonusAnswers, allBonusAnswers = bonusAnswers }) {
  // The `&&` guards below are load-bearing, not redundant: an unset answer
  // key (episode.*_id is null) and a skipped question (answer.*_id is null)
  // would otherwise both be null and a bare `===` would wrongly score it as
  // a match. `&&` short-circuits that null-vs-null case to 0.
  //
  // `!== false`, not a truthy check: an episode object with the flag simply
  // absent (e.g. in older tests/fixtures, before this column existed) must
  // still count as enabled — only an explicit `false` turns a question off.
  const breakdown = {}
  if (episode.technical_enabled !== false) {
    breakdown.technical = answer.technical_pick_id && answer.technical_pick_id === episode.technical_winner_baker_id ? 1 : 0
  }
  if (episode.star_baker_enabled !== false) {
    breakdown.star_baker = answer.star_baker_pick_id && answer.star_baker_pick_id === episode.star_baker_id ? 1 : 0
  }
  if (episode.eliminated_enabled !== false) {
    breakdown.eliminated = answer.eliminated_pick_id && answer.eliminated_pick_id === episode.eliminated_baker_id ? 2 : 0
  }
  if (episode.handshake_enabled !== false) {
    breakdown.handshake = scoreHandshake(answer.handshake_guess, episode.handshake_count)
  }

  for (const bq of bonusQuestions) {
    const ba = bonusAnswers.find((a) => a.bonus_question_id === bq.id)
    const questionAnswers = allBonusAnswers.filter((a) => a.bonus_question_id === bq.id)
    breakdown[`bonus_${bq.id}`] = scoreBonusAnswer(bq, ba, questionAnswers)
  }

  const total = Object.values(breakdown).reduce((sum, v) => sum + v, 0)
  return { breakdown, total }
}
