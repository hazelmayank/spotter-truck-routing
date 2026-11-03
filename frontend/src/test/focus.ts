import { vi } from 'vitest'
import type { RouteFocus } from '../hooks/useRouteFocus'

export function makeFocus(overrides: Partial<RouteFocus> = {}): RouteFocus {
  return {
    hoveredId: null,
    selectedId: null,
    checkpoint: null,
    hover: vi.fn(),
    select: vi.fn(),
    showCheckpoint: vi.fn(),
    ...overrides,
  }
}
