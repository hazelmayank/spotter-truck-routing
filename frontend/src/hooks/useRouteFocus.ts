import { useCallback, useEffect, useRef, useState } from 'react'
import type { CheckpointTarget, PlanResponse } from '../types'

interface Focus {
  plan: PlanResponse | undefined
  hoveredId: string | null
  selectedId: string | null
  checkpoint: CheckpointTarget | null // the checkpoint whose popup is open
}

type FocusChanges = Partial<Omit<Focus, 'plan'>>

const NO_FOCUS: Omit<Focus, 'plan'> = { hoveredId: null, selectedId: null, checkpoint: null }

export type RouteFocus = ReturnType<typeof useRouteFocus>

/** Which route is hovered or selected and which checkpoint is open; resets with a new plan. */
export function useRouteFocus(plan: PlanResponse | undefined) {
  const [focus, setFocus] = useState<Focus>({ plan, ...NO_FOCUS })
  const current = focus.plan === plan ? focus : { plan, ...NO_FOCUS }

  // The updaters keep the same identity until the plan changes, so memoized children can skip
  // re-rendering. They read the latest focus from a ref and return before calling setState when
  // nothing would change: React still renders the host component once for a no-op update, and
  // the map reports the hover on every mouse move.
  const latest = useRef(current)
  useEffect(() => {
    latest.current = current
  })

  const update = useCallback(
    (changes: FocusChanges) => {
      const keys = Object.keys(changes) as (keyof FocusChanges)[]
      if (keys.every((key) => latest.current[key] === changes[key])) return
      setFocus((previous) => {
        const base = previous.plan === plan ? previous : { plan, ...NO_FOCUS }
        return { ...base, ...changes }
      })
    },
    [plan],
  )

  const hover = useCallback((hoveredId: string | null) => update({ hoveredId }), [update])
  const select = useCallback((selectedId: string | null) => update({ selectedId }), [update])
  const showCheckpoint = useCallback(
    (checkpoint: CheckpointTarget | null) => update({ checkpoint }),
    [update],
  )

  return {
    hoveredId: current.hoveredId,
    selectedId: current.selectedId,
    checkpoint: current.checkpoint,
    hover,
    select,
    showCheckpoint,
  }
}
