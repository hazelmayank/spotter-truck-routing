import { useState, type ChangeEvent, type FormEvent } from 'react'
import {
  INTERVAL_OPTIONS,
  MAX_LOAD_LB,
  SAMPLE_TRIP,
  initialTripValues,
  toPlanRequest,
  validateTrip,
  type TripField,
  type TripValues,
} from '../lib/trip'
import type { FieldErrors, PlanRequest } from '../types'
import { Field } from './Field'

interface TripFormProps {
  isPending: boolean
  serverErrors?: FieldErrors
  onSubmit: (request: PlanRequest) => void
}

const INPUT_CLASS =
  'rounded border border-slate-300 px-2 py-1.5 text-sm aria-[invalid=true]:border-red-600'
const FIELDS: TripField[] = ['origin', 'destination', 'departure', 'load_lb', 'interval_miles']

export function TripForm({ isPending, serverErrors = {}, onSubmit }: TripFormProps) {
  const [values, setValues] = useState<TripValues>(() => initialTripValues())
  const [touched, setTouched] = useState<ReadonlySet<TripField>>(new Set())
  const [submitted, setSubmitted] = useState<TripValues | null>(null)
  const errors = validateTrip(values)

  // A server error describes the submitted value, so it goes away once the field is edited.
  const errorFor = (field: TripField) => {
    if (!touched.has(field)) return undefined
    const serverError = submitted?.[field] === values[field] ? serverErrors[field]?.[0] : undefined
    return errors[field] ?? serverError
  }

  const inputProps = (field: TripField) => ({
    id: field,
    name: field,
    value: values[field],
    className: INPUT_CLASS,
    'aria-invalid': errorFor(field) !== undefined,
    'aria-describedby': errorFor(field) ? `${field}-error` : undefined,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setValues({ ...values, [field]: event.target.value }),
    onBlur: () => setTouched(new Set(touched).add(field)),
  })

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    setTouched(new Set(FIELDS))
    if (Object.keys(errors).length > 0) return
    setSubmitted(values)
    onSubmit(toPlanRequest(values))
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
      <Field id="origin" label="Origin" error={errorFor('origin')}>
        <input {...inputProps('origin')} type="text" autoComplete="off" />
      </Field>
      <Field id="destination" label="Destination" error={errorFor('destination')}>
        <input {...inputProps('destination')} type="text" autoComplete="off" />
      </Field>
      <Field
        id="departure"
        label="Departure"
        hint="Your local time; it is sent to the server as UTC."
        error={errorFor('departure')}
      >
        <input {...inputProps('departure')} type="datetime-local" />
      </Field>
      <Field id="load_lb" label="Load weight (lb)" error={errorFor('load_lb')}>
        <input {...inputProps('load_lb')} type="number" min={1} max={MAX_LOAD_LB} step={1} />
      </Field>
      <Field id="interval_miles" label="Checkpoint interval" error={errorFor('interval_miles')}>
        <select {...inputProps('interval_miles')}>
          {INTERVAL_OPTIONS.map((miles) => (
            <option key={miles} value={miles}>
              Every {miles} miles
            </option>
          ))}
        </select>
      </Field>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {isPending ? 'Planning…' : 'Plan routes'}
        </button>
        <button
          type="button"
          onClick={() => setValues({ ...values, ...SAMPLE_TRIP })}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        >
          Use sample trip
        </button>
      </div>
    </form>
  )
}
