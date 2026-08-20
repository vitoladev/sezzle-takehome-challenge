import { isEnterable } from '../model/entry.ts'
import { OPERATIONS, type OperandRole, type OperandValues, type Operation } from '../model/operations.ts'

export function OperandFields({
  operation,
  operands,
  activeRole,
  onActivate,
  onChange,
}: {
  operation: Operation
  operands: OperandValues
  activeRole: OperandRole
  onActivate: (role: OperandRole) => void
  onChange: (role: OperandRole, value: string) => void
}) {
  return (
    <div className="ticket-rows">
      {OPERATIONS[operation].roles.map((role) => (
        <label className="ticket-row" key={role} data-testid={`operand-row-${role}`}>
          <span className="role">{role}</span>
          <input
            className="ticket-value operand-input"
            data-testid={`operand-${role}`}
            data-operand-field=""
            value={operands[role]}
            onChange={(event) => {
              if (isEnterable(event.target.value)) onChange(role, event.target.value)
            }}
            onFocus={() => onActivate(role)}
            aria-label={role}
            autoComplete="off"
            inputMode="decimal"
            spellCheck={false}
            placeholder="0"
            data-active={role === activeRole}
          />
        </label>
      ))}
    </div>
  )
}
