import { createApiClient, type ApiError, type components } from '@sezzle/api-contract'
import { getSessionId } from '../session/useSessionId.ts'

export const api = createApiClient()

export type Calculation = components['schemas']['Calculation']
export type CalculationRequest = components['schemas']['CalculationRequest']

/** A response the API refused, carrying the contract's Error for rendering. */
export class ApiFailure extends Error {
  readonly body: ApiError

  constructor(body: ApiError) {
    super(body.message)
    this.name = 'ApiFailure'
    this.body = body
  }
}

/**
 * The one place the Session header is attached: openapi-fetch types
 * `X-Session-Id` as a required per-operation parameter, so it cannot be a
 * client-construction option — every call goes through a request function here
 * instead of naming the header at its own call site.
 */
export async function postCalculation(body: CalculationRequest): Promise<Calculation> {
  const { data, error } = await api.POST('/calculations', {
    body,
    params: { header: { 'X-Session-Id': getSessionId() } },
  })
  if (error) throw new ApiFailure(error)
  return data
}
