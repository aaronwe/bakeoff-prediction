import { describe, it, expect } from 'vitest'
import { buildWeeklyEmailHtml, rankRows } from './emailTemplates.mjs'

const episode = { number: 3, intro_note: '' }
const build = (over = {}) =>
  buildWeeklyEmailHtml({ episode, bonusQuestions: [], siteUrl: 'https://x.test', previousLeaderboard: null, ...over })

describe('rankRows', () => {
  it('uses competition ranking for ties', () => {
    const totals = [5, 4, 4, 4, 4, 4, 3, 3, 2, 0]
    const ranked = rankRows(totals.map((total, i) => ({ name: `P${i}`, total })))
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 2, 2, 2, 2, 7, 7, 9, 10])
  })
})

describe('buildWeeklyEmailHtml', () => {
  it('renders markdown bold and line breaks in the intro', () => {
    const html = build({ episode: { ...episode, intro_note: 'Hello **world**\nnext line\n\nNew para' } })
    expect(html).toContain('<strong>world</strong>')
    expect(html).toContain('<br')
    expect(html.match(/<p>/g).length).toBeGreaterThanOrEqual(2)
  })

  it('escapes raw HTML in the intro', () => {
    const html = build({ episode: { ...episode, intro_note: '<script>alert(1)</script> hi' } })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('renders nothing for a blank intro', () => {
    expect(build()).not.toContain('undefined')
  })

  it('has a big bold CTA', () => {
    const html = build()
    expect(html).toContain('<p style="font-size:24px;font-weight:bold;margin:24px 0"><a href="https://x.test" style="font-weight:bold">Submit your predictions!</a></p>')
  })

  it('shows tied ranks explicitly and escapes names', () => {
    const rows = [
      { name: 'A<b>', total: 4 },
      { name: 'B', total: 4 },
      { name: 'C', total: 1 },
    ]
    const html = build({ previousLeaderboard: { episodeNumber: 2, rows } })
    expect(html).toContain('1. A&lt;b&gt;: 4')
    expect(html).toContain('1. B: 4')
    expect(html).toContain('3. C: 1')
    expect(html).not.toContain('<ol>')
  })

  it('omits standings when the leaderboard is empty', () => {
    expect(build({ previousLeaderboard: { episodeNumber: 2, rows: [] } })).not.toContain('Standings')
  })
})
