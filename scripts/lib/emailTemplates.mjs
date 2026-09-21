export function buildWeeklyEmailHtml({ episode, bonusQuestions, siteUrl, previousLeaderboard }) {
  const bonusList = bonusQuestions
    .map((bq) => `<li>${bq.prompt} (${bq.points} pt${bq.points === 1 ? '' : 's'})</li>`)
    .join('')

  const leaderboardSection = previousLeaderboard
    ? `<h3>Standings after episode ${previousLeaderboard.episodeNumber}</h3>
       <ol>${previousLeaderboard.rows.map((r) => `<li>${r.name}: ${r.total}</li>`).join('')}</ol>`
    : ''

  return `
    <div>
      <h2>Episode ${episode.number} predictions are open!</h2>
      ${episode.intro_note ? `<p>${episode.intro_note}</p>` : ''}
      <p>This week's questions: technical winner, Star Baker, who goes home, handshake count${bonusQuestions.length ? ', plus bonus questions:' : '.'}</p>
      ${bonusQuestions.length ? `<ul>${bonusList}</ul>` : ''}
      <p><a href="${siteUrl}">Submit your predictions</a></p>
      ${leaderboardSection}
    </div>
  `
}

export function buildAdminReminderHtml({ episode, kind }) {
  if (kind === 'not-locked') {
    return `<p>Episode ${episode.number} is open but its weekly email isn't locked yet. Add an intro note and click "Lock &amp; ready to send" when it's finalized.</p>`
  }
  if (kind === 'scoring-day') {
    return `<p>It's scoring day! Head to the admin panel to enter the answer key and score this week's episode.</p>`
  }
  return '<p>Reminder from the Bake Off Pool.</p>'
}
