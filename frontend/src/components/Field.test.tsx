import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Field } from './Field'

function setup(props: { hint?: string; error?: string } = {}) {
  render(
    <Field id="origin" label="Origin" {...props}>
      <input id="origin" />
    </Field>,
  )
}

describe('Field', () => {
  it('labels its input', () => {
    setup()

    expect(screen.getByLabelText('Origin')).toBeInTheDocument()
  })

  it('shows the hint when there is no error', () => {
    setup({ hint: 'City and state' })

    expect(screen.getByText('City and state')).toBeInTheDocument()
  })

  it('shows the error as an alert and hides the hint', () => {
    setup({ hint: 'City and state', error: 'Enter a place.' })

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a place.')
    expect(screen.queryByText('City and state')).not.toBeInTheDocument()
  })
})
