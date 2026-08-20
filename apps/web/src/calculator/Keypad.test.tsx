import { expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import type { KeypadAction } from './entry.ts'
import { Keypad } from './Keypad.tsx'

async function mount({ canSubmit = true, pending = false } = {}) {
  const onAction = vi.fn<(action: KeypadAction) => void>()
  const screen = await render(
    <Keypad operation="multiply" canSubmit={canSubmit} pending={pending} onAction={onAction} />,
  )
  return { onAction, screen }
}

test('every key emits the action its face promises', async () => {
  const { onAction, screen } = await mount()

  await screen.getByTestId('key-7').click()
  await screen.getByTestId('key-0').click()
  await screen.getByTestId('key-decimal').click()
  await screen.getByTestId('key-sign').click()
  await screen.getByTestId('key-delete').click()
  await screen.getByTestId('key-clear').click()
  await screen.getByTestId('op-sqrt').click()
  await screen.getByTestId('key-equals').click()

  expect(onAction.mock.calls.flat()).toEqual([
    { kind: 'digit', digit: '7' },
    { kind: 'digit', digit: '0' },
    { kind: 'decimal' },
    { kind: 'sign' },
    { kind: 'delete' },
    { kind: 'clear' },
    { kind: 'operation', operation: 'sqrt' },
    { kind: 'submit' },
  ])
})

test('the selected Operation is the only key marked pressed', async () => {
  const { screen } = await mount()

  await expect.element(screen.getByTestId('op-multiply')).toHaveAttribute('aria-pressed', 'true')
  await expect.element(screen.getByTestId('op-add')).toHaveAttribute('aria-pressed', 'false')
})

test('`=` refuses an incomplete Calculation', async () => {
  const { onAction, screen } = await mount({ canSubmit: false })

  await expect.element(screen.getByTestId('key-equals')).toBeDisabled()
  expect(onAction).not.toHaveBeenCalled()
})

test('`=` shows the Calculation in flight and refuses a second one', async () => {
  const { screen } = await mount({ pending: true })

  const equals = screen.getByTestId('key-equals')
  await expect.element(equals).toBeDisabled()
  await expect.element(equals).toHaveAttribute('aria-busy', 'true')
  await expect.element(equals).toHaveTextContent('…')
})
