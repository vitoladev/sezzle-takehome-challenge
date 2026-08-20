import { RetryButton } from '@/ui/RetryButton.tsx'
import { describeError } from '@/utils/describeError.ts'

export function ErrorNotice({
  error,
  onRetry,
  retryDisabled,
}: {
  error: unknown
  onRetry: () => void
  retryDisabled: boolean
}) {
  const { code, message } = describeError(error)

  return (
    <div className="notice" data-testid="error" data-error-code={code} role="alert">
      <span className="notice-code" data-testid="error-code">
        {code}
      </span>
      <p className="notice-message" data-testid="error-message">
        {message}
      </p>
      <RetryButton onClick={onRetry} disabled={retryDisabled} testId="retry" />
    </div>
  )
}
