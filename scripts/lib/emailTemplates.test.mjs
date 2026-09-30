import { describe, it, expect } from 'vitest'
import { buildWeeklyEmailHtml, rankRows, htmlToText } from './emailTemplates.mjs'

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
    expect(html).toContain('<p>Hello <strong>world</strong><br>next line</p>')
    expect(html).toContain('<p>New para</p>')
  })

  it('escapes raw HTML in the intro', () => {
    const html = build({ episode: { ...episode, intro_note: '<script>alert(1)</script> hi' } })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('renders nothing for a blank intro', () => {
    const html = build({ episode: { ...episode, intro_note: '  \n ' } })
    expect(html).toBe(build())
    expect(html).not.toMatch(/<h2>[^]*<\/h2>\s*<p>(?!This week)/)
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

  it('allows only safe link schemes', () => {
    const bad = build({ episode: { ...episode, intro_note: '[x](javascript:alert(1))' } })
    expect(bad).not.toContain('javascript:')
    expect(bad).not.toContain('<a href="javascript')
    expect(bad).toContain('<p>x</p>')
    const ok = build({ episode: { ...episode, intro_note: '[x](https://ok.test)' } })
    expect(ok).toContain('<a href="https://ok.test">x</a>')
  })

  it('renders images as alt text only', () => {
    const html = build({ episode: { ...episode, intro_note: '![pic](https://x/y.png)' } })
    expect(html).not.toContain('<img')
    expect(html).toContain('<p>pic</p>')
  })

  it('does not double-escape code spans', () => {
    const html = build({ episode: { ...episode, intro_note: '`a & <b>`' } })
    expect(html).toContain('<code>a &amp; &lt;b&gt;</code>')
  })
})

describe('htmlToText', () => {
  it('keeps line breaks, strips tags, appends the site link', () => {
    const text = htmlToText('<p>One<br>Two</p><p>Three</p>', 'https://x.test')
    expect(text).toBe('One\nTwo\nThree\n\nSubmit your predictions: https://x.test\n')
  })
})
