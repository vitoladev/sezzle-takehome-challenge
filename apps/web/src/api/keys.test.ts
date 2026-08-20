import { expect, test } from 'vitest'
import { historyQueryKey } from './keys.ts'

test('the query key carries the Session identifier', () => {
  const sessionId = crypto.randomUUID()

  expect(historyQueryKey(sessionId)).toContain(sessionId)
})

test('two Sessions cannot land on the same cache entry', () => {
  const one = historyQueryKey(crypto.randomUUID())
  const other = historyQueryKey(crypto.randomUUID())

  expect(one).not.toEqual(other)
})
