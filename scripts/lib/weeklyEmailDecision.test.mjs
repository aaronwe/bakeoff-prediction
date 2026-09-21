import { describe, it, expect } from 'vitest'
import { decideWeeklyAction } from './weeklyEmailDecision.mjs'

describe('decideWeeklyAction', () => {
  it('does nothing when there is no open episode', () => {
    expect(decideWeeklyAction(null)).toEqual({ action: 'none' })
  })

  it('does nothing for a draft episode', () => {
    expect(decideWeeklyAction({ status: 'draft', email_locked_at: null })).toEqual({ action: 'none' })
  })

  it('does nothing for an already-scored episode', () => {
    expect(decideWeeklyAction({ status: 'scored', email_locked_at: '2026-01-01T00:00:00Z' })).toEqual({ action: 'none' })
  })

  it('sends when the open episode is locked', () => {
    expect(decideWeeklyAction({ status: 'open', email_locked_at: '2026-01-01T00:00:00Z' })).toEqual({ action: 'send' })
  })

  it('reminds the admin when the open episode is not locked', () => {
    expect(decideWeeklyAction({ status: 'open', email_locked_at: null })).toEqual({ action: 'remind' })
  })
})
