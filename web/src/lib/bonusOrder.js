export function nextSortOrder(questions) {
  return questions.reduce((max, q) => Math.max(max, q.sort_order ?? 0), 0) + 1
}

export function sortBonusQuestions(questions) {
  return [...questions].sort(
    (a, b) =>
      (a.episodes?.number ?? 0) - (b.episodes?.number ?? 0) ||
      (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
      String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')),
  )
}

// Returns only the rows whose sort_order changes. Renumbering the whole list
// (rather than swapping two values) keeps this correct even if a legacy row
// has a tied or zero sort_order.
export function moveQuestion(questions, id, direction) {
  const sorted = sortBonusQuestions(questions)
  const from = sorted.findIndex((q) => q.id === id)
  const to = direction === 'up' ? from - 1 : from + 1
  if (from === -1 || to < 0 || to >= sorted.length) return []
  const reordered = [...sorted]
  ;[reordered[from], reordered[to]] = [reordered[to], reordered[from]]
  return reordered
    .map((q, i) => ({ id: q.id, sort_order: i + 1, changed: q.sort_order !== i + 1 }))
    .filter((r) => r.changed)
    .map(({ id: rid, sort_order }) => ({ id: rid, sort_order }))
}
