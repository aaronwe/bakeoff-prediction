import { episodeLabel } from '../../lib/episodeLabel'

export const LOADING = 'Loading…'
export const NO_ANSWER = '—'
export const PLAYER = 'Player'
export const TECHNICAL = 'Technical'
export const STAR_BAKER = 'Star Baker'
export const ELIMINATED = 'Eliminated'
export const HANDSHAKES = 'Handshakes'
export const TOTAL = 'Total'
export const LOAD_ERROR_PREFIX = "Couldn't load episode status: "
export const EPISODE_NOT_FOUND = 'Episode not found.'

export const statusTitle = (episode) => `${episodeLabel(episode)} status`
