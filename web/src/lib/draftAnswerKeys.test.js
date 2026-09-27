import { describe, it, expect } from 'vitest'
import { resolveEpisodeAnswerKeyDefaults, resolveBonusAnswerKeyDefaults } from './draftAnswerKeys'

describe('resolveEpisodeAnswerKeyDefaults', () => {
  it('falls back to blank when neither a real answer nor a draft exists', () => {
    const episode = {}
    expect(resolveEpisodeAnswerKeyDefaults(episode, null)).toEqual({
      technicalWinner: '',
      starBaker: '',
      eliminated: '',
      handshakeCount: '',
    })
  })

  it('uses the draft when no real answer is set yet', () => {
    const episode = {}
    const draft = {
      technical_winner_baker_id: 'baker-1',
      star_baker_id: 'baker-2',
      eliminated_baker_id: 'baker-3',
      handshake_count: 4,
    }
    expect(resolveEpisodeAnswerKeyDefaults(episode, draft)).toEqual({
      technicalWinner: 'baker-1',
      starBaker: 'baker-2',
      eliminated: 'baker-3',
      handshakeCount: 4,
    })
  })

  it('prefers the real answer over a leftover draft', () => {
    const episode = {
      technical_winner_baker_id: 'real-1',
      star_baker_id: 'real-2',
      eliminated_baker_id: 'real-3',
      handshake_count: 7,
    }
    const draft = {
      technical_winner_baker_id: 'draft-1',
      star_baker_id: 'draft-2',
      eliminated_baker_id: 'draft-3',
      handshake_count: 1,
    }
    expect(resolveEpisodeAnswerKeyDefaults(episode, draft)).toEqual({
      technicalWinner: 'real-1',
      starBaker: 'real-2',
      eliminated: 'real-3',
      handshakeCount: 7,
    })
  })

  // A handshake count of 0 is a real, final answer — `||` would wrongly
  // treat it as missing and fall through to the draft/blank value.
  it('treats a real or draft handshake count of 0 as a real value, not as missing', () => {
    expect(resolveEpisodeAnswerKeyDefaults({ handshake_count: 0 }, { handshake_count: 9 }).handshakeCount).toBe(0)
    expect(resolveEpisodeAnswerKeyDefaults({}, { handshake_count: 0 }).handshakeCount).toBe(0)
  })
})

describe('resolveBonusAnswerKeyDefaults', () => {
  it('falls back to blank/empty when neither a real answer nor a draft exists', () => {
    expect(resolveBonusAnswerKeyDefaults({}, null)).toEqual({ text: '', bakerIds: [] })
  })

  it('uses the draft when no real answer is set yet', () => {
    const bq = {}
    const draft = { correct_answer: 'Priya', correct_baker_ids: ['b1', 'b2'] }
    expect(resolveBonusAnswerKeyDefaults(bq, draft)).toEqual({ text: 'Priya', bakerIds: ['b1', 'b2'] })
  })

  it('prefers the real answer over a leftover draft', () => {
    const bq = { correct_answer: 'Real answer', correct_baker_ids: ['real'] }
    const draft = { correct_answer: 'Draft answer', correct_baker_ids: ['draft'] }
    expect(resolveBonusAnswerKeyDefaults(bq, draft)).toEqual({ text: 'Real answer', bakerIds: ['real'] })
  })
})
