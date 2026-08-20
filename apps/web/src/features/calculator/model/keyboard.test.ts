import { expect, test } from 'vitest'
import { actionForKey } from './keyboard.ts'

test('digits and the decimal point enter Operand values', () => {
  for (const digit of ['0', '5', '9']) {
    expect(actionForKey(digit)).toEqual({ kind: 'digit', digit })
  }
  expect(actionForKey('.')).toEqual({ kind: 'decimal' })
})

test('the arithmetic keys select their Operation', () => {
  expect(actionForKey('+')).toEqual({ kind: 'operation', operation: 'add' })
  expect(actionForKey('-')).toEqual({ kind: 'operation', operation: 'subtract' })
  expect(actionForKey('*')).toEqual({ kind: 'operation', operation: 'multiply' })
  expect(actionForKey('/')).toEqual({ kind: 'operation', operation: 'divide' })
})

test('Enter and = submit, Escape clears, Backspace deletes', () => {
  expect(actionForKey('Enter')).toEqual({ kind: 'submit' })
  expect(actionForKey('=')).toEqual({ kind: 'submit' })
  expect(actionForKey('Escape')).toEqual({ kind: 'clear' })
  expect(actionForKey('Backspace')).toEqual({ kind: 'delete' })
})

test('an unbound key does nothing', () => {
  expect(actionForKey('a')).toBeNull()
  expect(actionForKey('Tab')).toBeNull()
})
