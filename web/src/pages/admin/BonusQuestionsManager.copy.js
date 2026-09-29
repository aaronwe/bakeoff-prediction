// Add form (moved from AdminEpisode.copy.js)
export const ADD_BONUS_QUESTION_TITLE = 'Add a bonus question'
export const PROMPT_LABEL = 'Prompt'
export const TYPE_LABEL = 'Type'
export const TYPE_BAKER_PICK = 'Pick a baker'
export const TYPE_BAKER_MULTI_PICK = 'Pick multiple bakers'
export const TYPE_JUDGE_HOST_PICK = 'Pick a judge or host'
export const TYPE_MULTIPLE_CHOICE = 'Multiple choice (custom options)'
export const TYPE_FREE_TEXT = 'Free text / number'
export const INCLUDE_ELIMINATED_LABEL = 'Include eliminated bakers'
export const OPTIONS_LABEL = 'Options (comma-separated)'
export const POINTS_LABEL = 'Points'
export const PICK_COUNT_LABEL = 'How many bakers can be picked'
export const ADD_BONUS_QUESTION = 'Add bonus question'

// List rows
export const NO_BONUS_QUESTIONS = 'No bonus questions yet.'
export const MOVE_UP = 'Move up'
export const MOVE_DOWN = 'Move down'
export const EDIT = 'Edit'
export const DELETE = 'Delete'
export const SAVE = 'Save'
export const SAVING = 'Saving…'
export const CANCEL = 'Cancel'
export const DELETE_LOCKED_NOTE = 'Questions on a scored episode can’t be deleted — their points are already counted.'
export const POINTS_LOCKED_NOTE = 'Points are locked once the episode is scored.'
export const STRUCTURE_LOCKED_NOTE = 'Type and options are locked once the episode is open, because players may have already answered.'
export const TYPE_LABELS = {
  baker_pick: TYPE_BAKER_PICK,
  baker_multi_pick: TYPE_BAKER_MULTI_PICK,
  judge_host_pick: TYPE_JUDGE_HOST_PICK,
  multiple_choice: TYPE_MULTIPLE_CHOICE,
  free_text: TYPE_FREE_TEXT,
}
export const bonusQuestionLine = (bq) =>
  `${bq.prompt} — ${TYPE_LABELS[bq.type] ?? bq.type} — ${bq.points} pt${bq.points === 1 ? '' : 's'}`
export const confirmDelete = (bq, answerCount) =>
  answerCount > 0
    ? `Delete “${bq.prompt}”? This will also remove ${answerCount} player answer${answerCount === 1 ? '' : 's'} and can’t be undone.`
    : `Delete “${bq.prompt}”? This can’t be undone.`
export const CHANGE_HAD_NO_EFFECT = 'Nothing was changed (the database refused the update). Try reloading the page.'
export const DELETE_HAD_NO_EFFECT = 'Nothing was deleted (the database refused the change). Try reloading the page.'
