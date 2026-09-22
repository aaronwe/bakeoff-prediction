export function episodeLabel(episode) {
  return episode.title ? `Episode ${episode.number}: ${episode.title}` : `Episode ${episode.number}`
}
