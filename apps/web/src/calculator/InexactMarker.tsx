/**
 * Precision — how many significant digits an inexact Result keeps. Mirrors
 * `Precision` in apps/api/internal/calc/calc.go; the contract carries no field
 * for it, so the tooltip names it from here.
 */
const PRECISION = 28

/**
 * The one inexactness marker in the interface: wherever a Result is rendered —
 * the readout or a History row — a rounded one wears this and never reads as
 * exact.
 */
export function InexactMarker({ testId }: { testId: string }) {
  return (
    <span
      className="marker"
      data-testid={testId}
      title={`Inexact — the Result keeps ${PRECISION} significant digits (Precision); the true value has more.`}
    >
      ≈
    </span>
  )
}
