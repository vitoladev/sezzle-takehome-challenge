import createClient, { type Client } from 'openapi-fetch'
import type { components, paths } from './schema.d.ts'

export type { components, paths } from './schema.d.ts'

export type Health = components['schemas']['Health']
export type ApiError = components['schemas']['Error']
export type ErrorCode = components['schemas']['ErrorCode']

export type ApiClient = Client<paths>

/** Vite proxies `/api` to the Go server; override to target another host. */
export function createApiClient(baseUrl = '/api'): ApiClient {
  return createClient<paths>({ baseUrl })
}
