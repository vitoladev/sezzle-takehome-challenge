import type { components } from '@sezzle/api-contract'

export type Operation = components['schemas']['Operation']
export type CalculationRequest = components['schemas']['CalculationRequest']

/** An Operand's role in a Calculation. Operands are named by role, never by position. */
export type OperandRole = 'left' | 'right' | 'operand' | 'percent' | 'of'

export type OperandValues = Record<OperandRole, string>

/** An Operation always takes at least one Operand. */
type OperandRoles = readonly [OperandRole, ...OperandRole[]]

export const EMPTY_OPERANDS: OperandValues = {
  left: '',
  right: '',
  operand: '',
  percent: '',
  of: '',
}

/**
 * Every Operation with the key face it wears and the Operand roles it takes.
 * The roles are the arity: the interface renders one field per role and labels
 * each field with the role's own name, so `percentage` can only read as
 * Percent-of.
 */
export const OPERATIONS: Record<Operation, { symbol: string; roles: OperandRoles }> = {
  add: { symbol: '+', roles: ['left', 'right'] },
  subtract: { symbol: '−', roles: ['left', 'right'] },
  multiply: { symbol: '×', roles: ['left', 'right'] },
  divide: { symbol: '÷', roles: ['left', 'right'] },
  power: { symbol: 'xʸ', roles: ['left', 'right'] },
  sqrt: { symbol: '√', roles: ['operand'] },
  percentage: { symbol: '%of', roles: ['percent', 'of'] },
}

export const OPERATION_ORDER: readonly Operation[] = [
  'add',
  'subtract',
  'multiply',
  'divide',
  'power',
  'sqrt',
  'percentage',
]

/** Builds the request variant the Operation's arity allows. */
export function buildRequest(operation: Operation, operands: OperandValues): CalculationRequest {
  switch (operation) {
    case 'sqrt':
      return { operation, operand: operands.operand }
    case 'percentage':
      return { operation, percent: operands.percent, of: operands.of }
    default:
      return { operation, left: operands.left, right: operands.right }
  }
}

/**
 * Where keypad entry lands when an Operation is selected: the first Operand it
 * still needs, so `7` `×` `2` fills `left` then `right` without reaching for
 * the fields.
 */
export function entryRoleFor(
  operation: Operation,
  operands: OperandValues,
  current: OperandRole,
): OperandRole {
  const roles = OPERATIONS[operation].roles
  const empty = roles.find((role) => operands[role] === '')
  if (empty !== undefined) return empty
  return roles.includes(current) ? current : roles[roles.length - 1]
}
