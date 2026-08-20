import type { ApiError, Health } from '@sezzle/api-contract'
import type { ComponentType } from 'react'
import { beforeAll, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'

const DOWN: ApiError = { error: 'internal_error', message: 'not ready' }
const UP: Health = { status: 'ok' }

let health: () => Promise<Response> = () => Promise.resolve(jsonResponse(DOWN, 503))

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

vi.stubGlobal('fetch', (input: Request | string | URL, init?: RequestInit): Promise<Response> => {
  const request = input instanceof Request ? input : new Request(input, init)
  if (request.url.includes('/health')) return health()
  return Promise.resolve(jsonResponse([]))
})

let App: ComponentType

beforeAll(async () => {
  // `createApiClient()` captures `globalThis.fetch` when the client module is
  // evaluated, so the module has to load after the stub is installed.
  ;({ default: App } = await import('./App.tsx'))
})

test('the page says whether the API it depends on is answering, and keeps asking', async () => {
  const screen = await render(<App />)

  await expect.element(screen.getByTestId('health-badge')).toHaveTextContent('API is unavailable')
  await expect.element(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Calculator')
  await expect.element(screen.getByTestId('history')).toBeVisible()
  await expect.element(screen.getByTestId('operand-left')).toBeVisible()

  // `App` owns a module-scope QueryClient, so the remount re-reads `['health']`
  // through the same cache rather than starting from a clean one.
  await screen.unmount()
  health = () => Promise.resolve(jsonResponse(UP))
  const recovered = await render(<App />)

  await expect.element(recovered.getByTestId('health-badge')).toHaveTextContent('API is up')
})
