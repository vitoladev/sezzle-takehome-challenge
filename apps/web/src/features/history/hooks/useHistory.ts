import { useQuery } from '@tanstack/react-query'
import { getCalculations } from '@/api/client.ts'
import { historyQueryKey } from '@/api/keys.ts'

export function useHistory(sessionId: string) {
  return useQuery({
    queryKey: historyQueryKey(sessionId),
    queryFn: () => getCalculations(sessionId),
    // The panel carries its own retry; an automatic one only delays the error
    // state a visitor has to see before they can act on it.
    retry: false,
  })
}
