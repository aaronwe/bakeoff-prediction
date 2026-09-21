export function decideWeeklyAction(episode) {
  if (!episode) return { action: 'none' }
  if (episode.status !== 'open') return { action: 'none' }
  // Already sent this cycle: without this check, an admin who used "Send
  // now" (Task 10) mid-week would get a duplicate send to every real player
  // when the Thursday cron fires later for the same still-open, still-locked
  // episode.
  if (episode.email_sent_at) return { action: 'none' }
  if (episode.email_locked_at) return { action: 'send' }
  return { action: 'remind' }
}
