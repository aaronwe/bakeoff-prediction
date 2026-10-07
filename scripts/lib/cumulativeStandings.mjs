export function buildCumulativeStandings(scores, players) {
  const totals = new Map()
  for (const s of scores) {
    totals.set(s.player_id, (totals.get(s.player_id) ?? 0) + s.total)
  }
  return [...totals]
    .map(([playerId, total]) => ({
      name: players.find((p) => p.id === playerId)?.display_name ?? 'Unknown',
      total,
    }))
    .sort((a, b) => b.total - a.total)
}
