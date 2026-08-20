import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { api } from './api/client.ts'
import { Calculator } from './calculator/Calculator.tsx'
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
      <main className="desk">
        <header className="strip">
          <div>
            <h1>Calculator</h1>
            <p className="tagline">Every Result is computed by the API, never in this page.</p>
          </div>
          <Health />
        </header>
        <Calculator />
      </main>
    </QueryClientProvider>
  )
}
