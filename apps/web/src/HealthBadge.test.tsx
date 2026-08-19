import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { HealthBadge } from './HealthBadge.tsx'

test('renders each health state', async () => {
  const screen = await render(<HealthBadge state="loading" />)
  await expect.element(screen.getByTestId('health-badge')).toHaveTextContent('Checking API…')

  await screen.rerender(<HealthBadge state="ok" />)
  await expect.element(screen.getByTestId('health-badge')).toHaveTextContent('API is up')

  await screen.rerender(<HealthBadge state="unavailable" />)
  await expect.element(screen.getByTestId('health-badge')).toHaveTextContent('API is unavailable')
})
