import { useEffect, useRef, useState } from 'react'

export function useThrottled<T>(value: T, delay: number): T {
  const [throttled, setThrottled] = useState(value)
  const lastUpdate = useRef<number>(0)

  useEffect(() => {
    const now = Date.now()
    const elapsed = now - lastUpdate.current

    if (elapsed >= delay) {
      setThrottled(value)
      lastUpdate.current = now
    } else {
      const timer = setTimeout(() => {
        setThrottled(value)
        lastUpdate.current = Date.now()
      }, delay - elapsed)
      return () => clearTimeout(timer)
    }
  }, [value, delay])

  return throttled
}
