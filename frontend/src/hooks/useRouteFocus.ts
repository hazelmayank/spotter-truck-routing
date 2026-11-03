import { useState } from 'react'
import type { CheckpointTarget, PlanResponse } from '../types'

interface Focus {
  plan: PlanResponse | undefined
  hoveredId: string | null
  selectedId: string | null
  checkpoint: CheckpointTarget | null // the checkpoint whose popup is open
}

const NO_FOCUS: Omit<Focus, 'plan'> = { hoveredId: null, selectedId: null, checkpoint: null }

export type RouteFocus = ReturnType<typeof useRouteFocus>

/** Which route is hovered or selected and which checkpoint is open; resets with a new plan. */
export function useRouteFocus(plan: PlanResponse | undefined) {
  const [focus, setFocus] = useState<Focus>({ plan, ...NO_FOCUS })
  const current = focus.plan === plan ? focus : { plan, ...NO_FOCUS }

  return {
    hoveredId: current.hoveredId,
    selectedId: current.selectedId,
    checkpoint: current.checkpoint,
    // The map reports the hover on every mouse move, so unchanged values must not re-render.
    hover: (hoveredId: string | null) => {
      if (hoveredId !== current.hoveredId) setFocus({ ...current, hoveredId })
    },
    select: (selectedId: string | null) => setFocus({ ...current, selectedId }),
    showCheckpoint: (checkpoint: CheckpointTarget | null) => setFocus({ ...current, checkpoint }),
  }
}
