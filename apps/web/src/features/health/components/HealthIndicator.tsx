import { HealthBadge } from './HealthBadge.tsx'
import { useHealth } from '../hooks/useHealth.ts'

/** The header lamp: a backend that is not running is visible, never inferred. */
export function HealthIndicator() {
  const state = useHealth()

  return <HealthBadge state={state} />
}
