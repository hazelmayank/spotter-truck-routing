import { render, screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { Legend } from './Legend'

it('lists every risk level in order', () => {
  render(<Legend />)

  const items = within(screen.getByRole('group', { name: 'Legend' })).getAllByRole('listitem')

  expect(items.map((item) => item.textContent)).toEqual([
    'Low',
    'Moderate',
    'High',
    'Severe',
    'No travel',
    'Origin',
    'Destination',
  ])
})

it('colors each swatch with the risk color', () => {
  const { container } = render(<Legend />)

  const swatches = Array.from(
    container.querySelectorAll<HTMLElement>('[style*="background-color"]'),
  )

  expect(swatches.map((swatch) => swatch.style.backgroundColor)).toEqual([
    'rgb(22, 163, 74)',
    'rgb(250, 204, 21)',
    'rgb(249, 115, 22)',
    'rgb(220, 38, 38)',
    'rgb(59, 7, 100)',
  ])
})

it('names the risk levels in text, not only in color, in a labelled list', () => {
  render(<Legend />)

  const levels = within(screen.getByRole('list', { name: 'Checkpoint risk' })).getAllByRole(
    'listitem',
  )

  expect(levels.map((item) => item.textContent)).toEqual([
    'Low',
    'Moderate',
    'High',
    'Severe',
    'No travel',
  ])
})
