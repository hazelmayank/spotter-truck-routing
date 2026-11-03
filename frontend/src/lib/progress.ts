// The plan request has no real progress events, so the steps follow typical timings:
// geocoding about a second, routing most of the rest, weather last.
const STEPS = [
  { fromMs: 0, text: 'Finding places…' },
  { fromMs: 1_500, text: 'Finding routes…' },
  { fromMs: 8_000, text: 'Checking weather…' },
]

export function progressStep(elapsedMs: number): string {
  return STEPS.filter((step) => elapsedMs >= step.fromMs).at(-1)!.text
}
