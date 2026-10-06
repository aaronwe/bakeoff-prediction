import { describe, it, expect } from 'vitest'
import { scoreHandshake, scoreBonusAnswer, scoreClosestNumber, computeScoreForPlayer } from './scoring'

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

  // Additional coverage: a question turned off for the episode (e.g. no
  // elimination that week) must be omitted from the breakdown entirely, not
  // just scored as 0 — the admin toggles this off precisely so the question
  // never applied, and the breakdown should reflect that.
  it('omits a disabled regular question from the breakdown', () => {
    const episodeWithEliminationOff = { ...episode, eliminated_enabled: false }
    const answer = {
      technical_pick_id: 'baker-1',
      star_baker_pick_id: 'baker-2',
      eliminated_pick_id: 'baker-3',
      handshake_guess: 5,
    }
    const result = computeScoreForPlayer({
      episode: episodeWithEliminationOff,
      answer,
      bonusQuestions: [],
      bonusAnswers: [],
    })
    expect(result.breakdown).toEqual({ technical: 1, star_baker: 1, handshake: 2 })
    expect(result.total).toBe(4)
  })

  it('treats a missing *_enabled flag as enabled (back-compat with episodes/tests predating the column)', () => {
    const answer = {
      technical_pick_id: 'baker-1',
      star_baker_pick_id: 'baker-2',
      eliminated_pick_id: 'baker-3',
      handshake_guess: 5,
    }
    const result = computeScoreForPlayer({ episode, answer, bonusQuestions: [], bonusAnswers: [] })
    expect(Object.keys(result.breakdown)).toEqual(['technical', 'star_baker', 'eliminated', 'handshake'])
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

describe('scoreClosestNumber', () => {
  const bq = { id: 'q', type: 'closest_number', correct_answer: '24', points: 1 }
  const ans = (player_id, answer_text) => ({ bonus_question_id: 'q', player_id, answer_text })
  const pointsFor = (guesses) => {
    const all = guesses.map((g, i) => ans(`p${i}`, g))
    return all.map((a) => scoreClosestNumber(bq, a, all))
  }

  it('awards 3, 2, 1 to the three closest guesses', () => {
    expect(pointsFor(['24', '20', '30', '50'])).toEqual([3, 2, 1, 0])
  })

  it('ranks by distance regardless of over or under', () => {
    expect(pointsFor(['30', '23', '18'])).toEqual([2, 3, 2])
  })

  it('gives tied players the higher place and skips the next ones', () => {
    expect(pointsFor(['25', '20', '20', '20'])).toEqual([3, 2, 2, 2])
  })

  it('uses absolute distance, so over and under tie (no Price Is Right rules)', () => {
    const key21 = { ...bq, correct_answer: '21' }
    const all = ['20', '22', '19', '23'].map((g, i) => ans(`p${i}`, g))
    expect(all.map((a) => scoreClosestNumber(key21, a, all))).toEqual([3, 3, 1, 1])
  })

  it('gives both players 3 when tied for first, then 1 for the next', () => {
    expect(pointsFor(['23', '25', '20', '10'])).toEqual([3, 3, 1, 0])
  })

  it('scores nothing for 4th place or lower', () => {
    expect(pointsFor(['24', '25', '26', '27'])).toEqual([3, 2, 1, 0])
  })

  it('ignores blank and non-numeric guesses, which take no rank', () => {
    expect(pointsFor(['', 'lots', '24', '10'])).toEqual([0, 0, 3, 2])
  })

  it('treats a guess or key of 0 as a real value', () => {
    const zeroBq = { ...bq, correct_answer: '0' }
    const all = [ans('a', '0'), ans('b', '2')]
    expect(all.map((a) => scoreClosestNumber(zeroBq, a, all))).toEqual([3, 2])
  })

  it('scores 0 when there is no answer key or no answer', () => {
    const all = [ans('a', '5')]
    expect(scoreClosestNumber({ ...bq, correct_answer: null }, all[0], all)).toBe(0)
    expect(scoreClosestNumber(bq, undefined, all)).toBe(0)
  })

  it('is used by scoreBonusAnswer and ignores the question points', () => {
    const all = [ans('a', '24'), ans('b', '20')]
    const big = { ...bq, points: 10 }
    expect(scoreBonusAnswer(big, all[0], all)).toBe(3)
    expect(scoreBonusAnswer(big, all[1], all)).toBe(2)
  })
})

describe('computeScoreForPlayer with closest_number', () => {
  it('ranks against every player\'s answers, not just the scored player\'s', () => {
    const bq = { id: 'q', type: 'closest_number', correct_answer: '24', points: 1 }
    const mine = { bonus_question_id: 'q', player_id: 'me', answer_text: '20' }
    const theirs = { bonus_question_id: 'q', player_id: 'them', answer_text: '24' }
    const { breakdown } = computeScoreForPlayer({
      episode: {},
      answer: {},
      bonusQuestions: [bq],
      bonusAnswers: [mine],
      allBonusAnswers: [mine, theirs],
    })
    expect(breakdown.bonus_q).toBe(2)
  })
})
