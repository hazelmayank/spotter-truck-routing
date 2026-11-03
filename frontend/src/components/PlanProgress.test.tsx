import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlanProgress } from './PlanProgress'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

const status = () => screen.getByRole('status')
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms))

describe('PlanProgress', () => {
  it('starts with the first step', () => {
    render(<PlanProgress />)

    expect(status()).toHaveTextContent('Finding places…')
  })

  it('moves through the steps as time passes', () => {
    render(<PlanProgress />)

    advance(2_000)
    expect(status()).toHaveTextContent('Finding routes…')

    advance(7_000)
    expect(status()).toHaveTextContent('Checking weather…')
  })

  it('says roughly how long it takes', () => {
    render(<PlanProgress />)

    expect(screen.getByText('This usually takes around 10 seconds.')).toBeInTheDocument()
  })

  it('shows three placeholder cards that screen readers skip', () => {
    const { container } = render(<PlanProgress />)

    const placeholders = container.querySelector('ul[aria-hidden="true"]')
    expect(placeholders?.querySelectorAll('li')).toHaveLength(3)
    expect(placeholders?.querySelector('li')).toHaveClass('animate-pulse')
  })

  it('stops its timer when it goes away', () => {
    const { unmount } = render(<PlanProgress />)
    expect(vi.getTimerCount()).toBe(1)

    unmount()

    expect(vi.getTimerCount()).toBe(0)
  })
})
