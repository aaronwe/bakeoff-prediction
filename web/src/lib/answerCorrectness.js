import { scoreBonusAnswer, scoreHandshake } from './scoring'

export const CORRECT = 'correct'
export const INCORRECT = 'incorrect'
export const UNSCORED = 'unscored'

// UNSCORED covers both "no answer given" and "answer key not set yet", so the
// status page only colors an answer once there is something to judge it by.
function pickResult(pickId, keyId) {
  if (!pickId || !keyId) return UNSCORED
  return pickId === keyId ? CORRECT : INCORRECT
}

export const technicalResult = (answer, episode) =>
  pickResult(answer?.technical_pick_id, episode.technical_winner_baker_id)

export const starBakerResult = (answer, episode) =>
  pickResult(answer?.star_baker_pick_id, episode.star_baker_id)

export const eliminatedResult = (answer, episode) =>
  pickResult(answer?.eliminated_pick_id, episode.eliminated_baker_id)

// Handshakes are ±1: any guess that scores points counts as correct.
export function handshakeResult(answer, episode) {
  if (answer?.handshake_guess == null || episode.handshake_count == null) return UNSCORED
  return scoreHandshake(answer.handshake_guess, episode.handshake_count) > 0 ? CORRECT : INCORRECT
}

// `allAnswersForQuestion` is only needed for closest_number, which is ranked
// against the other players' guesses.
export function bonusTextResult(bonusQuestion, bonusAnswer, allAnswersForQuestion) {
  if (!bonusAnswer?.answer_text || !bonusQuestion.correct_answer) return UNSCORED
  return scoreBonusAnswer(bonusQuestion, bonusAnswer, allAnswersForQuestion) > 0 ? CORRECT : INCORRECT
}

// Multi-pick answers are judged per baker, since a player can get some right.
export function bonusBakerResult(bonusQuestion, bakerId) {
  const correct = bonusQuestion.correct_baker_ids
  if (!correct?.length) return UNSCORED
  return correct.includes(bakerId) ? CORRECT : INCORRECT
}
