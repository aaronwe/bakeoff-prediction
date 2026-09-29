import { describe, it, expect } from 'vitest'
import { buildBonusFields, formStateFromQuestion } from './bonusFields'

describe('buildBonusFields', () => {
  it('splits and trims multiple_choice options', () => {
    expect(buildBonusFields({ type: 'multiple_choice', options: ' Red, Blue ,, ', includeEliminated: true, pickCount: '3' })).toEqual({
      options: ['Red', 'Blue'],
      include_eliminated: false,
    })
  })
  it('stores pick_count for baker_multi_pick and keeps include_eliminated', () => {
    expect(buildBonusFields({ type: 'baker_multi_pick', options: '', includeEliminated: true, pickCount: '4' })).toEqual({
      options: { pick_count: 4 },
      include_eliminated: true,
    })
  })
  it('falls back to a pick_count of 1 for blank or non-numeric input', () => {
    expect(buildBonusFields({ type: 'baker_multi_pick', options: '', includeEliminated: false, pickCount: '' }).options).toEqual({ pick_count: 1 })
    expect(buildBonusFields({ type: 'baker_multi_pick', options: '', includeEliminated: false, pickCount: 'abc' }).options).toEqual({ pick_count: 1 })
  })
  it('keeps include_eliminated for baker_pick, options null', () => {
    expect(buildBonusFields({ type: 'baker_pick', options: 'x', includeEliminated: true, pickCount: '3' })).toEqual({
      options: null,
      include_eliminated: true,
    })
  })
  it('nulls options and clears include_eliminated for free_text and judge_host_pick', () => {
    for (const type of ['free_text', 'judge_host_pick']) {
      expect(buildBonusFields({ type, options: 'x', includeEliminated: true, pickCount: '3' })).toEqual({
        options: null,
        include_eliminated: false,
      })
    }
  })
})

describe('formStateFromQuestion', () => {
  it('round-trips multiple_choice', () => {
    expect(formStateFromQuestion({ type: 'multiple_choice', options: ['Red', 'Blue'], include_eliminated: false })).toEqual({
      type: 'multiple_choice',
      options: 'Red, Blue',
      includeEliminated: false,
      pickCount: '3',
    })
  })
  it('round-trips baker_multi_pick', () => {
    expect(formStateFromQuestion({ type: 'baker_multi_pick', options: { pick_count: 2 }, include_eliminated: true })).toEqual({
      type: 'baker_multi_pick',
      options: '',
      includeEliminated: true,
      pickCount: '2',
    })
  })
  it('handles null options', () => {
    expect(formStateFromQuestion({ type: 'free_text', options: null, include_eliminated: false })).toEqual({
      type: 'free_text',
      options: '',
      includeEliminated: false,
      pickCount: '3',
    })
  })
})
