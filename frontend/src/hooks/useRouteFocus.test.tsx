import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makePlan } from '../test/fixtures'
import type { CheckpointTarget, PlanResponse } from '../types'
import { useRouteFocus } from './useRouteFocus'

function setup(plan: PlanResponse | undefined) {
  let renders = 0
  const hook = renderHook(
    ({ plan }) => {
      renders += 1
      return useRouteFocus(plan)
    },
    { initialProps: { plan } },
  )
  return { ...hook, renderCount: () => renders }
}

const target: CheckpointTarget = { routeId: 'A', index: 2, source: 'list' }

describe('useRouteFocus', () => {
  it('starts with nothing hovered, selected or open', () => {
    const { result } = setup(makePlan())

    expect(result.current.hoveredId).toBeNull()
    expect(result.current.selectedId).toBeNull()
    expect(result.current.checkpoint).toBeNull()
  })

  it('tracks hover, selection and the open checkpoint independently', () => {
    const { result } = setup(makePlan())

    act(() => result.current.hover('B'))
    act(() => result.current.select('A'))
    act(() => result.current.showCheckpoint(target))

    expect(result.current.hoveredId).toBe('B')
    expect(result.current.selectedId).toBe('A')
    expect(result.current.checkpoint).toEqual(target)
  })

  it('clears the hover without losing the selection', () => {
    const { result } = setup(makePlan())
    act(() => result.current.select('A'))

    act(() => result.current.hover('B'))
    act(() => result.current.hover(null))

    expect(result.current.hoveredId).toBeNull()
    expect(result.current.selectedId).toBe('A')
  })

  it('closes the checkpoint without losing the selection', () => {
    const { result } = setup(makePlan())
    act(() => result.current.select('A'))
    act(() => result.current.showCheckpoint(target))

    act(() => result.current.showCheckpoint(null))

    expect(result.current.checkpoint).toBeNull()
    expect(result.current.selectedId).toBe('A')
  })

  it('does not re-render when the same hover is reported again', () => {
    const { result, renderCount } = setup(makePlan())
    act(() => result.current.hover('A'))
    const rendersAfterFirstHover = renderCount()

    act(() => result.current.hover('A'))
    act(() => result.current.hover('A'))

    expect(renderCount()).toBe(rendersAfterFirstHover)
  })

  it('keeps the focus while the same plan is shown', () => {
    const plan = makePlan()
    const { result, rerender } = setup(plan)
    act(() => result.current.select('A'))

    rerender({ plan })

    expect(result.current.selectedId).toBe('A')
  })

  it('forgets everything when a new plan arrives', () => {
    const { result, rerender } = setup(makePlan())
    act(() => result.current.select('A'))
    act(() => result.current.hover('A'))
    act(() => result.current.showCheckpoint(target))

    rerender({ plan: makePlan() })

    expect(result.current.selectedId).toBeNull()
    expect(result.current.hoveredId).toBeNull()
    expect(result.current.checkpoint).toBeNull()
  })

  it('works within the new plan after a reset', () => {
    const { result, rerender } = setup(makePlan())
    act(() => result.current.select('A'))
    rerender({ plan: makePlan() })

    act(() => result.current.select('B'))

    expect(result.current.selectedId).toBe('B')
  })
})

describe('useRouteFocus callbacks', () => {
  it('keep their identity while the plan stays the same, however the focus changes', () => {
    const plan = makePlan()
    const { result, rerender } = setup(plan)
    const { hover, select, showCheckpoint } = result.current

    act(() => result.current.hover('A'))
    act(() => result.current.select('B'))
    act(() => result.current.showCheckpoint(target))
    rerender({ plan })

    expect(result.current.hover).toBe(hover)
    expect(result.current.select).toBe(select)
    expect(result.current.showCheckpoint).toBe(showCheckpoint)
  })

  it('change when the plan changes, because they reset the focus for the new plan', () => {
    const { result, rerender } = setup(makePlan())
    const before = result.current.hover

    rerender({ plan: makePlan() })

    expect(result.current.hover).not.toBe(before)
  })

  it('do not re-render for a selection or checkpoint that is already set', () => {
    const { result, renderCount } = setup(makePlan())
    act(() => result.current.select('A'))
    act(() => result.current.showCheckpoint(target))
    const rendersBefore = renderCount()

    act(() => result.current.select('A'))
    act(() => result.current.showCheckpoint(target))

    expect(renderCount()).toBe(rendersBefore)
  })
})
