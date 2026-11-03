import { act, renderHook } from '@testing-library/react'
import type { MapLayerMouseEvent } from 'react-map-gl/maplibre'
import { describe, expect, it, vi } from 'vitest'
import { CHECKPOINT_LAYER_ID, ROUTE_HIT_LAYER_ID } from '../lib/mapData'
import { makePlan } from '../test/fixtures'
import type { PlanResponse } from '../types'
import { useMapPointer } from './useMapPointer'

function eventOver(...features: { layerId: string; properties: object }[]) {
  return {
    features: features.map(({ layerId, properties }) => ({ layer: { id: layerId }, properties })),
  } as unknown as MapLayerMouseEvent
}

const overCheckpoint = eventOver({
  layerId: CHECKPOINT_LAYER_ID,
  properties: { routeId: 'A', index: 1 },
})
const overRoute = eventOver({ layerId: ROUTE_HIT_LAYER_ID, properties: { id: 'B' } })
const overNothing = eventOver()

function setup(plan: PlanResponse | null = makePlan()) {
  const handlers = { onHover: vi.fn(), onSelect: vi.fn(), onCheckpoint: vi.fn() }
  const hook = renderHook(
    (props: { plan: PlanResponse | undefined }) => useMapPointer({ ...props, ...handlers }),
    {
      initialProps: { plan: plan ?? undefined },
    },
  )
  return { ...hook, ...handlers }
}

describe('useMapPointer clicks', () => {
  it('pins the checkpoint under the pointer without selecting a route', () => {
    const { result, onCheckpoint, onSelect } = setup()

    act(() => result.current.onClick(overCheckpoint))

    expect(onCheckpoint).toHaveBeenCalledWith({ routeId: 'A', index: 1, source: 'map' })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('selects the route under the pointer and unpins the checkpoint', () => {
    const { result, onCheckpoint, onSelect } = setup()

    act(() => result.current.onClick(overRoute))

    expect(onSelect).toHaveBeenCalledWith('B')
    expect(onCheckpoint).toHaveBeenCalledWith(null)
  })

  it('clears the selection when empty map is clicked', () => {
    const { result, onCheckpoint, onSelect } = setup()

    act(() => result.current.onClick(overNothing))

    expect(onSelect).toHaveBeenCalledWith(null)
    expect(onCheckpoint).toHaveBeenCalledWith(null)
  })
})

describe('useMapPointer mouse moves', () => {
  it('shows a tooltip and a pointer cursor over a checkpoint, and stops the route hover', () => {
    const { result, onHover } = setup()

    act(() => result.current.onMouseMove(overCheckpoint))

    expect(result.current.tooltip).toMatchObject({ routeId: 'A', index: 1 })
    expect(result.current.cursor).toBe('pointer')
    expect(onHover).toHaveBeenCalledWith(null)
  })

  it('hovers the route under the pointer and has no tooltip', () => {
    const { result, onHover } = setup()

    act(() => result.current.onMouseMove(overRoute))

    expect(result.current.tooltip).toBeNull()
    expect(result.current.cursor).toBe('pointer')
    expect(onHover).toHaveBeenCalledWith('B')
  })

  it('resets the cursor and the tooltip over empty map', () => {
    const { result, onHover } = setup()
    act(() => result.current.onMouseMove(overCheckpoint))

    act(() => result.current.onMouseMove(overNothing))

    expect(result.current.tooltip).toBeNull()
    expect(result.current.cursor).toBe('')
    expect(onHover).toHaveBeenLastCalledWith(null)
  })

  it('keeps the same tooltip object while the pointer stays on one checkpoint', () => {
    const { result } = setup()
    act(() => result.current.onMouseMove(overCheckpoint))
    const first = result.current.tooltip

    act(() => result.current.onMouseMove(overCheckpoint))

    expect(result.current.tooltip).toBe(first)
  })

  it('clears everything when the pointer leaves the map', () => {
    const { result, onHover } = setup()
    act(() => result.current.onMouseMove(overCheckpoint))

    act(() => result.current.onMouseLeave())

    expect(result.current.tooltip).toBeNull()
    expect(result.current.cursor).toBe('')
    expect(onHover).toHaveBeenLastCalledWith(null)
  })

  it('drops the tooltip when a new plan arrives', () => {
    const { result, rerender } = setup()
    act(() => result.current.onMouseMove(overCheckpoint))

    rerender({ plan: makePlan() })

    expect(result.current.tooltip).toBeNull()
  })

  it('shows no tooltip while there is no plan', () => {
    const { result } = setup(null)

    act(() => result.current.onMouseMove(overCheckpoint))

    expect(result.current.tooltip).toBeNull()
  })
})
