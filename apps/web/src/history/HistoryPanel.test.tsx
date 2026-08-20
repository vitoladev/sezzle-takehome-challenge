import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ComponentType } from 'react'
import { beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import type { Calculation } from '../api/client.ts'

const requests: Request[] = []
let respond: () => Promise<Response> = () => Promise.resolve(jsonResponse([]))

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

vi.stubGlobal('fetch', (input: Request | string | URL, init?: RequestInit): Promise<Response> => {
  requests.push(input instanceof Request ? input : new Request(input, init))
  return respond()
})

let HistoryPanel: ComponentType<{ sessionId: string; onUseResult: (result: string) => void }>

beforeAll(async () => {
  // `createApiClient()` captures `globalThis.fetch` when the client module is
  // evaluated, so the module has to load after the stub is installed.
  ;({ HistoryPanel } = await import('./HistoryPanel.tsx'))
})

beforeEach(() => {
  requests.length = 0
  respond = () => Promise.resolve(jsonResponse([]))
})

function mount(onUseResult = vi.fn()) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <HistoryPanel sessionId={crypto.randomUUID()} onUseResult={onUseResult} />
    </QueryClientProvider>,
  )
}

test('an empty History reads as deliberate, not as a broken panel', async () => {
  const screen = await mount()

  await expect.element(screen.getByTestId('history')).toHaveAttribute('data-state', 'empty')
  await expect.element(screen.getByTestId('history-empty')).toHaveTextContent('No Calculations yet')
  expect(screen.container.querySelector('[data-testid="history-row"]')).toBeNull()
})

test('History loads behind skeleton rows rather than a collapsed panel', async () => {
  respond = () => new Promise<Response>(() => {})
  const screen = await mount()

  await expect.element(screen.getByTestId('history')).toHaveAttribute('data-state', 'loading')
  const skeleton = screen.getByTestId('history-skeleton')
  await expect.element(skeleton).toBeVisible()
  expect(skeleton.element().querySelectorAll('.history-row')).toHaveLength(3)
})

test('the panel renders the Calculations the server sent, in the order it sent them', async () => {
  const history: Calculation[] = [
    { operation: 'sqrt', operand: '2', result: '1.414213562373095048801688724', exact: false },
    { operation: 'add', left: '0.1', right: '0.2', result: '0.3', exact: true },
  ]
  respond = () => Promise.resolve(jsonResponse(history))
  const screen = await mount()

  await expect.element(screen.getByTestId('history')).toHaveAttribute('data-state', 'ready')
  const rows = screen.container.querySelectorAll('[data-testid="history-row"]')
  expect(rows).toHaveLength(2)
  expect(rows[0]?.textContent).toContain('sqrt')
  expect(rows[1]?.textContent).toContain('0.3')

  const [request] = requests
  expect(request?.url).toContain('/api/calculations')
  expect(request?.headers.get('x-session-id')).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  )
})

test('a failed read shows an error whose retry re-reads History', async () => {
  respond = () => Promise.reject(new TypeError('network down'))
  const screen = await mount()

  await expect.element(screen.getByTestId('history')).toHaveAttribute('data-state', 'error')
  await expect
    .element(screen.getByTestId('history-error-message'))
    .toHaveTextContent('The API did not answer')

  respond = () => Promise.resolve(jsonResponse([{ operation: 'add', left: '2', right: '2', result: '4', exact: true }]))
  await screen.getByTestId('history-retry').click()

  await expect.element(screen.getByTestId('history')).toHaveAttribute('data-state', 'ready')
  await expect.element(screen.getByTestId('history-result')).toHaveTextContent('4')
})
