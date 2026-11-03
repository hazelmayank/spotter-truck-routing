import { useEffect, useState } from 'react'

/** `value`, but updated at most once per animation frame however often it changes. */
export function useAnimationFrameValue<T>(value: T): T {
  const [frameValue, setFrameValue] = useState(value)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setFrameValue(value))
    return () => cancelAnimationFrame(frame)
  }, [value])

  return frameValue
}
