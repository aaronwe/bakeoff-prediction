import { formatPoints, QUESTION_KIND } from '../lib/pointsDisplay'

export const LOADING_QUESTIONS = "Loading this week's questions…"
export const LOAD_ERROR_PREFIX = "Couldn't load this week's questions: "
export const TRY_AGAIN = 'Try again'

export const TECHNICAL_LABEL = `Who will win the technical challenge? (${formatPoints(QUESTION_KIND.FLAT, 1)})`
export const STAR_BAKER_LABEL = `Who will be Star Baker? (${formatPoints(QUESTION_KIND.FLAT, 1)})`
export const ELIMINATED_LABEL = `Who will be eliminated? (${formatPoints(QUESTION_KIND.FLAT, 2)})`
export const HANDSHAKE_LABEL = `How many handshakes will Paul give? (${formatPoints(QUESTION_KIND.RANGE, 2)})`
export const SELECT_AN_OPTION = 'Select an option'

export const SAVING = 'Saving…'
export const SUBMIT = 'Submit answers'
export const SAVED = 'Saved! You can come back and change your answers until scoring.'

export const episodeTitle = (number) => `Episode ${number}`
export const bonusPoints = (type, points) =>
  `(${formatPoints(type === 'baker_multi_pick' ? QUESTION_KIND.PER_CORRECT : QUESTION_KIND.FLAT, points)})`
