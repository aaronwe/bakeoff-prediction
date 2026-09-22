import { describe, it, expect } from 'vitest'
import { scoreHandshake, scoreBonusAnswer, computeScoreForPlayer } from './scoring'

describe('scoreHandshake', () => {
  it('awards 2 points for an exact match', () => {
    expect(scoreHandshake(5, 5)).toBe(2)
  })

  it('awards 1 point for being off by one', () => {
    expect(scoreHandshake(4, 5)).toBe(1)
    expect(scoreHandshake(6, 5)).toBe(1)
  })

  it('awards 0 points for being off by more than one', () => {
    expect(scoreHandshake(2, 5)).toBe(0)
  })

  it('awards 0 points when the guess or actual is missing', () => {
    expect(scoreHandshake(null, 5)).toBe(0)
    expect(scoreHandshake(5, null)).toBe(0)
  })

  // Additional coverage: 0 is a valid guess/actual value and must not be
  // treated as "missing" (a naive `!guess` check would break this).
  it('treats a guess or actual of 0 as a real value, not as missing', () => {
    expect(scoreHandshake(0, 0)).toBe(2)
    expect(scoreHandshake(1, 0)).toBe(1)
    expect(scoreHandshake(0, 5)).toBe(0)
  })

  it('handles the diff calculation symmetrically for values on either side', () => {
    expect(scoreHandshake(10, 8)).toBe(0)
    expect(scoreHandshake(8, 10)).toBe(0)
  })
})

describe('scoreBonusAnswer', () => {
  it('awards the question points for a matching answer, case- and whitespace-insensitive', () => {
    const bq = { type: 'free_text', correct_answer: 'Priya', points: 3 }
    expect(scoreBonusAnswer(bq, { answer_text: 'priya' })).toBe(3)
    expect(scoreBonusAnswer(bq, { answer_text: '  Priya  ' })).toBe(3)
  })

  it('awards 0 for a non-matching answer', () => {
    const bq = { type: 'free_text', correct_answer: 'Priya', points: 3 }
    expect(scoreBonusAnswer(bq, { answer_text: 'Dev' })).toBe(0)
  })

  it('awards 0 when the answer or correct_answer is missing', () => {
    const bq = { type: 'free_text', correct_answer: 'Priya', points: 3 }
    expect(scoreBonusAnswer(bq, null)).toBe(0)
    expect(scoreBonusAnswer({ type: 'free_text', correct_answer: null, points: 3 }, { answer_text: 'Priya' })).toBe(0)
  })

  // Additional coverage: an answer that is present but blank/whitespace-only
  // (e.g. a player submitted an empty string), and a correct_answer that is
  // set to an empty string rather than null/undefined (admin hasn't graded yet).
  it('awards 0 for an empty-string or whitespace-only answer', () => {
    const bq = { type: 'free_text', correct_answer: 'Priya', points: 3 }
    expect(scoreBonusAnswer(bq, { answer_text: '' })).toBe(0)
    expect(scoreBonusAnswer(bq, { answer_text: '   ' })).toBe(0)
  })

  it('awards 0 when correct_answer is an empty string', () => {
    const bq = { type: 'free_text', correct_answer: '', points: 3 }
    expect(scoreBonusAnswer(bq, { answer_text: 'Priya' })).toBe(0)
  })

  describe('baker_multi_pick', () => {
    const bq = { type: 'baker_multi_pick', correct_baker_ids: ['a', 'b', 'c'], points: 1 }

    it('awards points per correctly picked baker', () => {
      expect(scoreBonusAnswer(bq, { answer_baker_ids: ['a', 'b', 'x'] })).toBe(2)
    })

    it('awards full points for an exact match', () => {
      expect(scoreBonusAnswer(bq, { answer_baker_ids: ['a', 'b', 'c'] })).toBe(3)
    })

    it('awards 0 for no overlap', () => {
      expect(scoreBonusAnswer(bq, { answer_baker_ids: ['x', 'y'] })).toBe(0)
    })

    it('scales by points-per-baker, not a flat total', () => {
      const twoPointBq = { type: 'baker_multi_pick', correct_baker_ids: ['a', 'b', 'c'], points: 2 }
      expect(scoreBonusAnswer(twoPointBq, { answer_baker_ids: ['a', 'b'] })).toBe(4)
    })

    it('awards 0 when the player picked nothing', () => {
      expect(scoreBonusAnswer(bq, { answer_baker_ids: [] })).toBe(0)
      expect(scoreBonusAnswer(bq, null)).toBe(0)
    })

    it('awards 0 when the correct outcome is not set yet', () => {
      const ungraded = { type: 'baker_multi_pick', correct_baker_ids: null, points: 1 }
      expect(scoreBonusAnswer(ungraded, { answer_baker_ids: ['a', 'b'] })).toBe(0)
    })
  })
})

describe('computeScoreForPlayer', () => {
  const episode = {
    technical_winner_baker_id: 'baker-1',
    star_baker_id: 'baker-2',
    eliminated_baker_id: 'baker-3',
    handshake_count: 5,
  }

  it('scores all core questions correctly', () => {
    const answer = {
      technical_pick_id: 'baker-1',
      star_baker_pick_id: 'baker-2',
      eliminated_pick_id: 'baker-3',
      handshake_guess: 5,
    }
    const result = computeScoreForPlayer({ episode, answer, bonusQuestions: [], bonusAnswers: [] })
    expect(result.breakdown).toEqual({ technical: 1, star_baker: 1, eliminated: 2, handshake: 2 })
    expect(result.total).toBe(6)
  })

  it('scores wrong core picks as zero', () => {
    const answer = {
      technical_pick_id: 'wrong',
      star_baker_pick_id: 'wrong',
      eliminated_pick_id: 'wrong',
      handshake_guess: 1,
    }
    const result = computeScoreForPlayer({ episode, answer, bonusQuestions: [], bonusAnswers: [] })
    expect(result.breakdown).toEqual({ technical: 0, star_baker: 0, eliminated: 0, handshake: 0 })
    expect(result.total).toBe(0)
  })

  // Locks in the `&&` guards in computeScoreForPlayer: an unset answer key
  // (episode.*_id null) and a skipped question (answer.*_id null) must not
  // score as a match just because null === null.
  it('does not award points when both the answer key and the player pick are unset', () => {
    const episodeWithNoAnswerKey = {
      technical_winner_baker_id: null,
      star_baker_id: null,
      eliminated_baker_id: null,
      handshake_count: 5,
    }
    const answer = {
      technical_pick_id: null,
      star_baker_pick_id: null,
      eliminated_pick_id: null,
      handshake_guess: 5,
    }
    const result = computeScoreForPlayer({
      episode: episodeWithNoAnswerKey,
      answer,
      bonusQuestions: [],
      bonusAnswers: [],
    })
    expect(result.breakdown).toEqual({ technical: 0, star_baker: 0, eliminated: 0, handshake: 2 })
    expect(result.total).toBe(2)
  })

  it('includes bonus question points keyed by bonus question id', () => {
    const bonusQuestions = [
      { id: 'bq-1', type: 'free_text', correct_answer: 'Priya', points: 2 },
      { id: 'bq-2', type: 'free_text', correct_answer: 'Yes', points: 1 },
    ]
    const bonusAnswers = [
      { bonus_question_id: 'bq-1', answer_text: 'Priya' },
      { bonus_question_id: 'bq-2', answer_text: 'No' },
    ]
    const answer = {
      technical_pick_id: 'baker-1',
      star_baker_pick_id: 'baker-2',
      eliminated_pick_id: 'baker-3',
      handshake_guess: 5,
    }
    const result = computeScoreForPlayer({ episode, answer, bonusQuestions, bonusAnswers })
    expect(result.breakdown['bonus_bq-1']).toBe(2)
    expect(result.breakdown['bonus_bq-2']).toBe(0)
    expect(result.total).toBe(6 + 2 + 0)
  })

  it('includes a baker_multi_pick bonus question, scored by baker overlap', () => {
    const bonusQuestions = [
      { id: 'bq-3', type: 'baker_multi_pick', correct_baker_ids: ['x', 'y', 'z'], points: 1 },
    ]
    const bonusAnswers = [{ bonus_question_id: 'bq-3', answer_baker_ids: ['x', 'y', 'w'] }]
    const answer = {
      technical_pick_id: 'baker-1',
      star_baker_pick_id: 'baker-2',
      eliminated_pick_id: 'baker-3',
      handshake_guess: 5,
    }
    const result = computeScoreForPlayer({ episode, answer, bonusQuestions, bonusAnswers })
    expect(result.breakdown['bonus_bq-3']).toBe(2)
    expect(result.total).toBe(6 + 2)
  })

  // Additional coverage: a bonus question the player never answered at all
  // (no row in bonusAnswers, as opposed to a wrong answer) should still
  // score as 0 rather than throwing or being omitted from the breakdown.
  it('scores a bonus question with no submitted answer as 0', () => {
    const bonusQuestions = [{ id: 'bq-1', type: 'free_text', correct_answer: 'Priya', points: 2 }]
    const bonusAnswers = []
    const answer = {
      technical_pick_id: 'baker-1',
      star_baker_pick_id: 'baker-2',
      eliminated_pick_id: 'baker-3',
      handshake_guess: 5,
    }
    const result = computeScoreForPlayer({ episode, answer, bonusQuestions, bonusAnswers })
    expect(result.breakdown['bonus_bq-1']).toBe(0)
    expect(result.total).toBe(6)
  })

  // Additional coverage: a bonus question the admin hasn't graded yet
  // (correct_answer not yet set) should score as 0, not throw, even if a
  // player submitted an answer for it.
  it('scores a bonus question with no correct_answer set yet as 0', () => {
    const bonusQuestions = [{ id: 'bq-1', type: 'free_text', correct_answer: null, points: 2 }]
    const bonusAnswers = [{ bonus_question_id: 'bq-1', answer_text: 'Priya' }]
    const answer = {
      technical_pick_id: 'baker-1',
      star_baker_pick_id: 'baker-2',
      eliminated_pick_id: 'baker-3',
      handshake_guess: 5,
    }
    const result = computeScoreForPlayer({ episode, answer, bonusQuestions, bonusAnswers })
    expect(result.breakdown['bonus_bq-1']).toBe(0)
    expect(result.total).toBe(6)
  })
})
