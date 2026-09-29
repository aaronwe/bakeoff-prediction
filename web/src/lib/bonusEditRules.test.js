import { describe, it, expect } from 'vitest'
import { editRulesFor } from './bonusEditRules'

describe('editRulesFor', () => {
  it('allows everything in draft', () => {
    expect(editRulesFor('draft')).toEqual({ prompt: true, points: true, structure: true, canDelete: true })
  })
  it('locks structure once open, but still allows delete', () => {
    expect(editRulesFor('open')).toEqual({ prompt: true, points: true, structure: false, canDelete: true })
  })
  it('allows only the prompt once scored', () => {
    expect(editRulesFor('scored')).toEqual({ prompt: true, points: false, structure: false, canDelete: false })
  })
  it('falls back to the most restrictive rules for unknown statuses', () => {
    expect(editRulesFor('weird')).toEqual(editRulesFor('scored'))
  })
})
