import { useEffect, useRef } from 'react'
import { useInView, useMotionValue, useSpring } from 'framer-motion'
import { cn } from './utils'

interface NumberTickerProps {
  value: number
  direction?: 'up' | 'down'
  className?: string
  delay?: number
  suffix?: string
}

export default function NumberTicker({
  value,
  direction = 'up',
  className,
  delay = 0,
  suffix = '',
}: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const motionValue = useMotionValue(direction === 'down' ? value : 0)
  const springValue = useSpring(motionValue, {
    damping: 60,
    stiffness: 100,
  })
  const isInView = useInView(ref, { once: true, margin: '0px' })

  useEffect(() => {
    if (isInView) {
      const timer = setTimeout(() => {
        motionValue.set(direction === 'down' ? 0 : value)
      }, delay * 1000)
      return () => clearTimeout(timer)
    }
  }, [motionValue, isInView, delay, value, direction])

  useEffect(() => {
    const unsubscribe = springValue.on('change', (latest) => {
      if (ref.current) {
        ref.current.textContent = `${Intl.NumberFormat('en-US').format(
          Math.round(latest),
        )}${suffix}`
      }
    })
    return unsubscribe
  }, [springValue, suffix])

  return (
    <span
      ref={ref}
      className={cn('inline-block tabular-nums tracking-tight', className)}
    >
      0{suffix}
    </span>
  )
}
