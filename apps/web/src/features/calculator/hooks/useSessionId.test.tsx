import { beforeEach, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { getSessionId, useSessionId } from './useSessionId.ts'

beforeEach(() => {
  sessionStorage.clear()
})

test('creates one identifier and returns it on every later call', () => {
  const first = getSessionId()

  expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  expect(getSessionId()).toBe(first)
  expect(getSessionId()).toBe(first)
})

test('reuses an identifier the tab already holds instead of creating one', () => {
  const existing = crypto.randomUUID()
  sessionStorage.setItem('sezzle.session-id', existing)

  expect(getSessionId()).toBe(existing)
})

function Probe() {
  return <span data-testid="probe">{useSessionId()}</span>
}

test('the hook hands out the stored identifier and keeps handing out the same one', async () => {
  const screen = await render(<Probe />)
  const shown = sessionStorage.getItem('sezzle.session-id')

  expect(shown).not.toBeNull()
  await expect.element(screen.getByTestId('probe')).toHaveTextContent(String(shown))

  await screen.rerender(<Probe />)
  await expect.element(screen.getByTestId('probe')).toHaveTextContent(String(shown))
  expect(sessionStorage.getItem('sezzle.session-id')).toBe(shown)
})
