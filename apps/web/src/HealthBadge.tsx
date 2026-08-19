export type HealthState = 'loading' | 'ok' | 'unavailable'

const labels: Record<HealthState, string> = {
  loading: 'Checking API…',
  ok: 'API is up',
  unavailable: 'API is unavailable',
}

export function HealthBadge({ state }: { state: HealthState }) {
  return (
    <p data-testid="health-badge" data-state={state}>
      <code>{labels[state]}</code>
    </p>
  )
}
