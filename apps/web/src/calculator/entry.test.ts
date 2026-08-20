import { expect, test } from 'vitest'
import { applyEntry, isCompleteOperand, isEnterable } from './entry.ts'

test('the decimal point never composes a value the contract rejects', () => {
  expect(applyEntry('', { kind: 'decimal' })).toBe('0.')
  expect(applyEntry('-', { kind: 'decimal' })).toBe('-0.')
  expect(applyEntry('1', { kind: 'decimal' })).toBe('1.')
  expect(applyEntry('1.5', { kind: 'decimal' })).toBe('1.5')
})

test('the sign toggles and the delete key drops the last character', () => {
  expect(applyEntry('12', { kind: 'sign' })).toBe('-12')
  expect(applyEntry('-12', { kind: 'sign' })).toBe('12')
  expect(applyEntry('12', { kind: 'delete' })).toBe('1')
  expect(applyEntry('', { kind: 'delete' })).toBe('')
})

test('a value stops at the contract length', () => {
  const full = '9'.repeat(50)
  expect(applyEntry(full, { kind: 'digit', digit: '9' })).toBe(full)
  expect(isEnterable(full + '9')).toBe(false)
})

test('a half-typed value is enterable but not yet a complete Operand', () => {
  expect(isEnterable('1.')).toBe(true)
  expect(isCompleteOperand('1.')).toBe(false)
  expect(isCompleteOperand('-0.5')).toBe(true)
  expect(isCompleteOperand('')).toBe(false)
  expect(isEnterable('1e5')).toBe(false)
  expect(isEnterable('+1')).toBe(false)
})
