import type { KeypadAction } from './entry.ts'
import { OPERATIONS, OPERATION_ORDER, type Operation } from './operations.ts'

const DIGIT_ROWS = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
]

export function Keypad({
  operation,
  canSubmit,
  pending,
  onAction,
}: {
  operation: Operation
  canSubmit: boolean
  pending: boolean
  onAction: (action: KeypadAction) => void
}) {
  return (
    // Pressing a key must not pull focus out of the Operand field being typed.
    <div className="keypad" onMouseDown={(event) => event.preventDefault()}>
      <div className="keypad-digits">
        {DIGIT_ROWS.flat().map((digit) => (
          <Key key={digit} testId={`key-${digit}`} onPress={() => onAction({ kind: 'digit', digit })}>
            {digit}
          </Key>
        ))}
        <Key testId="key-0" onPress={() => onAction({ kind: 'digit', digit: '0' })}>
          0
        </Key>
        <Key testId="key-decimal" onPress={() => onAction({ kind: 'decimal' })}>
          .
        </Key>
        <Key testId="key-sign" label="toggle sign" onPress={() => onAction({ kind: 'sign' })}>
          ±
        </Key>
      </div>

      <div className="keypad-operations">
        {OPERATION_ORDER.map((candidate) => (
          <Key
            key={candidate}
            testId={`op-${candidate}`}
            label={candidate}
            pressed={candidate === operation}
            onPress={() => onAction({ kind: 'operation', operation: candidate })}
          >
            {OPERATIONS[candidate].symbol}
          </Key>
        ))}
      </div>

      <div className="keypad-commands">
        <Key testId="key-delete" label="delete" onPress={() => onAction({ kind: 'delete' })}>
          ⌫
        </Key>
        <Key testId="key-clear" label="clear" onPress={() => onAction({ kind: 'clear' })}>
          C
        </Key>
        <button
          className="key key--equals"
          type="button"
          data-testid="key-equals"
          aria-label="equals"
          onClick={() => onAction({ kind: 'submit' })}
          disabled={!canSubmit || pending}
          aria-busy={pending}
        >
          {pending ? '…' : '='}
        </button>
      </div>
    </div>
  )
}

function Key({
  testId,
  label,
  pressed,
  onPress,
  children,
}: {
  testId: string
  label?: string
  pressed?: boolean
  onPress: () => void
  children: string
}) {
  return (
    <button
      className="key"
      type="button"
      data-testid={testId}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onPress}
    >
      {children}
    </button>
  )
}
