import type { Operation } from './operations.ts'

/** What a keypad key — or the keyboard key bound to it — does. */
export type KeypadAction =
  | { kind: 'digit'; digit: string }
  | { kind: 'decimal' }
  | { kind: 'sign' }
  | { kind: 'delete' }
  | { kind: 'clear' }
  | { kind: 'submit' }
  | { kind: 'operation'; operation: Operation }

/** The contract's `Operand`: `pattern: ^-?\d+(\.\d+)?$`, `maxLength: 50`. */
const COMPLETE = /^-?\d+(\.\d+)?$/
const MAX_LENGTH = 50

/** Half-typed values the fields accept on the way to a complete Operand. */
const ENTERABLE = /^-?\d*(\.\d*)?$/

export function isCompleteOperand(value: string): boolean {
  return value.length <= MAX_LENGTH && COMPLETE.test(value)
}

export function isEnterable(value: string): boolean {
  return value.length <= MAX_LENGTH && ENTERABLE.test(value)
}

export function applyEntry(value: string, action: KeypadAction): string {
  switch (action.kind) {
    case 'digit':
      return value.length < MAX_LENGTH ? value + action.digit : value
    case 'decimal':
      if (value.includes('.')) return value
      // A bare `.5` and a trailing `1.` are both outside the contract's
      // pattern, so the point always arrives with a leading digit.
      return value === '' || value === '-' ? value + '0.' : value + '.'
    case 'sign':
      return value.startsWith('-') ? value.slice(1) : '-' + value
    case 'delete':
      return value.slice(0, -1)
    default:
      return value
  }
}
