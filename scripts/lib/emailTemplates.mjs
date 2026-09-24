import { episodeLabel } from './episodeLabel.mjs'

// Player display names (self-serve, no admin approval per the design's
// "open signup" decision) and bonus question prompts both end up in this
// HTML. Without escaping, a name/prompt containing `<`, `>`, or `&` would
// visibly corrupt the email for every recipient, not just its own author.
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// `!== false`, not a truthy check: an episode row with the *_enabled column
// unset (existing episodes, or a fixture predating the column) must still
// count as enabled — only an explicit `false` turns a question off.
function regularQuestionsLine(episode, hasBonusQuestions) {
  const regularQuestions = [
    episode.technical_enabled !== false && 'technical winner',
    episode.star_baker_enabled !== false && 'star baker',
    episode.eliminated_enabled !== false && 'eliminated baker',
    episode.handshake_enabled !== false && 'handshake count',
  ].filter(Boolean)

  if (regularQuestions.length) {
    return `This week's questions: ${regularQuestions.join(', ')}${hasBonusQuestions ? ', plus bonus questions:' : '.'}`
  }
  return hasBonusQuestions
    ? "This week's questions:"
    : "This week's questions are open — check the site for details."
}

export function buildWeeklyEmailHtml({ episode, bonusQuestions, siteUrl, previousLeaderboard }) {
  const bonusList = bonusQuestions
    .map((bq) => `<li>${escapeHtml(bq.prompt)} (${bq.points} pt${bq.points === 1 ? '' : 's'})</li>`)
    .join('')

  const leaderboardSection = previousLeaderboard?.rows.length
    ? `<h3>Standings after episode ${previousLeaderboard.episodeNumber}</h3>
       <ol>${previousLeaderboard.rows.map((r) => `<li>${escapeHtml(r.name)}: ${r.total}</li>`).join('')}</ol>`
    : ''

  return `
    <div>
      <h2>${escapeHtml(episodeLabel(episode))} predictions are open!</h2>
      ${episode.intro_note ? `<p>${escapeHtml(episode.intro_note)}</p>` : ''}
      <p>${regularQuestionsLine(episode, bonusQuestions.length > 0)}</p>
      ${bonusQuestions.length ? `<ul>${bonusList}</ul>` : ''}
      <p><a href="${siteUrl}">Submit your predictions</a></p>
      ${leaderboardSection}
    </div>
  `
}

export function buildAdminReminderHtml({ episode, kind }) {
  if (kind === 'not-locked') {
    return `<p>${escapeHtml(episodeLabel(episode))} is open but its weekly email isn't locked yet. Add an intro note and click "Lock &amp; ready to send" when it's finalized.</p>`
  }
  if (kind === 'scoring-day') {
    return `<p>It's scoring day! Head to the admin panel to enter the answer key and score this week's episode.</p>`
  }
  return '<p>Reminder from the Bake Off Pool.</p>'
}
