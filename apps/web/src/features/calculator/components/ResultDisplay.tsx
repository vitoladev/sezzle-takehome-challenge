import type { ReactNode } from 'react'
import type { Calculation } from '@/api/client.ts'
import { InexactMarker } from '@/ui/InexactMarker.tsx'
import { formatDigitCount, isLongResult } from '@/utils/result.ts'

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

  const long = isLongResult(calculation.result)
  const digits = formatDigitCount(calculation.result)

  return (
    <Row state="ready" exact={calculation.exact}>
      {!calculation.exact && <InexactMarker testId="result-inexact-marker" />}
      <output className={long ? 'readout readout--long' : 'readout'} data-testid="result-value">
        {calculation.result}
      </output>
      {long && (
        <span className="digit-count" data-testid="result-digit-count">
          {digits} digits
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
