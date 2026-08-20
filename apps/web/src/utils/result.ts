/** Past this length a Result is rendered long-form, with a digit count. */
const LONG_RESULT = 40

const count = new Intl.NumberFormat()

/** Whether a Result is too long to read as a single line of digits. */
export function isLongResult(result: string): boolean {
  return result.length > LONG_RESULT
}

/** How many digits a Result carries, grouped for reading. */
export function formatDigitCount(result: string): string {
  return count.format(result.replace(/\D/g, '').length)
}
