// Precedence for pre-filling an answer-key form: a real, already-recorded
// answer (episode is scored, or a bonus question already has a key) always
// wins over a draft — a draft is only ever a placeholder for the not-yet-
// final answer, never a second source of truth once the real one exists.
// `??`, not `||`: a handshake count or baker id of a falsy-but-real value
// (0) must not be treated as missing.
export function resolveEpisodeAnswerKeyDefaults(episode, draftAnswerKey) {
  // Once scored, the real key is authoritative even for a field the admin
  // deliberately left null — a stale draft must never resurrect a value at
  // Re-score time that the admin chose not to set when they originally
  // locked the episode.
  const draft = episode.status === 'scored' ? null : draftAnswerKey
  return {
    technicalWinner: episode.technical_winner_baker_id ?? draft?.technical_winner_baker_id ?? '',
    starBaker: episode.star_baker_id ?? draft?.star_baker_id ?? '',
    eliminated: episode.eliminated_baker_id ?? draft?.eliminated_baker_id ?? '',
    handshakeCount: episode.handshake_count ?? draft?.handshake_count ?? '',
  }
}

export function resolveBonusAnswerKeyDefaults(bonusQuestion, draftAnswerKey) {
  return {
    text: bonusQuestion.correct_answer ?? draftAnswerKey?.correct_answer ?? '',
    bakerIds: bonusQuestion.correct_baker_ids ?? draftAnswerKey?.correct_baker_ids ?? [],
  }
}
