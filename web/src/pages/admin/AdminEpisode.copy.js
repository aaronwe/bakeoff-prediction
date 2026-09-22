import { episodeLabel } from '../../lib/episodeLabel'

// NewBonusQuestionForm
export const ADD_BONUS_QUESTION_TITLE = 'Add a bonus question'
export const PROMPT_LABEL = 'Prompt'
export const TYPE_LABEL = 'Type'
export const TYPE_BAKER_PICK = 'Pick a baker'
export const TYPE_BAKER_MULTI_PICK = 'Pick multiple bakers'
export const TYPE_MULTIPLE_CHOICE = 'Multiple choice (custom options)'
export const TYPE_FREE_TEXT = 'Free text / number'
export const INCLUDE_ELIMINATED_LABEL = 'Include eliminated bakers'
export const OPTIONS_LABEL = 'Options (comma-separated)'
export const POINTS_LABEL = 'Points'
export const PICK_COUNT_LABEL = 'How many bakers can be picked'
export const ADD_BONUS_QUESTION = 'Add bonus question'

// IntroNoteAndLock
export const WEEKLY_EMAIL_TITLE = 'Weekly email'
export const INTRO_NOTE_LABEL = "Intro note (shown at the top of Thursday's email)"
export const SAVE_NOTE = 'Save note'
export const LOCK_ERROR = 'Write an intro note before locking.'
export const LOCKED_MESSAGE = 'Locked and ready to send.'
export const UNLOCK = 'Unlock'
export const SEND_NOW = 'Send now (opens GitHub Actions — click "Run workflow")'
export const LOCK_AND_READY = 'Lock & ready to send'
export const emailSentAt = (dateString) => `Email sent at ${dateString}.`

// AnswerKeyAndScore
export const ANSWER_KEY_TITLE = 'Answer key & scoring'
export const TECHNICAL_LABEL = 'Technical challenge winner'
export const STAR_BAKER_LABEL = 'Star Baker'
export const ELIMINATED_LABEL = 'Who went home'
export const HANDSHAKE_COUNT_LABEL = 'Handshake count'
export const SCORING_NOTE =
  "Nothing here is saved until you submit — the database won't accept a partial answer key while the " +
  'episode is still open, so entering the key and scoring happen together in one step. Bonus questions ' +
  'are graded separately, on the Bonus questions page, whenever their answer is known.'
export const SCORING = 'Scoring…'
export const RE_SCORE = 'Re-score'
export const ENTER_ANSWER_KEY_AND_SCORE = 'Enter answer key & score'
export const scoreSummary = (recomputed, preserved) =>
  `${recomputed} player score(s) recomputed, ${preserved} manual override(s) preserved.`

// ManualOverrides
export const MANUAL_OVERRIDES_TITLE = 'Manual overrides'
export const PLAYER = 'Player'
export const TOTAL = 'Total'
export const OVERRIDDEN = 'Overridden?'
export const YES = 'Yes'
export const NO = 'No'

// AdminEpisode
export const LOADING = 'Loading…'
export const LOAD_ERROR_PREFIX = "Couldn't load this episode: "
export const TRY_AGAIN = 'Try again'
export const EPISODE_NOT_FOUND = 'Episode not found.'
export const PUBLISH = 'Publish (open for predictions)'
export const DANGER_ZONE_TITLE = 'Danger zone'
export const DELETE_EPISODE = 'Delete episode'
export const confirmDeleteEpisode = (number) =>
  `Delete Episode ${number}? This also deletes all of its answers, bonus questions, and scores. This can't be undone.`
export const DELETE_HAD_NO_EFFECT =
  "Nothing was deleted — you may not have permission, or this episode was already removed."
export const BONUS_QUESTIONS_TITLE = 'Bonus questions'
export const episodeHeading = (episode) => episodeLabel(episode)

// EpisodeTitleEditor
export const TITLE_LABEL = 'Title (optional)'
export const SAVE_TITLE = 'Save title'
export const bonusQuestionLine = (bq) => `${bq.prompt} — ${bq.type} — ${bq.points} pt${bq.points === 1 ? '' : 's'}`
