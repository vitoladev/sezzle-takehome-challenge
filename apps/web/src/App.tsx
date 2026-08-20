import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HealthIndicator } from '@/features/health/components/HealthIndicator.tsx'
import { Calculator } from '@/features/calculator/screens/Calculator.tsx'

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <main className="desk">
        <header className="strip">
          <div>
            <h1>Calculator</h1>
            <p className="tagline">Every Result is computed by the API, never in this page.</p>
          </div>
          <HealthIndicator />
        </header>
        <Calculator />
      </main>
    </QueryClientProvider>
  )
}
