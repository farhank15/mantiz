import { useEffect, useState } from 'react'
import { cn } from './utils'

interface MeteorsProps {
  number?: number
  minDelay?: number
  maxDelay?: number
  minDuration?: number
  maxDuration?: number
  angle?: number
  className?: string
}

export default function Meteors({
  number = 20,
  minDelay = 0.2,
  maxDelay = 1.2,
  minDuration = 2,
  maxDuration = 10,
  angle = 215,
  className,
}: MeteorsProps) {
  const [meteorStyles, setMeteorStyles] = useState<React.CSSProperties[]>([])

  useEffect(() => {
    const styles = [...new Array(number)].map(() => ({
      top: '-5%',
      left: `calc(0% + ${Math.floor(Math.random() * window.innerWidth)}px)`,
      animationDelay: `${Math.random() * (maxDelay - minDelay) + minDelay}s`,
      animationDuration: `${Math.floor(Math.random() * (maxDuration - minDuration) + minDuration)}s`,
    }))
    setMeteorStyles(styles)
  }, [number, minDelay, maxDelay, minDuration, maxDuration])

  return (
    <>
      {meteorStyles.map((style, idx) => (
        <span
          key={idx}
          style={{ ...style, '--angle': `${-angle}deg` } as React.CSSProperties}
          className={cn(
            'pointer-events-none absolute size-0.5 rounded-full',
            'animate-meteor',
            'bg-[var(--interactive)]',
            'shadow-[0_0_0_1px_rgba(88,166,255,0.1)]',
            className,
          )}
        >
          <div className="pointer-events-none absolute top-1/2 -z-10 h-px w-12 -translate-y-1/2 bg-gradient-to-r from-[var(--interactive)] to-transparent opacity-50" />
        </span>
      ))}
    </>
  )
}
