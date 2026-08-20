import { useQuery } from '@tanstack/react-query'
import { getCalculations } from '../api/client.ts'

/**
 * The History cache entry for one Session. The Session identifier is part of
 * the key — not just a header the request happens to carry — so two Sessions
 * can never read each other's History out of the cache. The same binding the
 * key is built from is the one `getCalculations` sends, so the two agree by
 * construction rather than because both happen to reach the same storage.
 */
export function historyQueryKey(sessionId: string) {
  return ['calculations', sessionId] as const
}

export function useHistory(sessionId: string) {
  return useQuery({
    queryKey: historyQueryKey(sessionId),
    queryFn: () => getCalculations(sessionId),
    // The panel carries its own retry; an automatic one only delays the error
    // state a visitor has to see before they can act on it.
    retry: false,
  })
}
