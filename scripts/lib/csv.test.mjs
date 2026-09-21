import { describe, it, expect } from 'vitest'
import { toCsv } from './csv.mjs'

describe('toCsv', () => {
  it('produces a header row and one row per record', () => {
    const rows = [{ name: 'Aaron', total: 5 }, { name: 'Priya', total: 3 }]
    const csv = toCsv(rows, ['name', 'total'])
    expect(csv).toBe('name,total\nAaron,5\nPriya,3\n')
  })

  it('quotes fields containing commas, quotes, or newlines', () => {
    const rows = [{ note: 'has, a comma' }, { note: 'has "quotes"' }, { note: 'has\na newline' }]
    const csv = toCsv(rows, ['note'])
    expect(csv).toBe('note\n"has, a comma"\n"has ""quotes"""\n"has\na newline"\n')
  })

  it('quotes fields containing carriage returns', () => {
    const rows = [{ note: 'has\r\na crlf' }]
    const csv = toCsv(rows, ['note'])
    expect(csv).toBe('note\n"has\r\na crlf"\n')
  })

  it('renders null/undefined as empty string', () => {
    const rows = [{ a: null, b: undefined }]
    const csv = toCsv(rows, ['a', 'b'])
    expect(csv).toBe('a,b\n,\n')
  })

  it('handles empty rows array', () => {
    const csv = toCsv([], ['a', 'b'])
    expect(csv).toBe('a,b\n')
  })

  it('handles boolean and number types', () => {
    const rows = [{ flag: true, count: 0, override: false }]
    const csv = toCsv(rows, ['flag', 'count', 'override'])
    expect(csv).toBe('flag,count,override\ntrue,0,false\n')
  })

  it('correctly escapes JSON strings containing quotes and commas', () => {
    const rows = [{ breakdown: JSON.stringify({ technical: 5, star_baker: 10 }) }]
    const csv = toCsv(rows, ['breakdown'])
    expect(csv).toBe('breakdown\n"{""technical"":5,""star_baker"":10}"\n')
  })
})
