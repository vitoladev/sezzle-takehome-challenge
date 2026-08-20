import { useState } from 'react'

const STORAGE_KEY = 'sezzle.session-id'

/**
 * The only place in the app that touches `sessionStorage` (WEB-1's scoped
 * exception): the Session identifier is written once per tab and read back by
 * everything else through this module.
 */
export function getSessionId(): string {
  const stored = sessionStorage.getItem(STORAGE_KEY)
  if (stored !== null) return stored

  const created = crypto.randomUUID()
  sessionStorage.setItem(STORAGE_KEY, created)
  return created
}

export function useSessionId(): string {
  const [sessionId] = useState(getSessionId)
  return sessionId
}
