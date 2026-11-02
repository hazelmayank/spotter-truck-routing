import { useQuery } from '@tanstack/react-query'
import { fetchHealth } from './api/client'

export default function App() {
  const { data, isPending, isError } = useQuery({ queryKey: ['health'], queryFn: fetchHealth })

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2">
      <h1 className="text-2xl font-semibold">Weather-Aware Truck Routing</h1>
      <p data-testid="api-status">
        {isPending ? 'Checking API…' : isError ? 'API unreachable' : `API status: ${data.status}`}
      </p>
    </main>
  )
}
