import { ApiFailure } from '../api/client.ts'

/** A failure the API never saw — nothing to render from the contract's Error. */
const NO_RESPONSE = {
  code: 'no_response',
  message: 'The API did not answer. Check that the server is running, then try again.',
}

/** The code and message to render for a rejection, whoever caught it. */
export function describeError(error: unknown): { code: string; message: string } {
  return error instanceof ApiFailure
    ? { code: error.body.error, message: error.body.message }
    : NO_RESPONSE
}

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
      <button className="key" type="button" onClick={onRetry} disabled={retryDisabled} data-testid="retry">
        Try again
      </button>
    </div>
  )
}
