import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { api } from './api/client.ts'
import { HealthBadge, type HealthState } from './HealthBadge.tsx'

const queryClient = new QueryClient()

function Health() {
  const { data, isPending } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const { data, error } = await api.GET('/health')
      if (error) throw error
      return data
    },
    retry: false,
  })

  const state: HealthState = isPending ? 'loading' : data?.status === 'ok' ? 'ok' : 'unavailable'
  return <HealthBadge state={state} />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <main className="flex flex-1 flex-col items-center justify-center gap-4">
        <h1>sezzle-take-home-challenge</h1>
        <Health />
      </main>
    </QueryClientProvider>
  )
}
