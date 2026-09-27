// Precedence for pre-filling an answer-key form: a real, already-recorded
// answer (episode is scored, or a bonus question already has a key) always
// wins over a draft — a draft is only ever a placeholder for the not-yet-
// final answer, never a second source of truth once the real one exists.
// `??`, not `||`: a handshake count or baker id of a falsy-but-real value
// (0) must not be treated as missing.
export function resolveEpisodeAnswerKeyDefaults(episode, draftAnswerKey) {
  return {
    technicalWinner: episode.technical_winner_baker_id ?? draftAnswerKey?.technical_winner_baker_id ?? '',
    starBaker: episode.star_baker_id ?? draftAnswerKey?.star_baker_id ?? '',
    eliminated: episode.eliminated_baker_id ?? draftAnswerKey?.eliminated_baker_id ?? '',
    handshakeCount: episode.handshake_count ?? draftAnswerKey?.handshake_count ?? '',
  }
}

export function resolveBonusAnswerKeyDefaults(bonusQuestion, draftAnswerKey) {
  return {
    text: bonusQuestion.correct_answer ?? draftAnswerKey?.correct_answer ?? '',
    bakerIds: bonusQuestion.correct_baker_ids ?? draftAnswerKey?.correct_baker_ids ?? [],
  }
}
