import type { ReactNode } from 'react'
import type { Calculation } from '../api/client.ts'

/**
 * Precision — how many significant digits an inexact Result keeps. Mirrors
 * `Precision` in apps/api/internal/calc/calc.go; the contract carries no field
 * for it, so the tooltip names it from here.
 */
const PRECISION = 28

/** Past this length a Result gets its own scrolling well and a digit count. */
const LONG_RESULT = 40

const count = new Intl.NumberFormat()

export function ResultDisplay({
  calculation,
  pending,
  failed,
}: {
  calculation: Calculation | undefined
  pending: boolean
  failed: boolean
}) {
  if (pending) {
    return (
      <Row state="pending">
        <span className="readout readout--muted">computing…</span>
      </Row>
    )
  }

  // The last Result must not stand next to the failure of a newer Calculation.
  if (failed) {
    return (
      <Row state="failed">
        <span className="readout readout--muted">No Result. The API refused this Calculation.</span>
      </Row>
    )
  }

  if (!calculation) {
    return (
      <Row state="empty">
        <span className="readout readout--muted">Fill the Operands, then press =</span>
      </Row>
    )
  }

  const long = calculation.result.length > LONG_RESULT
  const digits = calculation.result.replace(/\D/g, '').length

  return (
    <Row state="ready" exact={calculation.exact}>
      {!calculation.exact && (
        <span
          className="marker"
          data-testid="result-inexact-marker"
          title={`Inexact: the Result keeps ${PRECISION} significant digits (Precision); the true value has more.`}
        >
          ≈
        </span>
      )}
      <output className={long ? 'readout readout--long' : 'readout'} data-testid="result-value">
        {calculation.result}
      </output>
      {long && (
        <span className="digit-count" data-testid="result-digit-count">
          {count.format(digits)} digits
        </span>
      )}
    </Row>
  )
}

function Row({
  state,
  exact,
  children,
}: {
  state: string
  exact?: boolean
  children: ReactNode
}) {
  return (
    <div className="ticket-row ticket-row--result" data-testid="result" data-state={state} data-exact={exact}>
      <span className="role">result</span>
      <div className="ticket-value">{children}</div>
    </div>
  )
}
