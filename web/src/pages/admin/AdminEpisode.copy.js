import { episodeLabel } from '../../lib/episodeLabel'

// IntroNoteAndLock
export const WEEKLY_EMAIL_TITLE = 'Weekly email'
export const INTRO_NOTE_LABEL = "Intro note (shown at the top of Thursday's email)"
export const SAVE_NOTE = 'Save note'
export const LOCK_ERROR = 'Write an intro note before locking.'
export const LOCKED_MESSAGE = 'Locked and ready to send.'
export const UNLOCK = 'Unlock'
export const SEND_TEST = 'Send a test email to me'
export const SEND_NOW = 'Send now to all players'
export const RUN_WORKFLOW_HINT = 'These links open GitHub Actions. Click "Run workflow" there to send.'
export const LOCK_AND_READY = 'Lock & ready to send'
export const emailSentAt = (dateString) => `Email sent at ${dateString}.`

// RegularQuestionsToggle
export const REGULAR_QUESTIONS_TITLE = 'Regular questions'
export const REGULAR_QUESTIONS_NOTE =
  "Turn off any question that doesn't apply this week (no technical challenge, or a multiple-elimination week where " +
  "there's no single answer for who went home) — add a bonus question instead if you need something custom for it."

// AnswerKeyAndScore
export const ANSWER_KEY_TITLE = 'Answer key & scoring'
export const TECHNICAL_LABEL = 'Technical challenge winner'
export const STAR_BAKER_LABEL = 'Star Baker'
export const ELIMINATED_LABEL = 'Who went home'
export const HANDSHAKE_COUNT_LABEL = 'Handshake count'
export const SCORING_NOTE =
  'Save draft jots down your answers without affecting anything else — the real answer key and player scores ' +
  "aren't touched until you click the scoring button, which locks predictions, publishes the answer key, and " +
  'scores every player in one step. Bonus questions get the same Save draft option on the Bonus questions page ' +
  'while their episode is still airing; grading them happens separately, once their answer is known.'
export const SAVE_DRAFT = 'Save draft'
export const SAVING_DRAFT = 'Saving…'
export const DRAFT_SAVED = 'Draft saved.'
export const LOCK_AND_SCORE_CONFIRM =
  'This locks predictions, publishes the answer key, and scores every player immediately. Continue?'
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
