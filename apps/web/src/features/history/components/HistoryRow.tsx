import type { Calculation } from '@/api/client.ts'
import { isCompleteOperand } from '@/features/calculator/model/entry.ts'
import { OPERATIONS } from '@/features/calculator/model/operations.ts'
import { InexactMarker } from '@/ui/InexactMarker.tsx'
import { formatDigitCount, isLongResult } from '@/utils/result.ts'

export function HistoryRow({
  calculation,
  onUseResult,
}: {
  calculation: Calculation
  onUseResult: (result: string) => void
}) {
  const { operation, result, exact } = calculation
  const long = isLongResult(result)
  // A Result past the contract's `Operand` (`maxLength: 50`) is not an Operand
  // the API would accept, so there is nothing to carry it into.
  const carryable = isCompleteOperand(result)

  return (
    <li className="history-row" data-testid="history-row" data-exact={exact}>
      <div className="history-call">
        <span className="history-operation" data-testid="history-operation">
          {operation}
        </span>
        {OPERATIONS[operation].roles.map((role) => (
          <span className="history-operand" key={role} data-testid={`history-operand-${role}`}>
            <span className="history-role">{role}</span>
            <span className="history-operand-value">{calculation[role]}</span>
          </span>
        ))}
      </div>

      <div className="history-readout">
        {!exact && <InexactMarker testId="history-inexact-marker" />}
        <span
          className={long ? 'history-result history-result--long' : 'history-result'}
          data-testid="history-result"
        >
          {result}
        </span>
        {long && (
          <span className="history-digits" data-testid="history-digit-count">
            {formatDigitCount(result)} digits
          </span>
        )}
      </div>

      {/* A disabled button fires no pointer events, so the explanation of why
          it is disabled has to hang off something that does. */}
      <span
        className="history-carry"
        title={carryable ? undefined : 'This Result is longer than an Operand may be (50 characters).'}
      >
        <button
          className="key history-use"
          type="button"
          data-testid="history-use-result"
          disabled={!carryable}
          aria-label={
            carryable
              ? `use ${result} as the next Operand`
              : 'this Result is too long to carry into a Calculation'
          }
          onClick={() => onUseResult(result)}
          // Carrying a Result is the start of an entry flow, not the end of
          // one: the click must not park focus on this button, or the `Enter`
          // that should submit the chained Calculation belongs to the button
          // and re-carries the same Result instead. The keypad's keys do this
          // for the same reason.
          onMouseDown={(event) => event.preventDefault()}
        >
          use
        </button>
      </span>
    </li>
  )
}
