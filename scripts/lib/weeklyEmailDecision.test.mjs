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

  it('sends when the open episode is locked and not yet sent', () => {
    expect(
      decideWeeklyAction({ status: 'open', email_locked_at: '2026-01-01T00:00:00Z', email_sent_at: null }),
    ).toEqual({ action: 'send' })
  })

  it('reminds the admin when the open episode is not locked', () => {
    expect(decideWeeklyAction({ status: 'open', email_locked_at: null, email_sent_at: null })).toEqual({
      action: 'remind',
    })
  })

  // Locks in the duplicate-send guard: an admin using the "Send now" GitHub
  // Actions link (Task 10) mid-week must not also get emailed again by the
  // Thursday cron for the same still-open, still-locked episode.
  it('does nothing when the locked episode has already been sent', () => {
    expect(
      decideWeeklyAction({
        status: 'open',
        email_locked_at: '2026-01-01T00:00:00Z',
        email_sent_at: '2026-01-01T00:05:00Z',
      }),
    ).toEqual({ action: 'none' })
  })
})
