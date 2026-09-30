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

  const standingsRows = [
    { name: 'A<b>', total: 4 },
    { name: 'B', total: 4 },
    { name: 'C', total: 1 },
  ]
  const standings = (siteUrl = 'https://x.test') =>
    build({ siteUrl, previousLeaderboard: { episodeNumber: 2, rows: standingsRows } })

  it('renders standings as an inline-styled table', () => {
    const html = standings()
    expect(html).toContain('<table')
    expect(html).toContain('border-collapse:collapse')
    expect(html).toContain('max-width:480px')
    expect(html).toContain('>Rank</th>')
    expect(html).toContain('>Player</th>')
    expect(html).toContain('>Points</th>')
    expect(html).toContain('background:#fbf3dc')
    expect(html).not.toMatch(/class=/)
    expect(html.match(/<tr/g)).toHaveLength(4)
    expect(html).not.toContain('<p style="margin:2px 0">')
  })

  it('shares ranks for ties and escapes names', () => {
    const html = standings()
    const cells = [...html.matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map((m) => m[1])
    expect(cells).toEqual(['1', 'A&lt;b&gt;', '4', '1', 'B', '4', '3', 'C', '1'])
    expect(html).not.toContain('A<b>')
  })

  it('links the heading and a footer link to the leaderboard', () => {
    const html = standings()
    expect(html).toMatch(/<h3[^>]*><a href="https:\/\/x\.test\/#\/leaderboard"[^>]*>Standings after episode 2<\/a><\/h3>/)
    expect(html).toMatch(/<a href="https:\/\/x\.test\/#\/leaderboard"[^>]*>View full leaderboard<\/a>/)
  })

  it('strips a trailing slash from siteUrl and escapes the href', () => {
    expect(standings('https://x.test/')).toContain('href="https://x.test/#/leaderboard"')
    expect(standings('https://x.test/?a=1&b="2"/')).toContain('href="https://x.test/?a=1&amp;b=&quot;2&quot;/#/leaderboard"')
  })

  it('htmlToText renders standings one row per line with the leaderboard URL', () => {
    const text = htmlToText(standings(), 'https://x.test')
    expect(text).toContain('Standings after episode 2')
    expect(text).toContain('\n1. A&lt;b&gt;: 4\n1. B: 4\n3. C: 1\n')
    expect(text).toContain('View full leaderboard: https://x.test/#/leaderboard')
    expect(text).not.toMatch(/RankPlayerPoints/)
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
