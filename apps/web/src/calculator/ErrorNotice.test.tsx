import type { ApiError } from '@sezzle/api-contract'
import { expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { ApiFailure } from '../api/client.ts'
import { ErrorNotice } from './ErrorNotice.tsx'

test('a refusal is rendered by the code and message the API sent', async () => {
  const refusal: ApiError = { error: 'negative_square_root', message: 'square root of a negative' }
  const screen = await render(
    <ErrorNotice error={new ApiFailure(refusal)} onRetry={vi.fn()} retryDisabled={false} />,
  )

  await expect.element(screen.getByTestId('error')).toHaveAttribute('data-error-code', 'negative_square_root')
  await expect.element(screen.getByTestId('error-code')).toHaveTextContent('negative_square_root')
  await expect.element(screen.getByTestId('error-message')).toHaveTextContent('square root of a negative')

  const other: ApiError = { error: 'result_too_large', message: 'the Result is too large to represent' }
  await screen.rerender(
    <ErrorNotice error={new ApiFailure(other)} onRetry={vi.fn()} retryDisabled={false} />,
  )

  await expect.element(screen.getByTestId('error-code')).toHaveTextContent('result_too_large')
  await expect.element(screen.getByTestId('error-message')).toHaveTextContent('too large')
})

test('a failure the API never saw reads as an unanswered request', async () => {
  const screen = await render(
    <ErrorNotice error={new TypeError('Failed to fetch')} onRetry={vi.fn()} retryDisabled={false} />,
  )

  await expect.element(screen.getByTestId('error-code')).toHaveTextContent('no_response')
  await expect.element(screen.getByTestId('error-message')).toHaveTextContent('The API did not answer')
})

test('retry asks for the same Calculation again, and is closed while one is in flight', async () => {
  const onRetry = vi.fn()
  const refusal: ApiError = { error: 'division_by_zero', message: 'division by zero' }
  const screen = await render(
    <ErrorNotice error={new ApiFailure(refusal)} onRetry={onRetry} retryDisabled={false} />,
  )

  await screen.getByTestId('retry').click()
  expect(onRetry).toHaveBeenCalledTimes(1)

  await screen.rerender(
    <ErrorNotice error={new ApiFailure(refusal)} onRetry={onRetry} retryDisabled={true} />,
  )
  await expect.element(screen.getByTestId('retry')).toBeDisabled()
})
