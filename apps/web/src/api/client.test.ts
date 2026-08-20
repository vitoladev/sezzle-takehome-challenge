import type { ApiError } from '@sezzle/api-contract'
import { beforeAll, beforeEach, expect, test, vi } from 'vitest'
import type { Calculation, CalculationRequest } from './client.ts'

const SESSION_ID = crypto.randomUUID()

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

let client: typeof import('./client.ts')

beforeAll(async () => {
  // `createApiClient()` captures `globalThis.fetch` when the client module is
  // evaluated, so the module has to load after the stub is installed.
  client = await import('./client.ts')
})

beforeEach(() => {
  requests.length = 0
})

/** The rejection a call produced — failing the test if it resolved instead. */
async function rejectionOf(call: Promise<unknown>): Promise<unknown> {
  try {
    await call
  } catch (caught: unknown) {
    return caught
  }
  throw new Error('expected the call to reject')
}

const request: CalculationRequest = { operation: 'divide', left: '10', right: '4' }
const calculation: Calculation = {
  operation: 'divide',
  left: '10',
  right: '4',
  result: '2.5',
  exact: true,
}

test('a Calculation is posted with the Session header and returns the Calculation', async () => {
  respond = () => Promise.resolve(jsonResponse(calculation))

  await expect(client.postCalculation(SESSION_ID, request)).resolves.toEqual(calculation)

  const [sent] = requests
  expect(sent?.method).toBe('POST')
  expect(sent?.url).toContain('/api/calculations')
  expect(sent?.headers.get('x-session-id')).toBe(SESSION_ID)
  await expect(sent?.json()).resolves.toEqual(request)
})

test('History is read with the same Session header the post carried', async () => {
  respond = () => Promise.resolve(jsonResponse([calculation]))

  await expect(client.getCalculations(SESSION_ID)).resolves.toEqual([calculation])

  const [sent] = requests
  expect(sent?.method).toBe('GET')
  expect(sent?.url).toContain('/api/calculations')
  expect(sent?.headers.get('x-session-id')).toBe(SESSION_ID)
})

test('a refused Calculation becomes an ApiFailure carrying the contract Error', async () => {
  const body: ApiError = { error: 'division_by_zero', message: 'division by zero' }
  respond = () => Promise.resolve(jsonResponse(body, 422))

  const failure = await rejectionOf(client.postCalculation(SESSION_ID, request))

  expect(failure).toBeInstanceOf(client.ApiFailure)
  expect(failure).toBeInstanceOf(Error)
  if (failure instanceof client.ApiFailure) {
    expect(failure.body).toEqual(body)
    expect(failure.message).toBe('division by zero')
    expect(failure.name).toBe('ApiFailure')
  }
})

test('a refused History read becomes an ApiFailure too', async () => {
  const body: ApiError = { error: 'invalid_request', message: 'X-Session-Id is required' }
  respond = () => Promise.resolve(jsonResponse(body, 400))

  const failure = await rejectionOf(client.getCalculations(SESSION_ID))

  expect(failure).toBeInstanceOf(client.ApiFailure)
  if (failure instanceof client.ApiFailure) {
    expect(failure.body).toEqual(body)
  }
})

test('a request the API never answered surfaces as itself, not as an ApiFailure', async () => {
  // `describeError` tells the two apart: an ApiFailure renders the contract's
  // code, anything else renders the `no_response` copy.
  respond = () => Promise.reject(new TypeError('Failed to fetch'))

  const failure = await rejectionOf(client.postCalculation(SESSION_ID, request))

  expect(failure).not.toBeInstanceOf(client.ApiFailure)
  expect(failure).toBeInstanceOf(TypeError)
})
