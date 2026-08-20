import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { postCalculation, type CalculationRequest } from '@/api/client.ts'
import { historyQueryKey } from '@/api/keys.ts'
import { HistoryPanel } from '@/features/history/components/HistoryPanel.tsx'
import { ErrorNotice } from '../components/ErrorNotice.tsx'
import { Keypad } from '../components/Keypad.tsx'
import { OperandFields } from '../components/OperandFields.tsx'
import { ResultDisplay } from '../components/ResultDisplay.tsx'
import { useSessionId } from '../hooks/useSessionId.ts'
import { applyEntry, isCompleteOperand, type KeypadAction } from '../model/entry.ts'
import { actionForKey } from '../model/keyboard.ts'
import {
  EMPTY_OPERANDS,
  OPERATIONS,
  buildRequest,
  entryRoleFor,
  type OperandRole,
  type OperandValues,
  type Operation,
} from '../model/operations.ts'

export function Calculator() {
  const sessionId = useSessionId()
  const queryClient = useQueryClient()
  const [operation, setOperation] = useState<Operation>('add')
  const [operands, setOperands] = useState(EMPTY_OPERANDS)
  const [activeRole, setActiveRole] = useState<OperandRole>('left')

  const { data, error, isError, isPending, mutate, reset, variables } = useMutation({
    mutationFn: (request: CalculationRequest) => postCalculation(sessionId, request),
    // Deliberately a mutation option rather than a per-call one: `reset()`
    // detaches the observer, so a Calculation cleared while in flight would
    // never invalidate the History the server has already recorded it in.
    // The double-submit guard below needs the opposite and stays per-call.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: historyQueryKey(sessionId) })
    },
  })

  const roles = OPERATIONS[operation].roles
  const sessionTag = sessionId.slice(0, 8)
  const ready = roles.every((role) => isCompleteOperand(operands[role]))

  const inFlight = useRef(false)
  const submit = useCallback(
    (request: CalculationRequest) => {
      // A second `=` can arrive before React has re-rendered, while `isPending`
      // is still false; the ref closes that window synchronously.
      if (inFlight.current) return
      inFlight.current = true
      mutate(request, {
        onSettled: () => {
          inFlight.current = false
        },
      })
    },
    [mutate],
  )

  /** Carries a Result out of History into the next Calculation's first Operand. */
  const carryResult = useCallback(
    (result: string) => {
      const role = OPERATIONS[operation].roles[0]
      const next: OperandValues = { ...operands, [role]: result }
      setOperands(next)
      setActiveRole(entryRoleFor(operation, next, role))
    },
    [operands, operation],
  )

  const handleAction = useCallback(
    (action: KeypadAction) => {
      switch (action.kind) {
        case 'operation':
          setOperation(action.operation)
          setActiveRole(entryRoleFor(action.operation, operands, activeRole))
          return
        case 'clear':
          setOperands(EMPTY_OPERANDS)
          setActiveRole(OPERATIONS[operation].roles[0])
          // `reset()` detaches this observer from the mutation, so the
          // `onSettled` handed to `mutate()` never runs for a Calculation
          // cleared in flight — the guard has to be released here instead.
          inFlight.current = false
          reset()
          return
        case 'submit':
          // The keyboard reaches this without passing the disabled `=` key.
          if (ready) submit(buildRequest(operation, operands))
          return
        default:
          setOperands((current) => ({
            ...current,
            [activeRole]: applyEntry(current[activeRole], action),
          }))
      }
    },
    [activeRole, operands, operation, ready, reset, submit],
  )

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const action = actionForKey(event.key)
      if (action === null) return

      // A focused Operand field edits itself; the keypad owns every other key.
      const editing =
        event.target instanceof HTMLInputElement && 'operandField' in event.target.dataset
      const edits = action.kind === 'digit' || action.kind === 'decimal' || action.kind === 'delete'
      if (editing && edits) return

      // `Enter` is a focused button's own activation key: stealing it would run
      // the keypad's submit instead of the button's click — recording a second
      // Calculation where the user asked to carry a Result or retry a refusal.
      if (event.key === 'Enter' && event.target instanceof HTMLButtonElement) return

      event.preventDefault()
      handleAction(action)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleAction])

  return (
    <div className="workbench">
      <section className="ticket" aria-label="Calculator">
        <div className="ticket-caption">
          <span data-testid="operation-name">{operation}</span>
          <span
            data-testid="session-tag"
            title="This tab's Session. Its History is separate from every other tab's."
          >
            session {sessionTag}
          </span>
        </div>

        <OperandFields
          operation={operation}
          operands={operands}
          activeRole={activeRole}
          onActivate={setActiveRole}
          onChange={(role, value) => setOperands((current) => ({ ...current, [role]: value }))}
        />

        <ResultDisplay calculation={data} pending={isPending} failed={isError} />

        {isError && (
          <ErrorNotice
            error={error}
            retryDisabled={isPending}
            onRetry={() => {
              if (variables) submit(variables)
            }}
          />
        )}

        <Keypad
          operation={operation}
          canSubmit={ready}
          pending={isPending}
          onAction={handleAction}
        />
      </section>

      <HistoryPanel sessionId={sessionId} onUseResult={carryResult} />
    </div>
  )
}
