// What an admin may change on a bonus question, by its episode's status.
// `structure` = type, options, pick count, include-eliminated: changing those
// after players have answered would leave their saved answers meaningless.
// Points and delete are locked once scored because scores are already
// computed and wouldn't update.
const RULES = {
  draft: { prompt: true, points: true, structure: true, canDelete: true },
  open: { prompt: true, points: true, structure: false, canDelete: true },
  scored: { prompt: true, points: false, structure: false, canDelete: false },
}

export function editRulesFor(status) {
  return RULES[status] ?? RULES.scored
}
