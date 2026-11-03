import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAnimationFrameValue } from './useAnimationFrameValue'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
})

afterEach(() => {
  vi.useRealTimers()
})

const FRAME_MS = 16

function setup(initial: number) {
  let renders = 0
  const hook = renderHook(
    ({ value }) => {
      renders += 1
      return useAnimationFrameValue(value)
    },
    { initialProps: { value: initial } },
  )
  return { ...hook, renderCount: () => renders }
}

describe('useAnimationFrameValue', () => {
  it('returns the first value straight away', () => {
    const { result } = setup(7)

    expect(result.current).toBe(7)
  })

  it('shows a new value only when the next frame arrives', () => {
    const { result, rerender } = setup(0)

    rerender({ value: 5 })
    expect(result.current).toBe(0)

    act(() => vi.advanceTimersByTime(FRAME_MS))
    expect(result.current).toBe(5)
  })

  it('shows only the latest of many changes within one frame, with one update', () => {
    const { result, rerender, renderCount } = setup(0)
    for (const value of [1, 2, 3, 4, 5]) rerender({ value })
    const rendersBeforeTheFrame = renderCount()

    act(() => vi.advanceTimersByTime(FRAME_MS))

    expect(result.current).toBe(5)
    expect(renderCount()).toBe(rendersBeforeTheFrame + 1)
  })

  it('follows a value that changes every frame', () => {
    const { result, rerender } = setup(0)

    for (const value of [1, 2, 3]) {
      rerender({ value })
      act(() => vi.advanceTimersByTime(FRAME_MS))
      expect(result.current).toBe(value)
    }
  })

  it('does not update again when the value ends up unchanged', () => {
    const { rerender, renderCount } = setup(4)
    act(() => vi.advanceTimersByTime(FRAME_MS))
    const rendersBefore = renderCount()

    rerender({ value: 4 })
    act(() => vi.advanceTimersByTime(FRAME_MS))

    expect(renderCount()).toBe(rendersBefore + 1) // only the rerender itself
  })

  it('cancels its pending frame when it goes away', () => {
    const { rerender, unmount } = setup(0)
    rerender({ value: 1 })
    expect(vi.getTimerCount()).toBe(1)

    unmount()

    expect(vi.getTimerCount()).toBe(0)
  })
})
