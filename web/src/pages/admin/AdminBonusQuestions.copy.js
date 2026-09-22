import { episodeLabel } from '../../lib/episodeLabel'

export const TITLE = 'Bonus questions'
export const LOADING = 'Loading…'
export const LOAD_ERROR_PREFIX = "Couldn't load bonus questions: "
export const TRY_AGAIN = 'Try again'
export const NONE_UNRESOLVED = 'No bonus questions are waiting to be graded.'
export const NEEDS_GRADING_HEADING = 'Needs grading'
export const ALREADY_GRADED_HEADING = 'Already graded'
export const ALREADY_GRADED_HELP =
  'Fix a wrong answer key here — scoring again rewrites the key and recomputes everyone against it.'
export const NONE_GRADED = 'No bonus questions have been graded yet.'
export const SCORING = 'Scoring…'
export const SCORE = 'Score'
export const ENTER_ANSWER_ERROR = 'Enter a correct answer before scoring.'
export const PICK_BAKER_ERROR = 'Pick at least one baker before scoring.'
export const correctAnswerLabel = (prompt) => `Correct answer: ${prompt}`
export const questionLine = (bq) =>
  `${episodeLabel(bq.episodes)} — ${bq.prompt} — ${bq.type} — ${bq.points} pt${bq.points === 1 ? '' : 's'}`
export const scoreSummary = (recomputed, preserved) =>
  `${recomputed} player score(s) recomputed, ${preserved} manual override(s) preserved.`
