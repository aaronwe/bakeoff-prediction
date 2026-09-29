import { describe, it, expect } from 'vitest'
import { bonusOptionsFor, withSavedValue } from './bonusOptions'

const allBakers = [{ name: 'Amy' }, { name: 'Bob' }, { name: 'Cal' }]
const activeBakers = [{ name: 'Amy' }, { name: 'Bob' }]

describe('bonusOptionsFor', () => {
  it('returns the listed options for multiple_choice', () => {
    const q = { type: 'multiple_choice', options: ['Red', 'Blue'] }
    expect(bonusOptionsFor(q, allBakers, activeBakers)).toEqual(['Red', 'Blue'])
  })

  it('returns [] for multiple_choice with no options', () => {
    expect(bonusOptionsFor({ type: 'multiple_choice', options: null }, allBakers, activeBakers)).toEqual([])
  })

  it('uses active bakers for baker_pick by default', () => {
    const q = { type: 'baker_pick', include_eliminated: false }
    expect(bonusOptionsFor(q, allBakers, activeBakers)).toEqual(['Amy', 'Bob'])
  })

  it('uses all bakers for baker_pick when include_eliminated', () => {
    const q = { type: 'baker_pick', include_eliminated: true }
    expect(bonusOptionsFor(q, allBakers, activeBakers)).toEqual(['Amy', 'Bob', 'Cal'])
  })

  it('returns null for free_text (no picker)', () => {
    expect(bonusOptionsFor({ type: 'free_text' }, allBakers, activeBakers)).toBeNull()
  })
})

describe('withSavedValue', () => {
  it('leaves options alone when the saved value is present or empty', () => {
    expect(withSavedValue(['A', 'B'], 'A')).toEqual(['A', 'B'])
    expect(withSavedValue(['A', 'B'], '')).toEqual(['A', 'B'])
  })

  it('appends a saved value that is no longer an option', () => {
    expect(withSavedValue(['A', 'B'], 'Z')).toEqual(['A', 'B', 'Z'])
  })
})
