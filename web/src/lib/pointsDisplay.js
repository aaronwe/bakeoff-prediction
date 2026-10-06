export const QUESTION_KIND = {
  FLAT: 'flat',
  PER_CORRECT: 'per_correct',
  RANGE: 'range',
  CLOSEST: 'closest',
}

function pointWord(points) {
  return points === 1 ? 'point' : 'points'
}

export function formatPoints(kind, points) {
  switch (kind) {
    case QUESTION_KIND.PER_CORRECT:
      return `${points} ${pointWord(points)} per correct answer`
    case QUESTION_KIND.CLOSEST:
      return '3, 2, or 1 points for the closest guesses'
    case QUESTION_KIND.RANGE:
      return `up to ${points} ${pointWord(points)}`
    case QUESTION_KIND.FLAT:
    default:
      return `${points} ${pointWord(points)}`
  }
}
