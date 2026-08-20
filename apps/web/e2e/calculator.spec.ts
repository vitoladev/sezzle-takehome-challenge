/**
 * Calculator (sub-issue #5) — the parent's acceptance criteria and the slice's
 * numbered requirements, driven in a real browser against the running API.
 *
 * Promoted from the independent verification run. Every scenario asserts a
 * requirement, not an implementation choice: literal Results are the API's
 * own arithmetic (fixed by the PRD), error copy is fetched from the API
 * inside the spec rather than hard-coded, and the only literal response body
 * anywhere is on a route this suite mocks itself.
 */
import { randomUUID } from 'node:crypto'
import {
  expect,
  test,
  type APIRequestContext,
  type ConsoleMessage,
  type Page,
  type Request,
} from '@playwright/test'

const CALC = '**/api/calculations'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type Watch = {
  consoleErrors: string[]
  requestFailures: string[]
  posts: Request[]
}

/** Every scenario watches console errors, failed requests and POST count. */
function watch(page: Page): Watch {
  const w: Watch = { consoleErrors: [], requestFailures: [], posts: [] }
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error') w.consoleErrors.push(m.text())
  })
  page.on('requestfailed', (r) =>
    w.requestFailures.push(`${r.method()} ${r.url()} ${r.failure()?.errorText}`),
  )
  page.on('request', (r) => {
    if (isCalcPost(r)) w.posts.push(r)
  })
  return w
}

function isCalcPost(request: Request) {
  return request.method() === 'POST' && request.url().includes('/api/calculations')
}

/**
 * The browser logs a console error for every 4xx it loads; those are the API's
 * own refusals, which several scenarios cause on purpose. Anything else is a
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

/** Asks the API itself what it answers, so the spec never pins copy it does not own. */
async function apiAnswer(request: APIRequestContext, body: Record<string, string>) {
  const response = await request.post('/api/calculations', {
    headers: { 'x-session-id': randomUUID() },
    data: body,
  })
  const payload: { error?: string; message?: string; result?: string } = await response.json()
  return payload
}

async function open(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Calculator' })).toBeVisible()
  await expect(page.getByTestId('result')).toBeVisible()
}

async function pickOperation(page: Page, op: string) {
  const key = page.getByTestId(`op-${op}`)
  await expect(key).toBeVisible()
  await key.click()
  await expect(page.getByTestId('operation-name')).toHaveText(op)
}

async function setOperand(page: Page, role: string, value: string) {
  const field = page.getByTestId(`operand-${role}`)
  await expect(field).toBeVisible()
  await field.fill(value)
  await expect(field).toHaveValue(value)
}

async function submit(page: Page) {
  const equals = page.getByTestId('key-equals')
  await expect(equals).toBeEnabled()
  await equals.click()
}

/** Fills a whole Calculation and submits it, returning the result row. */
async function compute(page: Page, op: string, operands: Record<string, string>) {
  await pickOperation(page, op)
  for (const [role, value] of Object.entries(operands)) await setOperand(page, role, value)
  await submit(page)
  return page.getByTestId('result')
}

/** Holds the POST open so the in-flight window is wide enough to attack. */
async function holdInFlight(page: Page, ms = 1200) {
  await page.route(CALC, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    await new Promise((r) => setTimeout(r, ms))
    await route.fallback()
  })
}

/** Opens with `2 + 3` ready to submit and focus off the Operand fields. */
async function armed(page: Page) {
  await open(page)
  await setOperand(page, 'left', '2')
  await setOperand(page, 'right', '3')
  // Take focus out of the field so the window keydown handler owns the keys.
  await page.getByRole('heading', { name: 'Calculator' }).click()
}

// ───────────────────────── Parent acceptance criteria ────────────────────────

test('0.1 + 0.2 renders exactly 0.3 with no inexactness marker', async ({ page }) => {
  const w = watch(page)
  await open(page)
  const result = await compute(page, 'add', { left: '0.1', right: '0.2' })
  await expect(result).toHaveAttribute('data-state', 'ready')
  await expect(page.getByTestId('result-value')).toHaveText('0.3')
  await expect(result).toHaveAttribute('data-exact', 'true')
  await expect(page.getByTestId('result-inexact-marker')).toHaveCount(0)
  expectClean(w)
})

test('1 ÷ 3 is marked inexact and the tooltip names the Precision', async ({ page }) => {
  const w = watch(page)
  await open(page)
  const result = await compute(page, 'divide', { left: '1', right: '3' })
  await expect(result).toHaveAttribute('data-exact', 'false')

  const marker = page.getByTestId('result-inexact-marker')
  await expect(marker).toBeVisible()
  await expect(marker).toHaveText('≈')
  const tooltip = await marker.getAttribute('title')
  expect(tooltip, 'tooltip names the Precision').toMatch(/28 significant digits/i)

  // The Precision the tooltip claims must be the Precision the API kept.
  const shown = (await page.getByTestId('result-value').innerText()).trim()
  const significant = shown.replace(/^-/, '').replace('.', '').replace(/^0+/, '')
  expect(significant.length, `significant digits in ${shown}`).toBe(28)
  expectClean(w)
})

test('selecting sqrt collapses the keypad to a single Operand field', async ({ page }) => {
  const w = watch(page)
  await open(page)
  await expect(page.locator('[data-testid^="operand-row-"]')).toHaveCount(2)
  await pickOperation(page, 'sqrt')
  await expect(page.locator('[data-testid^="operand-row-"]')).toHaveCount(1)
  await expect(page.getByTestId('operand-row-operand')).toBeVisible()
  await expect(page.getByTestId('operand-row-left')).toHaveCount(0)
  await expect(page.getByTestId('operand-row-right')).toHaveCount(0)
  expectClean(w)
})

test('percentage labels its fields percent and of, never left/right', async ({ page }) => {
  const w = watch(page)
  await open(page)
  await pickOperation(page, 'percentage')
  await expect(page.getByTestId('operand-row-percent')).toContainText('percent')
  await expect(page.getByTestId('operand-row-of')).toContainText('of')
  await expect(page.getByTestId('operand-percent')).toHaveAttribute('aria-label', 'percent')
  await expect(page.getByTestId('operand-of')).toHaveAttribute('aria-label', 'of')
  await expect(page.getByTestId('operand-left')).toHaveCount(0)
  await expect(page.getByTestId('operand-right')).toHaveCount(0)
  // Percent-of, proved end to end.
  await setOperand(page, 'percent', '15')
  await setOperand(page, 'of', '200')
  await submit(page)
  await expect(page.getByTestId('result-value')).toHaveText('30')
  expectClean(w)
})

test('√-4 renders a specific error, not a generic one', async ({ page, request }) => {
  const expected = await apiAnswer(request, { operation: 'sqrt', operand: '-4' })
  const w = watch(page)
  await open(page)
  await pickOperation(page, 'sqrt')
  await setOperand(page, 'operand', '-4')
  await submit(page)
  const notice = page.getByTestId('error')
  await expect(notice).toBeVisible()
  await expect(notice).toHaveAttribute('data-error-code', 'negative_square_root')
  await expect(page.getByTestId('error-code')).toHaveText('negative_square_root')
  await expect(page.getByTestId('error-message')).toHaveText(expected.message!)
  await expect(page.getByTestId('result')).toHaveAttribute('data-state', 'failed')
  expectClean(w, 1)
})

test('exact and inexact Results are told apart in the same session', async ({ page }) => {
  const w = watch(page)
  await open(page)
  await compute(page, 'divide', { left: '10', right: '4' })
  await expect(page.getByTestId('result-value')).toHaveText('2.5')
  await expect(page.getByTestId('result')).toHaveAttribute('data-exact', 'true')
  await expect(page.getByTestId('result-inexact-marker')).toHaveCount(0)

  await setOperand(page, 'right', '3')
  await submit(page)
  await expect(page.getByTestId('result-value')).toHaveText('3.333333333333333333333333333')
  await expect(page.getByTestId('result')).toHaveAttribute('data-exact', 'false')
  await expect(page.getByTestId('result-inexact-marker')).toBeVisible()

  await pickOperation(page, 'sqrt')
  await setOperand(page, 'operand', '2')
  await submit(page)
  // Wait on the new Result before reading it — the previous one was inexact
  // too, so the marker and `data-exact` alone cannot tell them apart.
  await expect(page.getByTestId('result-value')).toHaveText(/^1\.41421356237309504880168872/)
  await expect(page.getByTestId('result')).toHaveAttribute('data-exact', 'false')
  await expect(page.getByTestId('result-inexact-marker')).toBeVisible()
  const root = (await page.getByTestId('result-value').innerText()).trim()
  expect(root.replace('.', '').replace(/^0+/, '').length, `Precision of √2 = ${root}`).toBe(28)
  expectClean(w)
})

// ───────────────── The app never evaluates arithmetic (requirement 3) ────────

test('the UI displays the API answer even when it is arithmetically wrong', async ({ page }) => {
  const w = watch(page)
  await page.route(CALC, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      // 2 + 2 = 5. A UI that computes locally shows 4 here; only a UI that
      // renders the API's answer shows 5.
      body: JSON.stringify({ operation: 'add', left: '2', right: '2', result: '5', exact: true }),
    })
  })
  await open(page)
  await compute(page, 'add', { left: '2', right: '2' })
  await expect(page.getByTestId('result-value')).toHaveText('5')
  await expect(page.getByTestId('result')).toHaveAttribute('data-exact', 'true')
  expect(w.posts.length).toBe(1)
  expectClean(w)
})

test('pressing = issues exactly one POST carrying the Operands', async ({ page }) => {
  const w = watch(page)
  await open(page)
  const [request] = await Promise.all([
    page.waitForRequest(isCalcPost),
    compute(page, 'multiply', { left: '6', right: '7' }),
  ])
  await expect(page.getByTestId('result-value')).toHaveText('42')
  expect(JSON.parse(request.postData() ?? '{}')).toEqual({
    operation: 'multiply',
    left: '6',
    right: '7',
  })
  expect(w.posts.length, 'POST /calculations count').toBe(1)
  expectClean(w)
})

test('no request is issued while an Operand is incomplete', async ({ page }) => {
  const w = watch(page)
  await open(page)
  await setOperand(page, 'left', '1.')
  await expect(page.getByTestId('key-equals')).toBeDisabled()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  expect(w.posts.length, 'no POST for an incomplete Operand').toBe(0)
  await expect(page.getByTestId('result')).toHaveAttribute('data-state', 'empty')
  expectClean(w)
})

test('switching Operation cannot strand a hidden value into the request', async ({ page }) => {
  const w = watch(page)
  await open(page)
  // Fill a binary Calculation, then switch to sqrt and submit.
  await setOperand(page, 'left', '7')
  await setOperand(page, 'right', '8')
  await pickOperation(page, 'sqrt')
  await setOperand(page, 'operand', '9')
  const [unary] = await Promise.all([page.waitForRequest(isCalcPost), submit(page)])
  expect(JSON.parse(unary.postData() ?? '{}'), 'sqrt carries only its own Operand').toEqual({
    operation: 'sqrt',
    operand: '9',
  })
  await expect(page.getByTestId('result-value')).toHaveText('3')

  // Now percentage: the body must name percent/of and nothing else.
  await pickOperation(page, 'percentage')
  await setOperand(page, 'percent', '15')
  await setOperand(page, 'of', '200')
  const [pct] = await Promise.all([page.waitForRequest(isCalcPost), submit(page)])
  expect(JSON.parse(pct.postData() ?? '{}')).toEqual({
    operation: 'percentage',
    percent: '15',
    of: '200',
  })
  await expect(page.getByTestId('result-value')).toHaveText('30')

  // Back to add: the earlier left/right are still there — visible, not stale.
  await pickOperation(page, 'add')
  await expect(page.getByTestId('operand-left')).toHaveValue('7')
  await expect(page.getByTestId('operand-right')).toHaveValue('8')
  const [binary] = await Promise.all([page.waitForRequest(isCalcPost), submit(page)])
  expect(JSON.parse(binary.postData() ?? '{}')).toEqual({
    operation: 'add',
    left: '7',
    right: '8',
  })
  await expect(page.getByTestId('result-value')).toHaveText('15')
  expectClean(w)
})

// ──────── One Calculation per press, and the guard always releases (WEB-8) ───

test('two Enter keydowns in the same tick produce exactly one POST', async ({ page }) => {
  const w = watch(page)
  await holdInFlight(page)
  await armed(page)
  // Synchronous double dispatch: `isPending` has not flipped between them, so
  // only a synchronous guard can stop the second. Two `keyboard.press` calls
  // would not reach this window — their own latency exceeds it.
  await page.evaluate(() => {
    const fire = () =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    fire()
    fire()
  })
  await expect(page.getByTestId('result')).toHaveAttribute('data-state', 'pending')
  await expect(page.getByTestId('result-value')).toHaveText('5', { timeout: 15000 })
  expect(w.posts.length, 'POSTs from a same-tick double Enter').toBe(1)
  expectClean(w)
})

test('a rapid double click on = produces exactly one POST', async ({ page }) => {
  const w = watch(page)
  await holdInFlight(page)
  await armed(page)
  await page.getByTestId('key-equals').dblclick()
  await expect(page.getByTestId('result-value')).toHaveText('5', { timeout: 15000 })
  expect(w.posts.length, 'POSTs from a double click').toBe(1)
  expectClean(w)
})

test('the guard releases after a completed Calculation', async ({ page }) => {
  const w = watch(page)
  await open(page)
  await compute(page, 'add', { left: '2', right: '3' })
  await expect(page.getByTestId('result-value')).toHaveText('5')
  expect(w.posts.length).toBe(1)
  await setOperand(page, 'right', '4')
  await submit(page)
  await expect(page.getByTestId('result-value')).toHaveText('6')
  expect(w.posts.length, 'a second Calculation still goes through').toBe(2)
  expectClean(w)
})

test('the guard releases after a refused Calculation', async ({ page }) => {
  const w = watch(page)
  await open(page)
  await compute(page, 'divide', { left: '1', right: '0' })
  await expect(page.getByTestId('error-code')).toHaveText('division_by_zero')
  expect(w.posts.length).toBe(1)
  await setOperand(page, 'right', '4')
  await submit(page)
  await expect(page.getByTestId('result-value')).toHaveText('0.25')
  await expect(page.getByTestId('error')).toHaveCount(0)
  expect(w.posts.length, 'a Calculation after a failure still goes through').toBe(2)
  expectClean(w, 1)
})

test('clearing while a Calculation is in flight does not deadlock the = key', async ({ page }) => {
  const w = watch(page)
  await holdInFlight(page, 1200)
  await armed(page)
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('result')).toHaveAttribute('data-state', 'pending')

  // Escape clears and resets the mutation while the POST is still open, which
  // detaches the observer — the guard has to be released without `onSettled`.
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('operand-left')).toHaveValue('')
  await expect(page.getByTestId('result')).toHaveAttribute('data-state', 'empty')

  // Once the abandoned request settles, a new Calculation must still go through.
  await page.waitForTimeout(2000)
  await setOperand(page, 'left', '4')
  await setOperand(page, 'right', '5')
  await submit(page)
  await expect(page.getByTestId('result-value')).toHaveText('9', { timeout: 15000 })
  expect(w.posts.length, 'the guard released after the abandoned Calculation').toBe(2)
  expectClean(w)
})

test('switching Operation while in flight does not deadlock the = key', async ({ page }) => {
  const w = watch(page)
  await holdInFlight(page, 1200)
  await armed(page)
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('result')).toHaveAttribute('data-state', 'pending')
  await page.getByTestId('op-multiply').click()
  await expect(page.getByTestId('result-value')).toHaveText('5', { timeout: 15000 })

  await submit(page)
  await expect(page.getByTestId('result-value')).toHaveText('6', { timeout: 15000 })
  expect(w.posts.length).toBe(2)
  expectClean(w)
})

test('a retry that fails again still leaves the = key usable', async ({ page }) => {
  const w = watch(page)
  let fail = true
  await page.route(CALC, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    if (fail) return route.abort('connectionrefused')
    await route.fallback()
  })
  await open(page)
  await compute(page, 'add', { left: '2', right: '3' })
  await expect(page.getByTestId('error')).toBeVisible()

  await page.getByTestId('retry').click()
  await expect(page.getByTestId('error')).toBeVisible()
  expect(w.posts.length).toBe(2)

  fail = false
  await submit(page)
  await expect(page.getByTestId('result-value')).toHaveText('5', { timeout: 15000 })
  expect(w.posts.length).toBe(3)
  expect(w.requestFailures.length, 'two deliberate aborts').toBe(2)
})

// ─────────────── Every error form renders distinguishably (req 7) ────────────

const ERROR_FORMS = [
  { code: 'division_by_zero', op: 'divide', operands: { left: '1', right: '0' } },
  { code: 'undefined_result', op: 'divide', operands: { left: '0', right: '0' } },
  { code: 'negative_square_root', op: 'sqrt', operands: { operand: '-4' } },
  { code: 'result_too_large', op: 'power', operands: { left: '9', right: '1001' } },
] as const

for (const form of ERROR_FORMS) {
  test(`${form.code} renders its own code, the API's message and a retry`, async ({
    page,
    request,
  }) => {
    const expected = await apiAnswer(request, { operation: form.op, ...form.operands })
    expect(expected.error, 'the API still answers this Calculation with this form').toBe(form.code)

    const w = watch(page)
    await open(page)
    await compute(page, form.op, form.operands)
    const notice = page.getByTestId('error')
    await expect(notice).toBeVisible()
    await expect(notice).toHaveAttribute('data-error-code', form.code)
    await expect(page.getByTestId('error-code')).toHaveText(form.code)
    await expect(page.getByTestId('error-message')).toHaveText(expected.message!)
    await expect(page.getByTestId('retry')).toBeVisible()
    expectClean(w, 1)
  })
}

test('invalid_request renders distinguishably when the body is rewritten in flight', async ({
  page,
  request,
}) => {
  // The Operand fields cannot compose this body; only a rewrite in flight can.
  const illegal = { operation: 'sqrt', operand: '1', left: '2' }
  const expected = await apiAnswer(request, illegal)
  expect(expected.error).toBe('invalid_request')

  const w = watch(page)
  await page.route(CALC, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    await route.continue({ postData: JSON.stringify(illegal) })
  })
  await open(page)
  await compute(page, 'sqrt', { operand: '9' })
  const notice = page.getByTestId('error')
  await expect(notice).toBeVisible()
  await expect(notice).toHaveAttribute('data-error-code', 'invalid_request')
  await expect(page.getByTestId('error-message')).toHaveText(expected.message!)
  expectClean(w, 1)
})

// ─────────────────────── The three intentional states ────────────────────────

test('idle — the empty state is what the app opens on', async ({ page }) => {
  const w = watch(page)
  await open(page)
  const result = page.getByTestId('result')
  await expect(result).toHaveAttribute('data-state', 'empty')
  await expect(result).toContainText('Fill the Operands, then press =')
  await expect(page.getByTestId('key-equals')).toBeDisabled()
  await expect(page.getByTestId('error')).toHaveCount(0)
  expectClean(w)
})

test('pending — a delayed API leaves a real pending state with = disabled', async ({ page }) => {
  const w = watch(page)
  await holdInFlight(page, 1500)
  await open(page)
  await pickOperation(page, 'add')
  await setOperand(page, 'left', '2')
  await setOperand(page, 'right', '3')
  await page.getByTestId('key-equals').click()
  const result = page.getByTestId('result')
  await expect(result).toHaveAttribute('data-state', 'pending')
  await expect(result).toContainText('computing…')
  await expect(page.getByTestId('key-equals')).toBeDisabled()
  await expect(page.getByTestId('key-equals')).toHaveAttribute('aria-busy', 'true')
  await expect(page.getByTestId('result-value')).toHaveText('5', { timeout: 15000 })
  expectClean(w)
})

test('error with a working retry — the retry re-issues and recovers', async ({ page }) => {
  const w = watch(page)
  let fail = true
  await page.route(CALC, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    if (fail) return route.abort('connectionrefused')
    await route.fallback()
  })
  await open(page)
  await compute(page, 'add', { left: '2', right: '3' })

  const notice = page.getByTestId('error')
  await expect(notice).toBeVisible()
  await expect(notice).toHaveAttribute('data-error-code', 'no_response')
  await expect(page.getByTestId('error-message')).toContainText('The API did not answer')
  const before = w.posts.length

  fail = false
  await page.getByTestId('retry').click()
  await expect(page.getByTestId('result-value')).toHaveText('5', { timeout: 15000 })
  await expect(page.getByTestId('error')).toHaveCount(0)
  expect(w.posts.length, 'retry re-issued the request').toBe(before + 1)

  // The abort we caused is the only network failure allowed here.
  expect(w.requestFailures).toHaveLength(1)
  expect(w.requestFailures[0]).toContain('/api/calculations')
})

// ───────────────────── The Session identifier (requirements 4 and 5) ─────────

test('the Session identifier rides every request and survives a reload', async ({ page }) => {
  const w = watch(page)
  await open(page)
  const [first] = await Promise.all([
    page.waitForRequest(isCalcPost),
    compute(page, 'add', { left: '1', right: '1' }),
  ])
  const id = first.headers()['x-session-id']
  expect(id, 'X-Session-Id is a UUID').toMatch(UUID)
  await expect(page.getByTestId('session-tag')).toContainText(id.slice(0, 8))

  await page.reload()
  await expect(page.getByTestId('result')).toBeVisible()
  const [second] = await Promise.all([
    page.waitForRequest(isCalcPost),
    compute(page, 'add', { left: '2', right: '2' }),
  ])
  expect(second.headers()['x-session-id'], 'the same Session survives a reload').toBe(id)
  expectClean(w)
})

test('a fresh browser context gets a different Session', async ({ page, browser }) => {
  await open(page)
  const first = await page.getByTestId('session-tag').innerText()

  const other = await browser.newContext()
  const otherPage = await other.newPage()
  await open(otherPage)
  const second = await otherPage.getByTestId('session-tag').innerText()
  expect(second).not.toBe(first)
  await other.close()
})

// ────────────────────── Keypad and keyboard (requirement 1) ──────────────────

test('digits, decimal, operator keys, Enter, = , Escape and Backspace all work', async ({
  page,
}) => {
  const w = watch(page)
  await open(page)
  await page.getByRole('heading', { name: 'Calculator' }).click()

  // Digits and the decimal point land in the active Operand.
  await page.keyboard.type('12.5')
  await expect(page.getByTestId('operand-left')).toHaveValue('12.5')

  // Backspace deletes one character.
  await page.keyboard.press('Backspace')
  await expect(page.getByTestId('operand-left')).toHaveValue('12.')

  // Escape clears everything.
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('operand-left')).toHaveValue('')

  // Each operator key selects its Operation.
  for (const [key, op] of [
    ['+', 'add'],
    ['-', 'subtract'],
    ['*', 'multiply'],
    ['/', 'divide'],
  ] as const) {
    await page.keyboard.press('Escape')
    await page.keyboard.press(key)
    await expect(page.getByTestId('operation-name')).toHaveText(op)
  }

  // Enter submits.
  await page.keyboard.press('Escape')
  await page.keyboard.press('*')
  await page.keyboard.type('8')
  await page.keyboard.press('*')
  await page.keyboard.type('9')
  await expect(page.getByTestId('operand-left')).toHaveValue('8')
  await expect(page.getByTestId('operand-right')).toHaveValue('9')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('result-value')).toHaveText('72')

  // `=` submits too.
  await page.keyboard.press('Escape')
  await page.keyboard.press('+')
  await page.keyboard.type('4')
  await page.keyboard.press('+')
  await page.keyboard.type('5')
  await page.keyboard.press('=')
  await expect(page.getByTestId('result-value')).toHaveText('9')
  expect(w.posts.length).toBe(2)
  expectClean(w)
})

test('the keypad keys cover digits, decimal, sign, delete and clear', async ({ page }) => {
  const w = watch(page)
  await open(page)
  for (const d of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']) {
    await expect(page.getByTestId(`key-${d}`)).toBeVisible()
  }
  await page.getByTestId('key-7').click()
  await page.getByTestId('key-decimal').click()
  await page.getByTestId('key-5').click()
  await expect(page.getByTestId('operand-left')).toHaveValue('7.5')
  await page.getByTestId('key-sign').click()
  await expect(page.getByTestId('operand-left')).toHaveValue('-7.5')
  await page.getByTestId('key-sign').click()
  await expect(page.getByTestId('operand-left')).toHaveValue('7.5')
  await page.getByTestId('key-delete').click()
  await expect(page.getByTestId('operand-left')).toHaveValue('7.')
  await page.getByTestId('key-clear').click()
  await expect(page.getByTestId('operand-left')).toHaveValue('')
  expectClean(w)
})

// ───────────────────────── Presentation (requirements 10 and 11) ─────────────

test('numerics are monospace with tabular figures', async ({ page }) => {
  const w = watch(page)
  await open(page)
  await compute(page, 'add', { left: '111', right: '888' })
  await expect(page.getByTestId('result-value')).toHaveText('999')
  const styles = await page.evaluate(() => {
    const read = (selector: string) => {
      const style = getComputedStyle(document.querySelector(selector)!)
      return { family: style.fontFamily, numeric: style.fontVariantNumeric }
    }
    return {
      result: read('[data-testid="result-value"]'),
      operand: read('[data-testid="operand-left"]'),
    }
  })
  expect(styles.result.numeric, 'Results do not shift horizontally').toContain('tabular-nums')
  expect(styles.operand.numeric, 'Operands do not shift horizontally').toContain('tabular-nums')
  expect(styles.result.family.toLowerCase()).toMatch(/mono/)
  expectClean(w)
})

test('at 375px the keypad reflows, nothing scrolls sideways, targets are ≥44px', async ({
  page,
}) => {
  const w = watch(page)
  await page.setViewportSize({ width: 375, height: 720 })
  await open(page)
  await pickOperation(page, 'percentage')
  await setOperand(page, 'percent', '15')
  await setOperand(page, 'of', '200')
  await submit(page)
  await expect(page.getByTestId('result-value')).toHaveText('30')

  const scroll = await page.evaluate(() => ({
    scrollWidth: document.scrollingElement!.scrollWidth,
    clientWidth: document.scrollingElement!.clientWidth,
  }))
  expect(scroll.scrollWidth, 'no horizontal page scroll').toBeLessThanOrEqual(scroll.clientWidth)

  const boxes = await page
    .locator('[data-testid^="key-"], [data-testid^="op-"]')
    .evaluateAll((els) =>
      els.map((el) => {
        const rect = el.getBoundingClientRect()
        return {
          id: el.getAttribute('data-testid'),
          width: rect.width,
          height: rect.height,
          right: rect.right,
        }
      }),
    )
  expect(boxes.length, 'keypad buttons measured').toBeGreaterThanOrEqual(20)
  const small = boxes.filter((b) => b.width < 44 || b.height < 44)
  expect(small, `touch targets under 44px: ${JSON.stringify(small)}`).toEqual([])
  const overflowing = boxes.filter((b) => b.right > 375)
  expect(overflowing, 'keys reaching past the viewport').toEqual([])
  expectClean(w)
})

test('a 50,000-digit Result wraps in its own well without breaking the layout', async ({
  page,
  request,
}) => {
  // The largest Operand the fields accept (the contract's 50-character
  // maxLength) raised to 1000 — the widest Result the API will hand back.
  const base = '9'.repeat(50)
  const expected = await apiAnswer(request, { operation: 'power', left: base, right: '1000' })
  expect(expected.result, 'the API computes this Calculation').toBeTruthy()
  const digits = expected.result!.replace(/\D/g, '').length

  const w = watch(page)
  await open(page)
  await pickOperation(page, 'power')
  await setOperand(page, 'left', base)
  await setOperand(page, 'right', '1000')
  await submit(page)

  await expect(page.getByTestId('result')).toHaveAttribute('data-state', 'ready', {
    timeout: 30000,
  })
  const rendered = await page
    .getByTestId('result-value')
    .evaluate((el) => (el.textContent ?? '').replace(/\s/g, '').length)
  expect(rendered, 'every digit the API sent is rendered').toBe(digits)
  await expect(page.getByTestId('result-digit-count')).toHaveText(
    `${new Intl.NumberFormat('en-US').format(digits)} digits`,
  )

  const metrics = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[data-testid="result-value"]')!
    return {
      pageScrollWidth: document.scrollingElement!.scrollWidth,
      pageClientWidth: document.scrollingElement!.clientWidth,
      wellScrollWidth: el.scrollWidth,
      wellClientWidth: el.clientWidth,
      wellClientHeight: el.clientHeight,
      wellScrollHeight: el.scrollHeight,
      overflowY: getComputedStyle(el).overflowY,
    }
  })
  expect(metrics.pageScrollWidth, 'no horizontal page scroll').toBeLessThanOrEqual(
    metrics.pageClientWidth,
  )
  expect(
    metrics.wellScrollWidth,
    'the Result wraps rather than scrolling sideways',
  ).toBeLessThanOrEqual(metrics.wellClientWidth + 1)
  expect(metrics.overflowY, 'the well scrolls vertically').toBe('auto')
  expect(metrics.wellScrollHeight).toBeGreaterThan(metrics.wellClientHeight)

  // The same Result at 375px must not push the page sideways either.
  await page.setViewportSize({ width: 375, height: 720 })
  const narrow = await page.evaluate(() => ({
    scrollWidth: document.scrollingElement!.scrollWidth,
    clientWidth: document.scrollingElement!.clientWidth,
  }))
  expect(narrow.scrollWidth).toBeLessThanOrEqual(narrow.clientWidth)
  expectClean(w)
})
