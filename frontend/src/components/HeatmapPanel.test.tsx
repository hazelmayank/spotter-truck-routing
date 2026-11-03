import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HeatmapStoreContext } from '../hooks/useHeatmapControls'
import { createHeatmapStore } from '../store/heatmapStore'
import { makeHeatmapResponse } from '../test/helpers'
import { HeatmapPanel } from './HeatmapPanel'

function setup(props: Partial<Parameters<typeof HeatmapPanel>[0]> = {}) {
  const store = createHeatmapStore()
  const { container } = render(
    <HeatmapStoreContext value={store}>
      <HeatmapPanel data={makeHeatmapResponse()} isLoading={false} error={null} {...props} />
    </HeatmapStoreContext>,
  )
  return { store, container }
}

describe('while the heatmap loads', () => {
  it('shows a small chip and nothing else', () => {
    setup({ data: undefined, isLoading: true })

    expect(screen.getByRole('status')).toHaveTextContent('Loading weather heatmap…')
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
  })
})

describe('when the heatmap fails', () => {
  it('says so with the reason, as a chip', () => {
    setup({
      data: undefined,
      error: new Error('The weather service is not responding. Please try again in a moment.'),
    })

    expect(screen.getByRole('status')).toHaveTextContent(
      'Weather heatmap unavailable: The weather service is not responding.',
    )
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  })
})

describe('before there is a plan', () => {
  it('shows nothing', () => {
    const { container } = setup({ data: undefined })

    expect(container).toBeEmptyDOMElement()
  })
})

describe('with a heatmap', () => {
  it('shows the controls and the slider', () => {
    setup()

    const panel = screen.getByRole('region', { name: 'Weather heatmap' })
    expect(within(panel).getByRole('radiogroup', { name: 'Heatmap metric' })).toBeInTheDocument()
    expect(within(panel).getByRole('slider', { name: 'Forecast hour' })).toBeInTheDocument()
    expect(within(panel).getByRole('checkbox', { name: 'Show' })).toBeChecked()
  })

  it('offers risk, wind, rain and snow, with risk selected', () => {
    setup()

    const options = screen.getAllByRole('radio')

    expect(options.map((option) => (option as HTMLInputElement).value)).toEqual([
      'risk',
      'wind',
      'rain',
      'snow',
    ])
    expect(screen.getByRole('radio', { name: 'Risk' })).toBeChecked()
  })

  it('gives the slider as many hours as the heatmap has', () => {
    setup({ data: makeHeatmapResponse(11) })

    expect(screen.getByRole('slider')).toHaveAttribute('max', '10')
  })

  it('switches the metric in the store and explains the scale', () => {
    const { store } = setup()
    expect(screen.getByText('Risk level 0 to 4; blank where risk is low')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'Wind' }))

    expect(store.getState().metric).toBe('wind')
    expect(screen.getByRole('radio', { name: 'Wind' })).toBeChecked()
    expect(screen.getByText('Wind, up to 55 mph')).toBeInTheDocument()
  })

  it.each([
    ['Rain', 'Rain, up to 1 in/hr'],
    ['Snow', 'Snow, up to 3 in/hr'],
  ])('explains the %s scale', (name, scale) => {
    setup()

    fireEvent.click(screen.getByRole('radio', { name }))

    expect(screen.getByText(scale)).toBeInTheDocument()
  })

  it('hides and shows the heatmap through the store', () => {
    const { store } = setup()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Show' }))
    expect(store.getState().visible).toBe(false)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Show' }))
    expect(store.getState().visible).toBe(true)
  })

  it('follows metric changes made elsewhere', () => {
    const { store } = setup()

    act(() => store.setMetric('snow'))

    expect(screen.getByRole('radio', { name: 'Snow' })).toBeChecked()
  })
})
