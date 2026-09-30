import { marked } from 'marked'
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

// Intro note is admin-authored Markdown. `<` and `&` are escaped first so raw
// HTML is shown as text; `>`, quotes are restored so blockquotes and smart
// text still work (marked re-escapes them in output).
function renderIntroNote(note) {
  if (!note || !note.trim()) return ''
  return marked.parse(escapeHtml(note).replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"'), { gfm: true, breaks: true, async: false })
}

// Competition ranking: tied rows share a rank and the next rank skips.
export function rankRows(rows) {
  let rank = 0
  return rows.map((row, i) => {
    if (i === 0 || row.total !== rows[i - 1].total) rank = i + 1
    return { ...row, rank }
  })
}

export function buildWeeklyEmailHtml({ episode, bonusQuestions, siteUrl, previousLeaderboard }) {
  const bonusList = bonusQuestions
    .map((bq) => `<li>${escapeHtml(bq.prompt)} (${bq.points} pt${bq.points === 1 ? '' : 's'})</li>`)
    .join('')

  const leaderboardSection = previousLeaderboard?.rows.length
    ? `<h3>Standings after episode ${previousLeaderboard.episodeNumber}</h3>
       ${rankRows(previousLeaderboard.rows).map((r) => `<p style="margin:2px 0">${r.rank}. ${escapeHtml(r.name)}: ${r.total}</p>`).join('')}`
    : ''

  return `
    <div>
      <h2>${escapeHtml(episodeLabel(episode))} predictions are open!</h2>
      ${renderIntroNote(episode.intro_note)}
      <p>${regularQuestionsLine(episode, bonusQuestions.length > 0)}</p>
      ${bonusQuestions.length ? `<ul>${bonusList}</ul>` : ''}
      <p style="font-size:24px;font-weight:bold;margin:24px 0"><a href="${siteUrl}" style="font-weight:bold">Submit your predictions!</a></p>
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
