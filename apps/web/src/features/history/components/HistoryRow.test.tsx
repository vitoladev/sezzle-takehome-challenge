import { expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import type { Calculation } from '@/api/client.ts'
import { HistoryRow } from './HistoryRow.tsx'

function row(calculation: Calculation, onUseResult = vi.fn()) {
  return { calculation, onUseResult }
}

test('use-result emits the Result string the row displays', async () => {
  const onUseResult = vi.fn()
  const props = row({ operation: 'divide', left: '10', right: '4', result: '2.5', exact: true }, onUseResult)
  const screen = await render(<HistoryRow {...props} />)

  await expect.element(screen.getByTestId('history-result')).toHaveTextContent('2.5')
  await screen.getByTestId('history-use-result').click()

  expect(onUseResult.mock.calls).toEqual([['2.5']])
})

test('a row names the Operation and every Operand by its role', async () => {
  const screen = await render(
    <HistoryRow {...row({ operation: 'percentage', percent: '15', of: '200', result: '30', exact: true })} />,
  )

  await expect.element(screen.getByTestId('history-operation')).toHaveTextContent('percentage')
  await expect.element(screen.getByTestId('history-operand-percent')).toHaveTextContent('percent15')
  await expect.element(screen.getByTestId('history-operand-of')).toHaveTextContent('of200')
  expect(screen.container.querySelector('[data-testid="history-operand-left"]')).toBeNull()
})

test('an inexact Result is marked in History too, an exact one is not', async () => {
  const screen = await render(
    <HistoryRow
      {...row({
        operation: 'divide',
        left: '1',
        right: '3',
        result: '0.3333333333333333333333333333',
        exact: false,
      })}
    />,
  )

  const marker = screen.getByTestId('history-inexact-marker')
  await expect.element(marker).toHaveTextContent('≈')
  await expect.element(marker).toHaveAttribute('title', expect.stringContaining('28 significant digits'))

  await screen.rerender(
    <HistoryRow {...row({ operation: 'add', left: '2', right: '2', result: '4', exact: true })} />,
  )
  expect(screen.container.querySelector('[data-testid="history-inexact-marker"]')).toBeNull()
})

test('a Result too long to be an Operand reports its digits and cannot be carried', async () => {
  const onUseResult = vi.fn()
  const result = '9'.repeat(1234)
  const screen = await render(
    <HistoryRow {...row({ operation: 'power', left: '9', right: '99', result, exact: true }, onUseResult)} />,
  )

  await expect.element(screen.getByTestId('history-digit-count')).toHaveTextContent('1,234 digits')
  await expect.element(screen.getByTestId('history-use-result')).toBeDisabled()
  expect(onUseResult).not.toHaveBeenCalled()
})
