import { cn } from './utils'

interface OrbitingCirclesProps {
  className?: string
  children?: React.ReactNode
  reverse?: boolean
  duration?: number
  delay?: number
  radius?: number
  path?: boolean
}

export default function OrbitingCircles({
  className,
  children,
  reverse = false,
  duration = 20,
  delay = 0,
  radius = 80,
  path = true,
}: OrbitingCirclesProps) {
  return (
    <div className={cn('relative flex items-center justify-center', className)}>
      {path && (
        <div
          className="pointer-events-none absolute rounded-full border border-[var(--border)]"
          style={{
            width: radius * 2,
            height: radius * 2,
          }}
        />
      )}
      <div
        className="absolute flex items-center justify-center"
        style={{
          animation: `orbit ${duration}s linear infinite`,
          animationDelay: `${delay}s`,
          animationDirection: reverse ? 'reverse' : 'normal',
          width: radius * 2,
          height: radius * 2,
          transform: `rotate(0deg)`,
        }}
      >
        <div
          className="absolute"
          style={{
            left: '50%',
            top: '0%',
            transform: 'translate(-50%, -50%)',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
