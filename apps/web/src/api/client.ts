import { createApiClient, type ApiError, type components } from '@sezzle/api-contract'

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
 * The one place the Session header is *named*: openapi-fetch types
 * `X-Session-Id` as a required per-operation parameter, so it cannot be a
 * client-construction option — every call goes through a request function here
 * instead of naming the header at its own call site. The Session it carries is
 * the caller's to pass, never storage this module reads behind their back: a
 * query keyed on one Session and a request sent for another would be two
 * values that only happen to agree.
 */
export async function postCalculation(
  sessionId: string,
  body: CalculationRequest,
): Promise<Calculation> {
  const { data, error } = await api.POST('/calculations', {
    body,
    params: { header: { 'X-Session-Id': sessionId } },
  })
  if (error) throw new ApiFailure(error)
  return data
}

/** The Session's History, newest first — `[]` when it holds no Calculation. */
export async function getCalculations(sessionId: string): Promise<Calculation[]> {
  const { data, error } = await api.GET('/calculations', {
    params: { header: { 'X-Session-Id': sessionId } },
  })
  if (error) throw new ApiFailure(error)
  return data
}
