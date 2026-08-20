import { RetryButton } from '@/ui/RetryButton.tsx'
import { describeError } from '@/utils/describeError.ts'
import { useHistory } from '../hooks/useHistory.ts'
import { HistoryRow } from './HistoryRow.tsx'

/**
 * Mirrors `MaxItems` in apps/api/internal/store/store.go: History is bounded in
 * the panel exactly as it is in the store, so the panel can never grow past
 * what a Session keeps.
 */
const HISTORY_BOUND = 50

const SKELETON_ROWS = [0, 1, 2]

export function HistoryPanel({
  sessionId,
  onUseResult,
}: {
  sessionId: string
  onUseResult: (result: string) => void
}) {
  const { data, error, isError, isPending, isFetching, refetch } = useHistory(sessionId)
  const rows = data === undefined ? [] : data.slice(0, HISTORY_BOUND)
  const state = isPending ? 'loading' : isError ? 'error' : rows.length === 0 ? 'empty' : 'ready'
  const failure = describeError(error)

  return (
    <section className="panel" aria-label="History" data-testid="history" data-state={state}>
      <div className="panel-caption">
        <span>history</span>
        <span>newest first</span>
      </div>

      {state === 'loading' && (
        <ol className="history-rows" data-testid="history-skeleton" aria-busy="true">
          {SKELETON_ROWS.map((row) => (
            <li className="history-row history-row--skeleton" key={row}>
              <span className="skeleton-bar skeleton-bar--call" />
              <span className="skeleton-bar skeleton-bar--result" />
            </li>
          ))}
        </ol>
      )}

      {state === 'error' && (
        <div className="panel-notice" data-testid="history-error" role="alert">
          <p className="notice-message" data-testid="history-error-message">
            {failure.message}
          </p>
          <RetryButton
            onClick={() => void refetch()}
            disabled={isFetching}
            testId="history-retry"
          />
        </div>
      )}

      {state === 'empty' && (
        <p className="panel-notice panel-notice--empty" data-testid="history-empty">
          No Calculations yet. Every one this Session performs is kept here: the last{' '}
          {HISTORY_BOUND}, newest first.
        </p>
      )}

      {state === 'ready' && (
        <ol className="history-rows" data-testid="history-rows">
          {rows.map((calculation, index) => (
            // The contract gives a Calculation no identifier and the same
            // Calculation may legitimately appear twice, so position is the
            // only key available. Rows hold no state of their own, so a
            // position shifting under a new Calculation strands nothing.
            <HistoryRow key={index} calculation={calculation} onUseResult={onUseResult} />
          ))}
        </ol>
      )}
    </section>
  )
}
