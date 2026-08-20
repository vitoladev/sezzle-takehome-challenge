import { ApiFailure } from '@/api/client.ts'

/** A failure the API never saw — nothing to render from the contract's Error. */
const NO_RESPONSE = {
  code: 'no_response',
  message: 'The API did not answer. Check that the server is running, then try again.',
}

/**
 * The one mapping from a thrown value to the code and message a visitor reads.
 * Both the Calculation notice and the History panel render through it, so a
 * refusal reads the same wherever it surfaces.
 */
export function describeError(error: unknown): { code: string; message: string } {
  return error instanceof ApiFailure
    ? { code: error.body.error, message: error.body.message }
    : NO_RESPONSE
}
