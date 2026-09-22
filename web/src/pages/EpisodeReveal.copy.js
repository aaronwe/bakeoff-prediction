import { episodeLabel } from '../lib/episodeLabel'

export const LOADING = 'Loading…'
export const NO_ANSWER = '—'
export const PLAYER = 'Player'
export const TECHNICAL = 'Technical'
export const STAR_BAKER = 'Star Baker'
export const ELIMINATED = 'Eliminated'
export const HANDSHAKES = 'Handshakes'
export const TOTAL = 'Total'

export const resultsTitle = (episode) => `${episodeLabel(episode)} results`
export const notScoredYet = (episode) => `${episodeLabel(episode)} hasn't been scored yet — check back after Wednesday.`
export const summaryLine = ({ technicalWinner, starBaker, eliminatedBaker, handshakeCount }) =>
  `Technical winner: ${technicalWinner} · Star Baker: ${starBaker} · Went home: ${eliminatedBaker} · Handshakes: ${handshakeCount}`
