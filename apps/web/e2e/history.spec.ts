/**
 * History panel (sub-issue #6) — the slice's numbered requirements and the
 * parent's "a Result can be carried into the next Calculation without
 * retyping it", driven in a real browser against the running API.
 *
 * Every scenario asserts a requirement, not an implementation choice: Results
 * are the API's own arithmetic, and the only literal response bodies are on
 * routes a scenario mocks itself.
 */
import { randomUUID } from 'node:crypto'
import { expect, test, type APIRequestContext, type ConsoleMessage, type Page } from '@playwright/test'
import type { components } from '@sezzle/api-contract'

type Calculation = components['schemas']['Calculation']

const CALC = '**/api/calculations'

type Watch = {
  consoleErrors: string[]
  requestFailures: string[]
  historyReads: number
  posts: number
}

/** Every scenario watches console errors, failed requests, History reads and POSTs. */
function watch(page: Page): Watch {
  const w: Watch = { consoleErrors: [], requestFailures: [], historyReads: 0, posts: 0 }
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error') w.consoleErrors.push(m.text())
  })
  page.on('requestfailed', (r) =>
    w.requestFailures.push(`${r.method()} ${r.url()} ${r.failure()?.errorText}`),
  )
  page.on('request', (r) => {
    if (!r.url().includes('/api/calculations')) return
    if (r.method() === 'GET') w.historyReads += 1
    if (r.method() === 'POST') w.posts += 1
  })
  return w
}

/**
 * The browser logs a console error for every 4xx it loads; those are the API's
 * own refusals, which a scenario below causes on purpose. Anything else is a
 * real console error, so the expected refusal count is stated per scenario.
 */
const HTTP_REFUSAL = /Failed to load resource: the server responded with a status of (400|422)/

function expectClean(w: Watch, allowRefusals = 0) {
  const refusals = w.consoleErrors.filter((e) => HTTP_REFUSAL.test(e))
  const unexpected = w.consoleErrors.filter((e) => !HTTP_REFUSAL.test(e))
  expect(unexpected, 'console errors').toEqual([])
  expect(refusals.length, 'API refusals logged by the browser').toBe(allowRefusals)
  expect(w.requestFailures, 'failed requests').toEqual([])
}

async function open(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Calculator' })).toBeVisible()
  await expect(page.getByTestId('history')).toBeVisible()
}

/** Pins the tab's Session so the spec can seed History over the API. */
async function openWithSession(page: Page, sessionId: string) {
  await page.addInitScript(
    ([key, id]) => sessionStorage.setItem(key!, id!),
    ['sezzle.session-id', sessionId],
  )
  await open(page)
}

async function compute(page: Page, op: string, operands: Record<string, string>) {
  const key = page.getByTestId(`op-${op}`)
  await expect(key).toBeVisible()
  await key.click()
  for (const [role, value] of Object.entries(operands)) {
    await page.getByTestId(`operand-${role}`).fill(value)
  }
  const equals = page.getByTestId('key-equals')
  await expect(equals).toBeEnabled()
  await equals.click()
}

function rows(page: Page) {
  return page.locator('[data-testid="history-row"]')
}

test('History opens empty, and each Calculation appears at the top without a refresh', async ({
  page,
}) => {
  const w = watch(page)
  await open(page)
  await expect(page.getByTestId('history')).toHaveAttribute('data-state', 'empty')
  await expect(page.getByTestId('history-empty')).toContainText('No Calculations yet')

  await compute(page, 'add', { left: '1', right: '1' })
  await expect(rows(page)).toHaveCount(1)

  await compute(page, 'multiply', { left: '3', right: '4' })
  await expect(rows(page)).toHaveCount(2)

  await compute(page, 'sqrt', { operand: '9' })
  await expect(rows(page)).toHaveCount(3)

  // Newest first, and the page was never reloaded to get there.
  await expect(rows(page).nth(0)).toContainText('sqrt')
  await expect(rows(page).nth(1)).toContainText('multiply')
  await expect(rows(page).nth(2)).toContainText('add')
  await expect(rows(page).nth(0).getByTestId('history-result')).toHaveText('3')
  await expect(rows(page).nth(1).getByTestId('history-result')).toHaveText('12')
  expectClean(w)
})

test('a row renders the Operation, every Operand by its role, and the Result', async ({ page }) => {
  const w = watch(page)
  await open(page)
  await compute(page, 'percentage', { percent: '15', of: '200' })

  const row = rows(page).first()
  await expect(row.getByTestId('history-operation')).toHaveText('percentage')
  await expect(row.getByTestId('history-operand-percent')).toContainText('percent')
  await expect(row.getByTestId('history-operand-percent')).toContainText('15')
  await expect(row.getByTestId('history-operand-of')).toContainText('of')
  await expect(row.getByTestId('history-operand-of')).toContainText('200')
  await expect(row.getByTestId('history-result')).toHaveText('30')
  expectClean(w)
})

test('an inexact Result is marked inexact in History, an exact one is not', async ({ page }) => {
  const w = watch(page)
  await open(page)
  await compute(page, 'divide', { left: '1', right: '3' })
  await compute(page, 'divide', { left: '10', right: '4' })

  const exact = rows(page).nth(0)
  await expect(exact.getByTestId('history-result')).toHaveText('2.5')
  await expect(exact).toHaveAttribute('data-exact', 'true')
  await expect(exact.getByTestId('history-inexact-marker')).toHaveCount(0)

  const inexact = rows(page).nth(1)
  await expect(inexact).toHaveAttribute('data-exact', 'false')
  await expect(inexact.getByTestId('history-inexact-marker')).toBeVisible()
  await expect(inexact.getByTestId('history-inexact-marker')).toHaveAttribute(
    'title',
    /significant digits/,
  )
  expectClean(w)
})

test('use-result carries a Result into the next Calculation without retyping it', async ({
  page,
}) => {
  const w = watch(page)
  await open(page)
  await compute(page, 'divide', { left: '10', right: '4' })
  await expect(rows(page).first().getByTestId('history-result')).toHaveText('2.5')

  await rows(page).first().getByTestId('history-use-result').click()
  await expect(page.getByTestId('operand-left')).toHaveValue('2.5')

  // And it is a real Operand: the next Calculation runs on it.
  await page.getByTestId('operand-right').fill('4')
  await page.getByTestId('key-equals').click()
  await expect(page.getByTestId('result-value')).toHaveText('0.625')
  await expect(rows(page).first().getByTestId('history-result')).toHaveText('0.625')
  expectClean(w)
})

test('use-result on the second row carries that row’s Result, not the newest', async ({ page }) => {
  const w = watch(page)
  await open(page)
  await compute(page, 'add', { left: '2', right: '5' })
  await compute(page, 'multiply', { left: '6', right: '6' })
  await expect(rows(page)).toHaveCount(2)

  await rows(page).nth(1).getByTestId('history-use-result').click()
  await expect(page.getByTestId('operand-left')).toHaveValue('7')
  expectClean(w)
})

test('Enter on a focused use-result carries the Result rather than re-running the Calculation', async ({
  page,
}) => {
  const w = watch(page)
  await open(page)
  await compute(page, 'divide', { left: '10', right: '4' })
  await expect(rows(page).first().getByTestId('history-result')).toHaveText('2.5')
  expect(w.posts).toBe(1)

  // The Operands are still filled, so an `Enter` the keypad steals from the
  // focused button records `10 ÷ 4` a second time — a row nobody asked for.
  const use = rows(page).first().getByTestId('history-use-result')
  await use.focus()
  await expect(use).toBeFocused()
  await page.keyboard.press('Enter')

  await expect(page.getByTestId('operand-left')).toHaveValue('2.5')
  await page.waitForTimeout(500)
  expect(w.posts, 'carrying a Result submits nothing').toBe(1)
  await expect(rows(page)).toHaveCount(1)
  expectClean(w)
})

test('clicking use-result, typing the other Operand, then Enter submits the Calculation', async ({
  page,
  request,
}) => {
  const sessionId = randomUUID()
  const seeded = await request.post('/api/calculations', {
    headers: { 'x-session-id': sessionId },
    data: { operation: 'divide', left: '10', right: '4' },
  })
  expect(seeded.ok(), 'seeded the Result to carry').toBe(true)

  const w = watch(page)
  await openWithSession(page, sessionId)
  await expect(rows(page).first().getByTestId('history-result')).toHaveText('2.5')

  // Chaining, the way the panel is meant to be used: the click hands 2.5 to
  // the first Operand, the keyboard types the other one, and `Enter` submits.
  await rows(page).first().getByTestId('history-use-result').click()
  await expect(page.getByTestId('operand-left')).toHaveValue('2.5')
  // Carrying starts an entry flow, so the click must not park focus on the
  // button — an `Enter` owned by it would re-carry instead of submitting.
  await expect(rows(page).first().getByTestId('history-use-result')).not.toBeFocused()
  await page.keyboard.type('4')
  await expect(page.getByTestId('operand-right')).toHaveValue('4')

  const [submitted] = await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes('/api/calculations'),
    ),
    page.keyboard.press('Enter'),
  ])
  expect(
    JSON.parse(submitted.request().postData() ?? '{}'),
    'the carried Result is submitted as an Operand',
  ).toEqual({ operation: 'add', left: '2.5', right: '4' })

  await expect(page.getByTestId('result-value')).toHaveText('6.5')
  await expect(rows(page)).toHaveCount(2)
  expect(w.posts, 'one Calculation, not a re-carried Result').toBe(1)
  expectClean(w)
})

test('the panel renders what the server returns, never what the mutation answered', async ({
  page,
}) => {
  const w = watch(page)
  // History is the server's, so a GET that disagrees with the POST wins.
  const server: Calculation[] = [
    { operation: 'subtract', left: '9', right: '4', result: '5', exact: true },
  ]
  await page.route(CALC, async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    await route.fulfill({ json: server })
  })
  await open(page)
  await compute(page, 'add', { left: '1', right: '1' })

  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page).first().getByTestId('history-operation')).toHaveText('subtract')
  await expect(rows(page).first().getByTestId('history-result')).toHaveText('5')
  // The Calculation still succeeded — only History is the server's to state.
  await expect(page.getByTestId('result-value')).toHaveText('2')
  expect(w.historyReads, 'a successful Calculation re-reads History').toBeGreaterThan(1)
  expectClean(w)
})

test('History loads behind skeleton rows rather than a collapsing panel', async ({ page }) => {
  const w = watch(page)
  await page.route(CALC, async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    await new Promise((r) => setTimeout(r, 1500))
    await route.fallback()
  })
  await open(page)

  await expect(page.getByTestId('history')).toHaveAttribute('data-state', 'loading')
  const skeleton = page.getByTestId('history-skeleton')
  await expect(skeleton).toBeVisible()
  const box = await skeleton.boundingBox()
  expect(box!.height, 'the skeleton holds the panel open').toBeGreaterThan(60)

  await expect(page.getByTestId('history')).toHaveAttribute('data-state', 'empty', {
    timeout: 15000,
  })
  expectClean(w)
})

test('a failed History read shows an error whose retry recovers', async ({ page }) => {
  const w = watch(page)
  let fail = true
  await page.route(CALC, async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    if (fail) return route.abort('connectionrefused')
    await route.fallback()
  })
  await open(page)

  await expect(page.getByTestId('history')).toHaveAttribute('data-state', 'error')
  await expect(page.getByTestId('history-error-message')).toContainText('The API did not answer')

  fail = false
  await page.getByTestId('history-retry').click()
  await expect(page.getByTestId('history')).toHaveAttribute('data-state', 'empty')

  // The abort this scenario caused is the only network failure allowed.
  expect(w.requestFailures).toHaveLength(1)
  expect(w.requestFailures[0]).toContain('/api/calculations')
})

test('the panel stops at the 50 the store keeps and scrolls inside itself', async ({
  page,
  request,
}) => {
  const sessionId = randomUUID()
  await seed(request, sessionId, 60)

  const w = watch(page)
  await openWithSession(page, sessionId)
  await expect(rows(page)).toHaveCount(50)

  const metrics = await page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('[data-testid="history-rows"]')!
    return {
      listScrollHeight: list.scrollHeight,
      listClientHeight: list.clientHeight,
      overflowY: getComputedStyle(list).overflowY,
      pageScrollWidth: document.scrollingElement!.scrollWidth,
      pageClientWidth: document.scrollingElement!.clientWidth,
    }
  })
  expect(metrics.overflowY, 'the panel scrolls internally').toBe('auto')
  expect(metrics.listScrollHeight).toBeGreaterThan(metrics.listClientHeight)
  expect(metrics.pageScrollWidth).toBeLessThanOrEqual(metrics.pageClientWidth)
  expectClean(w)
})

test('at 375px the panel sits below the keypad and nothing scrolls sideways', async ({ page }) => {
  const w = watch(page)
  await page.setViewportSize({ width: 375, height: 720 })
  await open(page)
  await compute(page, 'add', { left: '2', right: '3' })
  await expect(rows(page)).toHaveCount(1)

  const geometry = await page.evaluate(() => {
    const keypad = document.querySelector<HTMLElement>('.keypad')!.getBoundingClientRect()
    const panel = document.querySelector<HTMLElement>('[data-testid="history"]')!.getBoundingClientRect()
    const use = document.querySelector<HTMLElement>('[data-testid="history-use-result"]')!.getBoundingClientRect()
    return {
      panelTop: panel.top,
      keypadBottom: keypad.bottom,
      panelRight: panel.right,
      useWidth: use.width,
      useHeight: use.height,
      scrollWidth: document.scrollingElement!.scrollWidth,
      clientWidth: document.scrollingElement!.clientWidth,
    }
  })
  expect(geometry.panelTop, 'the panel is below the keypad, not beside it').toBeGreaterThanOrEqual(
    geometry.keypadBottom,
  )
  expect(geometry.panelRight).toBeLessThanOrEqual(375)
  expect(geometry.scrollWidth, 'no horizontal page scroll').toBeLessThanOrEqual(
    geometry.clientWidth,
  )
  expect(geometry.useWidth).toBeGreaterThanOrEqual(44)
  expect(geometry.useHeight).toBeGreaterThanOrEqual(44)
  expectClean(w)
})

test('two Sessions never see each other’s History', async ({ page, browser }) => {
  await open(page)
  await compute(page, 'add', { left: '8', right: '8' })
  await expect(rows(page)).toHaveCount(1)

  const other = await browser.newContext()
  const otherPage = await other.newPage()
  await open(otherPage)
  await expect(otherPage.getByTestId('history')).toHaveAttribute('data-state', 'empty')
  await expect(otherPage.locator('[data-testid="history-row"]')).toHaveCount(0)

  // The first Session's History is untouched by the second's existence.
  await expect(rows(page)).toHaveCount(1)
  await other.close()
})

/** Fills a Session's History over the API, so the panel has something to bound. */
async function seed(request: APIRequestContext, sessionId: string, count: number) {
  for (let i = 0; i < count; i += 1) {
    const response = await request.post('/api/calculations', {
      headers: { 'x-session-id': sessionId },
      data: { operation: 'add', left: String(i), right: '1' },
    })
    expect(response.ok(), 'the API recorded the seeded Calculation').toBe(true)
  }
}

test('a Calculation the server never recorded never reaches the panel', async ({ page }) => {
  const w = watch(page)
  // The spec answers the POST itself, so the real server records nothing and
  // its History stays empty. A panel fed by the mutation would show a row.
  const answer: Calculation = { operation: 'add', left: '2', right: '2', result: '5', exact: true }
  await page.route(CALC, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    await route.fulfill({ json: answer })
  })
  await open(page)
  await compute(page, 'add', { left: '2', right: '2' })

  // The Calculation reads back the API's answer, wrong arithmetic and all...
  await expect(page.getByTestId('result-value')).toHaveText('5')
  // ...and History still says what the server knows, which is nothing.
  await expect(page.getByTestId('history')).toHaveAttribute('data-state', 'empty')
  await expect(rows(page)).toHaveCount(0)
  expectClean(w)
})

test('a refused Calculation adds no row and does not invalidate History', async ({ page }) => {
  const w = watch(page)
  await open(page)
  await expect(page.getByTestId('history')).toHaveAttribute('data-state', 'empty')
  const readsBefore = w.historyReads

  await compute(page, 'divide', { left: '1', right: '0' })
  await expect(page.getByTestId('error')).toHaveAttribute('data-error-code', 'division_by_zero')

  await expect(page.getByTestId('history')).toHaveAttribute('data-state', 'empty')
  await expect(rows(page)).toHaveCount(0)
  // Give an errant invalidation a chance to fire before ruling it out.
  await page.waitForTimeout(400)
  expect(w.historyReads, 'a 422 must not invalidate History').toBe(readsBefore)
  expectClean(w, 1)
})

test('the carried Result lands in the first Operand of whatever Operation is selected', async ({
  page,
}) => {
  const w = watch(page)
  await open(page)
  await compute(page, 'add', { left: '3', right: '4' })
  await expect(rows(page).first().getByTestId('history-result')).toHaveText('7')

  // "First Operand" is a role, not a field name, so it follows the arity.
  await page.getByTestId('op-sqrt').click()
  await rows(page).first().getByTestId('history-use-result').click()
  await expect(page.getByTestId('operand-operand')).toHaveValue('7')

  await page.getByTestId('op-percentage').click()
  await rows(page).first().getByTestId('history-use-result').click()
  await expect(page.getByTestId('operand-percent')).toHaveValue('7')
  expectClean(w)
})

/** 10^24 × 10^25 = 10^49 — 50 characters, the longest an Operand may be. */
const E24 = '1' + '0'.repeat(24)
const E25 = '1' + '0'.repeat(25)
const E49 = '1' + '0'.repeat(49)
const E50 = '1' + '0'.repeat(50)

test('a 50-character Result carries in full and the API takes it as an Operand', async ({
  page,
}) => {
  const w = watch(page)
  await open(page)
  await compute(page, 'multiply', { left: E24, right: E25 })
  expect(E49, 'the contract caps an Operand at 50 characters').toHaveLength(50)

  const row = rows(page).first()
  await expect(row.getByTestId('history-result')).toHaveText(E49)
  await expect(row.getByTestId('history-digit-count')).toHaveText('50 digits')

  const use = row.getByTestId('history-use-result')
  await expect(use).toBeEnabled()
  await use.click()
  await expect(page.getByTestId('operand-left')).toHaveValue(E49)

  // And the whole string is a real Operand, not a truncated one.
  await page.getByTestId('op-add').click()
  await expect(page.getByTestId('operand-left')).toHaveValue(E49)
  await page.getByTestId('operand-right').fill('1')
  await page.getByTestId('key-equals').click()
  await expect(page.getByTestId('result-value')).toHaveText('1' + '0'.repeat(48) + '1')
  expectClean(w)
})

test('a 51-character Result cannot be carried and says why where a mouse can reach', async ({
  page,
}) => {
  const w = watch(page)
  await open(page)
  await compute(page, 'multiply', { left: E25, right: E25 })
  expect(E50, 'one character past what an Operand may be').toHaveLength(51)

  const row = rows(page).first()
  await expect(row.getByTestId('history-result')).toHaveText(E50)
  await expect(row.getByTestId('history-digit-count')).toHaveText('51 digits')

  const use = row.getByTestId('history-use-result')
  await expect(use).toBeDisabled()
  await expect(use).toHaveAttribute('aria-label', /too long to carry/)

  // A disabled button fires no pointer events, so the explanation has to hang
  // off whatever the cursor actually lands on over it.
  const explanation = await use.evaluate((button) => {
    const box = button.getBoundingClientRect()
    let node = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
    while (node && node.getAttribute('title') === null) node = node.parentElement
    return node?.getAttribute('title') ?? null
  })
  expect(explanation, 'the cursor reaches an explanation').toMatch(/50 characters/)

  // Forcing the click past the disabled state still carries nothing.
  await use.click({ force: true }).catch(() => {})
  await expect(page.getByTestId('operand-left')).toHaveValue(E25)
  expectClean(w)
})

test('the panel renders at most 50 rows even when the server sends 60', async ({ page }) => {
  const w = watch(page)
  // The store bounds History at 50 too, so only a fabricated over-long answer
  // can prove the panel's own bound rather than the server's.
  const server: Calculation[] = Array.from({ length: 60 }, (_, i) => ({
    operation: 'subtract',
    left: String(1000 + i),
    right: '1',
    result: String(999 + i),
    exact: true,
  }))
  await page.route(CALC, async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    await route.fulfill({ json: server })
  })
  await open(page)

  await expect(rows(page)).toHaveCount(50)
  // Newest first survives the slice: the first sent is the first shown.
  await expect(rows(page).nth(0).getByTestId('history-result')).toHaveText('999')
  await expect(rows(page).nth(49).getByTestId('history-result')).toHaveText('1048')
  expectClean(w)
})

test('clearing mid-flight leaves = working and still refreshes History when it lands', async ({
  page,
}) => {
  const w = watch(page)
  const gate = await holdPosts(page)
  await open(page)
  await expect(page.getByTestId('history')).toHaveAttribute('data-state', 'empty')

  await page.getByTestId('operand-left').fill('12')
  await page.getByTestId('operand-right').fill('12')
  await page.getByTestId('key-equals').click()
  await expect.poll(() => w.posts).toBe(1)

  // Clear while the Calculation is in flight: its observer is detached.
  await page.getByTestId('key-clear').click()
  await expect(page.getByTestId('operand-left')).toHaveValue('')
  const readsBefore = w.historyReads
  gate.open = true

  // Half one: the invalidation lives with the mutation, not the observer, so
  // the Calculation the server did record still appears without a refresh.
  await expect.poll(() => w.historyReads, { timeout: 10000 }).toBeGreaterThan(readsBefore)
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page).first().getByTestId('history-result')).toHaveText('24')

  // Half two: the double-submit guard let go, so `=` is not deadlocked.
  await page.getByTestId('operand-left').fill('3')
  await page.getByTestId('operand-right').fill('4')
  await page.getByTestId('key-equals').click()
  await expect(page.getByTestId('result-value')).toHaveText('7')
  await expect(rows(page)).toHaveCount(2)
  expect(w.posts, 'one POST per press').toBe(2)
  expectClean(w)
})

test('Space on a focused use-result carries the Result rather than submitting', async ({ page }) => {
  const w = watch(page)
  await open(page)
  await compute(page, 'divide', { left: '10', right: '4' })
  await expect(rows(page).first().getByTestId('history-result')).toHaveText('2.5')
  expect(w.posts).toBe(1)

  const use = rows(page).first().getByTestId('history-use-result')
  await use.focus()
  await page.keyboard.press('Space')

  await expect(page.getByTestId('operand-left')).toHaveValue('2.5')
  await page.waitForTimeout(500)
  expect(w.posts, 'carrying a Result submits nothing').toBe(1)
  await expect(rows(page)).toHaveCount(1)
  expectClean(w)
})

test('at 1280px the panel stands beside the calculator, not below it', async ({ page }) => {
  const w = watch(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  await open(page)

  const geometry = await page.evaluate(() => {
    const ticket = document.querySelector<HTMLElement>('.ticket')!.getBoundingClientRect()
    const panel = document
      .querySelector<HTMLElement>('[data-testid="history"]')!
      .getBoundingClientRect()
    return { ticketRight: ticket.right, panelLeft: panel.left }
  })
  expect(geometry.panelLeft, 'beside, not below').toBeGreaterThanOrEqual(geometry.ticketRight)
  expectClean(w)
})

/** Holds every POST open until the scenario releases it. */
async function holdPosts(page: Page) {
  const gate = { open: false }
  await page.route(CALC, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    while (!gate.open) await new Promise((r) => setTimeout(r, 25))
    await route.continue()
  })
  return gate
}
