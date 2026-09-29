// Single source of truth for which choices a bonus question offers, shared by
// the player form and the admin answer-key form so the key is always picked
// from the same list players answered from (answers are compared as strings).
export function bonusOptionsFor(question, allBakers, activeBakers) {
  if (question.type === 'baker_pick') {
    const pool = question.include_eliminated ? allBakers : activeBakers
    return pool.map((b) => b.name)
  }
  if (question.type === 'multiple_choice') {
    return question.options ?? []
  }
  return null // free_text
}

// A saved key can fall out of the option list (option edited, baker no longer
// in the pool); keep it selectable so the picker doesn't silently show blank.
export function withSavedValue(options, saved) {
  return saved && !options.includes(saved) ? [...options, saved] : options
}
