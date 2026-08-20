import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ComponentType } from 'react'
import { beforeAll, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'

const posts: string[] = []
let unsettled: Array<() => void> = []

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

/** Answers every POST only when the test says so, so a Calculation can be held in flight. */
vi.stubGlobal('fetch', (input: Request | string | URL, init?: RequestInit): Promise<Response> => {
  const request = input instanceof Request ? input : new Request(input, init)
  if (request.method !== 'POST') return Promise.resolve(jsonResponse({ status: 'ok' }))

  posts.push(request.url)
  return new Promise<Response>((resolve) => {
    unsettled.push(() =>
      resolve(jsonResponse({ operation: 'add', left: '1', right: '2', result: '3', exact: true })),
    )
  })
})

function settleEverythingInFlight() {
  const settlers = unsettled
  unsettled = []
  for (const settle of settlers) settle()
}

let Calculator: ComponentType

beforeAll(async () => {
  // `createApiClient()` captures `globalThis.fetch` when the client module is
  // evaluated, so the module has to load after the stub is installed — which a
  // static import, hoisted above this file's body, would not do.
  ;({ Calculator } = await import('./Calculator.tsx'))
})

function mount() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Calculator />
    </QueryClientProvider>,
  )
}

test('clearing a Calculation in flight leaves `=` able to issue the next one', async () => {
  const screen = await mount()

  await screen.getByTestId('operand-left').fill('1')
  await screen.getByTestId('operand-right').fill('2')
  await screen.getByTestId('key-equals').click()
  await vi.waitFor(() => expect(posts).toHaveLength(1))

  // `C` — the same `handleAction` branch the `Escape` key reaches.
  await screen.getByTestId('key-clear').click()
  settleEverythingInFlight()
  expect(posts).toHaveLength(1)

  await screen.getByTestId('operand-left').fill('4')
  await screen.getByTestId('operand-right').fill('5')
  await screen.getByTestId('key-equals').click()
  await vi.waitFor(() => expect(posts).toHaveLength(2))

  settleEverythingInFlight()
})
