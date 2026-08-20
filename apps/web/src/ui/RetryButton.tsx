/** The one "try again" affordance: a refusal is never a dead end. */
export function RetryButton({
  onClick,
  disabled,
  testId,
}: {
  onClick: () => void
  disabled: boolean
  testId: string
}) {
  return (
    <button className="key" type="button" onClick={onClick} disabled={disabled} data-testid={testId}>
      Try again
    </button>
  )
}
