import type { KeypadAction } from './entry.ts'

export function actionForKey(key: string): KeypadAction | null {
  if (/^[0-9]$/.test(key)) return { kind: 'digit', digit: key }

  switch (key) {
    case '.':
      return { kind: 'decimal' }
    case '+':
      return { kind: 'operation', operation: 'add' }
    case '-':
      return { kind: 'operation', operation: 'subtract' }
    case '*':
      return { kind: 'operation', operation: 'multiply' }
    case '/':
      return { kind: 'operation', operation: 'divide' }
    case 'Enter':
    case '=':
      return { kind: 'submit' }
    case 'Escape':
      return { kind: 'clear' }
    case 'Backspace':
      return { kind: 'delete' }
    default:
      return null
  }
}
