export function decideWeeklyAction(episode) {
  if (!episode) return { action: 'none' }
  if (episode.status !== 'open') return { action: 'none' }
  if (episode.email_locked_at) return { action: 'send' }
  return { action: 'remind' }
}
