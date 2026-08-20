import type { ApiError } from '@sezzle/api-contract'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ComponentType } from 'react'
import { beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import type { Calculation } from '@/api/client.ts'

const SUM: Calculation = { operation: 'add', left: '1', right: '2', result: '3', exact: true }

const posts: Request[] = []
let history: Calculation[] = []
let postRespond: () => Promise<Response> = () => Promise.resolve(jsonResponse(SUM))

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

vi.stubGlobal('fetch', (input: Request | string | URL, init?: RequestInit): Promise<Response> => {
  const request = input instanceof Request ? input : new Request(input, init)
  if (!request.url.includes('/calculations')) return Promise.resolve(jsonResponse({ status: 'ok' }))
  if (request.method !== 'POST') return Promise.resolve(jsonResponse(history))

  posts.push(request)
  return postRespond()
})

let Calculator: ComponentType

beforeAll(async () => {
  // `createApiClient()` captures `globalThis.fetch` when the client module is
  // evaluated, so the module has to load after the stub is installed.
  ;({ Calculator } = await import('./Calculator.tsx'))
})

beforeEach(() => {
  posts.length = 0
  history = []
  postRespond = () => Promise.resolve(jsonResponse(SUM))
})

function mount() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Calculator />
    </QueryClientProvider>,
  )
}

/**
 * A key press the window listener sees exactly as the browser would deliver it,
 * including which element it came from — the listener branches on that.
 */
function press(key: string, { from = window, ctrl = false }: { from?: Element | Window; ctrl?: boolean } = {}) {
  from.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ctrlKey: ctrl }))
}

/** Nothing happens when the guards hold, so a negative needs a real window. */
function settleQueue() {
  return new Promise((resolve) => setTimeout(resolve, 50))
}

test('keypad entry fills the field the Operation still needs', async () => {
  const screen = await mount()

  await screen.getByTestId('key-7').click()
  await expect.element(screen.getByTestId('operand-left')).toHaveValue('7')

  // Switching Operation moves entry to the first Operand it still lacks.
  await screen.getByTestId('op-multiply').click()
  await expect.element(screen.getByTestId('operation-name')).toHaveTextContent('multiply')
  await expect.element(screen.getByTestId('operand-right')).toHaveAttribute('data-active', 'true')

  await screen.getByTestId('key-3').click()
  await expect.element(screen.getByTestId('operand-right')).toHaveValue('3')
})

test('an Operation of a different arity re-labels the fields it takes', async () => {
  const screen = await mount()

  await screen.getByTestId('op-sqrt').click()

  await expect.element(screen.getByTestId('operation-name')).toHaveTextContent('sqrt')
  await expect.element(screen.getByTestId('operand-operand')).toBeVisible()
  expect(screen.container.querySelector('[data-testid="operand-left"]')).toBeNull()

  await screen.getByTestId('key-9').click()
  await expect.element(screen.getByTestId('operand-operand')).toHaveValue('9')
})

test('a Result carried out of History lands in the first Operand and entry moves on', async () => {
  history = [SUM]
  const screen = await mount()

  await screen.getByTestId('history-use-result').click()

  await expect.element(screen.getByTestId('operand-left')).toHaveValue('3')
  await expect.element(screen.getByTestId('operand-right')).toHaveAttribute('data-active', 'true')
})

test('the keypad owns the keyboard, except where something else already does', async () => {
  const screen = await mount()
  const left = screen.getByTestId('operand-left')

  press('1')
  await expect.element(left).toHaveValue('1')

  // A shortcut belongs to the browser, and an unbound key to nobody.
  press('1', { ctrl: true })
  press('a')
  await expect.element(left).toHaveValue('1')

  // A focused Operand field edits itself, so the keypad leaves it alone.
  press('7', { from: left.element() })
  await expect.element(left).toHaveValue('1')

  // The keyboard reaches submit without passing the disabled `=` key, so an
  // incomplete Calculation has to be turned away here too.
  press('Enter')
  await settleQueue()
  expect(posts).toHaveLength(0)

  await screen.getByTestId('operand-right').click()
  press('2')
  await expect.element(screen.getByTestId('operand-right')).toHaveValue('2')

  // `Enter` on a focused button is that button's own activation key: taking it
  // would clear the Calculation instead of submitting it.
  const clear = screen.container.querySelector<HTMLButtonElement>('[data-testid="key-clear"]')
  clear?.focus()
  press('Enter', { from: document.activeElement ?? window })
  await settleQueue()
  expect(posts).toHaveLength(0)
  await expect.element(left).toHaveValue('1')

  press('Enter')
  await vi.waitFor(() => expect(posts).toHaveLength(1))
  await expect.element(screen.getByTestId('result-value')).toHaveTextContent('3')
})

test('a second `=` before the first Calculation settles records only one', async () => {
  let settle: () => void = () => undefined
  postRespond = () =>
    new Promise<Response>((resolve) => {
      settle = () => resolve(jsonResponse(SUM))
    })

  const screen = await mount()
  await screen.getByTestId('operand-left').fill('1')
  await screen.getByTestId('operand-right').fill('2')

  // Two presses in one tick: `isPending` is still false for the second, so only
  // the in-flight ref can turn it away.
  press('Enter')
  press('Enter')
  await vi.waitFor(() => expect(posts).toHaveLength(1))
  await settleQueue()
  expect(posts).toHaveLength(1)

  settle()
  await expect.element(screen.getByTestId('result-value')).toHaveTextContent('3')

  // Settling releases the guard, so the next Calculation is not turned away.
  press('Enter')
  await vi.waitFor(() => expect(posts).toHaveLength(2))
  settle()
})

test('a refused Calculation can be retried without re-entering the Operands', async () => {
  const refusal: ApiError = { error: 'internal_error', message: 'something went wrong' }
  postRespond = () => Promise.resolve(jsonResponse(refusal, 500))

  const screen = await mount()
  await screen.getByTestId('operand-left').fill('1')
  await screen.getByTestId('operand-right').fill('2')
  await screen.getByTestId('key-equals').click()

  await expect.element(screen.getByTestId('error-code')).toHaveTextContent('internal_error')
  await expect.element(screen.getByTestId('result')).toHaveAttribute('data-state', 'failed')
  expect(posts).toHaveLength(1)

  postRespond = () => Promise.resolve(jsonResponse(SUM))
  await screen.getByTestId('retry').click()

  await vi.waitFor(() => expect(posts).toHaveLength(2))
  await expect.element(screen.getByTestId('result-value')).toHaveTextContent('3')
  await expect.element(screen.getByTestId('operand-left')).toHaveValue('1')
  expect(screen.container.querySelector('[data-testid="error"]')).toBeNull()

  // The retry sent the Calculation the first attempt carried, not a fresh one.
  await expect(posts[1]?.json()).resolves.toEqual({ operation: 'add', left: '1', right: '2' })
})
