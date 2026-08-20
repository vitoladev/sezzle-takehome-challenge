import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { OperandFields } from './OperandFields.tsx'
import { EMPTY_OPERANDS } from './operations.ts'

function fields(operation: 'add' | 'sqrt' | 'percentage') {
  return render(
    <OperandFields
      operation={operation}
      operands={EMPTY_OPERANDS}
      activeRole="left"
      onActivate={() => {}}
      onChange={() => {}}
    />,
  )
}

test('a binary Operation offers the left and right Operands', async () => {
  const screen = await fields('add')

  await expect.element(screen.getByTestId('operand-left')).toBeInTheDocument()
  await expect.element(screen.getByTestId('operand-right')).toBeInTheDocument()
  await expect.element(screen.getByTestId('operand-row-left')).toHaveTextContent('left')
})

test('sqrt collapses to its single Operand', async () => {
  const screen = await fields('sqrt')

  await expect.element(screen.getByTestId('operand-operand')).toBeInTheDocument()
  expect(screen.container.querySelectorAll('input')).toHaveLength(1)
  expect(screen.container.querySelector('[data-testid="operand-right"]')).toBeNull()
})

test('percentage labels its Operands percent and of', async () => {
  const screen = await fields('percentage')

  await expect.element(screen.getByTestId('operand-row-percent')).toHaveTextContent('percent')
  await expect.element(screen.getByTestId('operand-row-of')).toHaveTextContent('of')
  expect(screen.container.textContent).not.toContain('left')
  expect(screen.container.textContent).not.toContain('right')
})
