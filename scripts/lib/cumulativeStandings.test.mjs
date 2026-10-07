import { describe, it, expect } from 'vitest'
import { buildCumulativeStandings } from './cumulativeStandings.mjs'

const players = [
  { id: 'a', display_name: 'Ann' },
  { id: 'b', display_name: 'Bo' },
]

describe('buildCumulativeStandings', () => {
  it('sums scores across all episodes, not just the latest', () => {
    const scores = [
      { player_id: 'a', total: 3 },
      { player_id: 'a', total: 2 },
      { player_id: 'b', total: 4 },
      { player_id: 'b', total: 4 },
    ]
    expect(buildCumulativeStandings(scores, players)).toEqual([
      { name: 'Bo', total: 8 },
      { name: 'Ann', total: 5 },
    ])
  })

  it('sorts by total descending', () => {
    const scores = [
      { player_id: 'a', total: 1 },
      { player_id: 'b', total: 6 },
    ]
    expect(buildCumulativeStandings(scores, players).map((r) => r.name)).toEqual(['Bo', 'Ann'])
  })

  it('labels scores from unknown players', () => {
    expect(buildCumulativeStandings([{ player_id: 'zz', total: 2 }], players)).toEqual([
      { name: 'Unknown', total: 2 },
    ])
  })

  it('returns no rows when there are no scores', () => {
    expect(buildCumulativeStandings([], players)).toEqual([])
  })
})
