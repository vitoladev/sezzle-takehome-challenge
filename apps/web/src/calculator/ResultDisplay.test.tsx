import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { ResultDisplay } from './ResultDisplay.tsx'

test('an exact Result carries no marker', async () => {
  const screen = await render(
    <ResultDisplay calculation={{ operation: 'add', left: '0.1', right: '0.2', result: '0.3', exact: true }} pending={false} failed={false} />,
  )

  await expect.element(screen.getByTestId('result-value')).toHaveTextContent('0.3')
  await expect.element(screen.getByTestId('result')).toHaveAttribute('data-exact', 'true')
  expect(screen.container.querySelector('[data-testid="result-inexact-marker"]')).toBeNull()
})

test('an inexact Result is marked and the tooltip names the Precision', async () => {
  const screen = await render(
    <ResultDisplay
      calculation={{
        operation: 'divide',
        left: '1',
        right: '3',
        result: '0.3333333333333333333333333333',
        exact: false,
      }}
      pending={false}
      failed={false}
    />,
  )

  const marker = screen.getByTestId('result-inexact-marker')
  await expect.element(marker).toHaveTextContent('≈')
  await expect.element(marker).toHaveAttribute('title', expect.stringContaining('28 significant digits'))
})

test('a very long Result reports how many digits it carries', async () => {
  const screen = await render(
    <ResultDisplay
      calculation={{ operation: 'power', left: '9', right: '99', result: '9'.repeat(1234), exact: true }}
      pending={false}
      failed={false}
    />,
  )

  await expect.element(screen.getByTestId('result-digit-count')).toHaveTextContent('1,234 digits')
})

test('the pending, empty and failed readouts are each distinct from a Result', async () => {
  const calculation = { operation: 'add', left: '2', right: '2', result: '4', exact: true } as const
  const screen = await render(
    <ResultDisplay calculation={undefined} pending={false} failed={false} />,
  )
  await expect.element(screen.getByTestId('result')).toHaveAttribute('data-state', 'empty')

  await screen.rerender(<ResultDisplay calculation={undefined} pending={true} failed={false} />)
  await expect.element(screen.getByTestId('result')).toHaveAttribute('data-state', 'pending')

  // A stale Result must not stand next to the failure of a newer Calculation.
  await screen.rerender(<ResultDisplay calculation={calculation} pending={false} failed={true} />)
  await expect.element(screen.getByTestId('result')).toHaveAttribute('data-state', 'failed')
  expect(screen.container.textContent).not.toContain('4')
})
