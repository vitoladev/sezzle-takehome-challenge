import { expect, test } from '@playwright/test'

test('home page shows the API health check green', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'sezzle-take-home-challenge' })).toBeVisible()
  await expect(page.getByTestId('health-badge')).toHaveAttribute('data-state', 'ok')
})
