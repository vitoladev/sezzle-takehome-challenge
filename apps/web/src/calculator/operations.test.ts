import { expect, test } from 'vitest'
import {
  EMPTY_OPERANDS,
  OPERATIONS,
  buildRequest,
  entryRoleFor,
  type Operation,
} from './operations.ts'

test('each Operation names the Operand roles its arity allows', () => {
  const roles: Record<Operation, readonly string[]> = {
    add: ['left', 'right'],
    subtract: ['left', 'right'],
    multiply: ['left', 'right'],
    divide: ['left', 'right'],
    power: ['left', 'right'],
    sqrt: ['operand'],
    percentage: ['percent', 'of'],
  }

  for (const [operation, expected] of Object.entries(roles)) {
    expect(OPERATIONS[operation as Operation].roles).toEqual(expected)
  }
})

test('percentage names its Operands percent and of, never left and right', () => {
  expect(OPERATIONS.percentage.roles).not.toContain('left')
  expect(OPERATIONS.percentage.roles).not.toContain('right')
})

test('a request carries only the Operands the Operation takes', () => {
  const operands = { ...EMPTY_OPERANDS, left: '1', right: '2', operand: '4', percent: '15', of: '200' }

  expect(buildRequest('add', operands)).toEqual({ operation: 'add', left: '1', right: '2' })
  expect(buildRequest('sqrt', operands)).toEqual({ operation: 'sqrt', operand: '4' })
  expect(buildRequest('percentage', operands)).toEqual({
    operation: 'percentage',
    percent: '15',
    of: '200',
  })
})

test('entry lands on the first Operand the Operation still needs', () => {
  expect(entryRoleFor('add', EMPTY_OPERANDS, 'left')).toBe('left')
  expect(entryRoleFor('multiply', { ...EMPTY_OPERANDS, left: '7' }, 'left')).toBe('right')
  expect(entryRoleFor('sqrt', { ...EMPTY_OPERANDS, left: '7' }, 'left')).toBe('operand')
  expect(entryRoleFor('percentage', EMPTY_OPERANDS, 'right')).toBe('percent')
})

test('entry stays put when the Operation has every Operand it needs', () => {
  const filled = { ...EMPTY_OPERANDS, left: '1', right: '2' }
  expect(entryRoleFor('add', filled, 'right')).toBe('right')
  expect(entryRoleFor('add', filled, 'operand')).toBe('right')
})
