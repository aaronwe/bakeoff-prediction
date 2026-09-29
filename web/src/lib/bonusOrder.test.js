import { describe, it, expect } from 'vitest'
import { nextSortOrder, moveQuestion, sortBonusQuestions } from './bonusOrder'

const q = (id, sort_order, created_at = '2026-01-01T00:00:00Z', episodes) => ({ id, sort_order, created_at, episodes })

describe('nextSortOrder', () => {
  it('is 1 for an empty list', () => {
    expect(nextSortOrder([])).toBe(1)
  })
  it('is max + 1', () => {
    expect(nextSortOrder([q('a', 1), q('b', 4), q('c', 2)])).toBe(5)
  })
})

describe('sortBonusQuestions', () => {
  it('sorts by sort_order then created_at without mutating the input', () => {
    const input = [q('b', 2), q('c', 1, '2026-01-02T00:00:00Z'), q('a', 1, '2026-01-01T00:00:00Z')]
    expect(sortBonusQuestions(input).map((x) => x.id)).toEqual(['a', 'c', 'b'])
    expect(input.map((x) => x.id)).toEqual(['b', 'c', 'a'])
  })
  it('groups by episode number first when present', () => {
    const input = [q('e2', 1, undefined, { number: 2 }), q('e1', 5, undefined, { number: 1 })]
    expect(sortBonusQuestions(input).map((x) => x.id)).toEqual(['e1', 'e2'])
  })
})

describe('moveQuestion', () => {
  const list = [q('a', 1), q('b', 2), q('c', 3)]
  it('moves down by swapping with the next question', () => {
    expect(moveQuestion(list, 'a', 'down')).toEqual([
      { id: 'b', sort_order: 1 },
      { id: 'a', sort_order: 2 },
    ])
  })
  it('moves up by swapping with the previous question', () => {
    expect(moveQuestion(list, 'c', 'up')).toEqual([
      { id: 'c', sort_order: 2 },
      { id: 'b', sort_order: 3 },
    ])
  })
  it('returns [] at the edges and for unknown ids', () => {
    expect(moveQuestion(list, 'a', 'up')).toEqual([])
    expect(moveQuestion(list, 'c', 'down')).toEqual([])
    expect(moveQuestion(list, 'zzz', 'up')).toEqual([])
  })
  it('repairs ties and gaps by renumbering 1..n', () => {
    const tied = [q('a', 0, '2026-01-01T00:00:00Z'), q('b', 0, '2026-01-02T00:00:00Z'), q('c', 7)]
    expect(moveQuestion(tied, 'b', 'up')).toEqual([
      { id: 'b', sort_order: 1 },
      { id: 'a', sort_order: 2 },
      { id: 'c', sort_order: 3 },
    ])
  })
})
