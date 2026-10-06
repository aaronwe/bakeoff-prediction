import { describe, it, expect } from 'vitest'
import {
  CORRECT,
  INCORRECT,
  UNSCORED,
  technicalResult,
  handshakeResult,
  bonusTextResult,
  bonusBakerResult,
} from './answerCorrectness'

describe('technicalResult', () => {
  const episode = { technical_winner_baker_id: 'a' }
  it('is correct on a match and incorrect otherwise', () => {
    expect(technicalResult({ technical_pick_id: 'a' }, episode)).toBe(CORRECT)
    expect(technicalResult({ technical_pick_id: 'b' }, episode)).toBe(INCORRECT)
  })
  it('is unscored with no answer or no answer key', () => {
    expect(technicalResult(undefined, episode)).toBe(UNSCORED)
    expect(technicalResult({ technical_pick_id: null }, episode)).toBe(UNSCORED)
    expect(technicalResult({ technical_pick_id: 'a' }, { technical_winner_baker_id: null })).toBe(UNSCORED)
  })
})

describe('handshakeResult', () => {
  const episode = { handshake_count: 5 }
  it('counts any point-scoring guess (exact or off by one) as correct', () => {
    expect(handshakeResult({ handshake_guess: 5 }, episode)).toBe(CORRECT)
    expect(handshakeResult({ handshake_guess: 4 }, episode)).toBe(CORRECT)
    expect(handshakeResult({ handshake_guess: 6 }, episode)).toBe(CORRECT)
  })
  it('is incorrect when off by more than one', () => {
    expect(handshakeResult({ handshake_guess: 7 }, episode)).toBe(INCORRECT)
  })
  it('treats a guess of 0 as a real answer', () => {
    expect(handshakeResult({ handshake_guess: 0 }, { handshake_count: 0 })).toBe(CORRECT)
  })
  it('is unscored with no guess or no answer key', () => {
    expect(handshakeResult(undefined, episode)).toBe(UNSCORED)
    expect(handshakeResult({ handshake_guess: 5 }, { handshake_count: null })).toBe(UNSCORED)
  })
})

describe('bonusTextResult', () => {
  const bq = { type: 'text', points: 2, correct_answer: 'Yes' }
  it('matches case-insensitively', () => {
    expect(bonusTextResult(bq, { answer_text: ' yes ' })).toBe(CORRECT)
    expect(bonusTextResult(bq, { answer_text: 'no' })).toBe(INCORRECT)
  })
  it('is unscored with no answer or no key', () => {
    expect(bonusTextResult(bq, undefined)).toBe(UNSCORED)
    expect(bonusTextResult({ ...bq, correct_answer: null }, { answer_text: 'yes' })).toBe(UNSCORED)
  })
})

describe('bonusTextResult for closest_number', () => {
  const bq = { id: 'q', type: 'closest_number', correct_answer: '24' }
  const all = [
    { bonus_question_id: 'q', answer_text: '24' },
    { bonus_question_id: 'q', answer_text: '20' },
    { bonus_question_id: 'q', answer_text: '30' },
    { bonus_question_id: 'q', answer_text: '30' },
    { bonus_question_id: 'q', answer_text: '99' },
  ]
  it('is correct for any placing that earns points and incorrect otherwise', () => {
    expect(bonusTextResult(bq, all[0], all)).toBe(CORRECT)
    expect(bonusTextResult(bq, all[2], all)).toBe(CORRECT)
    expect(bonusTextResult(bq, all[4], all)).toBe(INCORRECT)
  })
  it('is unscored with no answer or no key', () => {
    expect(bonusTextResult(bq, undefined, all)).toBe(UNSCORED)
    expect(bonusTextResult({ ...bq, correct_answer: null }, all[0], all)).toBe(UNSCORED)
  })
})

describe('bonusBakerResult', () => {
  const bq = { correct_baker_ids: ['a', 'b'] }
  it('judges each baker separately', () => {
    expect(bonusBakerResult(bq, 'a')).toBe(CORRECT)
    expect(bonusBakerResult(bq, 'c')).toBe(INCORRECT)
  })
  it('is unscored with no key', () => {
    expect(bonusBakerResult({ correct_baker_ids: [] }, 'a')).toBe(UNSCORED)
  })
})
