import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RISK_LABELS, RISK_LEVELS } from '../lib/risk'
import { LevelBadge } from './LevelBadge'

describe('LevelBadge', () => {
  it.each(RISK_LEVELS)('names the %s level in words, not only by color', (level) => {
    render(<LevelBadge level={level} />)

    expect(screen.getByText(RISK_LABELS[level])).toBeInTheDocument()
  })
})
