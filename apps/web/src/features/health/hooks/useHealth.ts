import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client.ts'
import type { HealthState } from '../components/HealthBadge.tsx'

/** Health belongs to no Session, and nothing outside this hook reads it. */
const HEALTH_KEY = ['health'] as const

/**
 * Whether the API is answering. Reported as one of three states rather than a
 * boolean, so "not asked yet" is never rendered as "down".
 */
export function useHealth(): HealthState {
  const { data, isPending } = useQuery({
    queryKey: HEALTH_KEY,
    queryFn: async () => {
      const { data, error } = await api.GET('/health')
      if (error) throw error
      return data
    },
    // A probe that retries hides the very outage it exists to report.
    retry: false,
  })

  return isPending ? 'loading' : data?.status === 'ok' ? 'ok' : 'unavailable'
}
