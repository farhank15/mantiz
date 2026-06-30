import { cn } from './utils'

interface MarqueeProps {
  className?: string
  reverse?: boolean
  pauseOnHover?: boolean
  children?: React.ReactNode
  vertical?: boolean
  repeat?: number
}

export default function Marquee({
  className,
  reverse = false,
  pauseOnHover = false,
  children,
  vertical = false,
  repeat = 4,
}: MarqueeProps) {
  return (
    <div
      className={cn(
        'group flex overflow-hidden p-2 [gap:var(--gap,1rem)]',
        {
          'flex-col': vertical,
          'flex-row': !vertical,
        },
        className,
      )}
      style={{
        maskImage:
          'linear-gradient(to right, transparent, black 5%, black 95%, transparent)',
        WebkitMaskImage:
          'linear-gradient(to right, transparent, black 5%, black 95%, transparent)',
      }}
    >
      {Array(repeat)
        .fill(0)
        .map((_, i) => (
          <div
            key={i}
            className={cn(
              'flex shrink-0 justify-around [gap:var(--gap,1rem)]',
              {
                'animate-marquee flex-row': !vertical,
                'animate-marquee-vertical flex-col': vertical,
                'group-hover:[animation-play-state:paused]': pauseOnHover,
                '[animation-direction:reverse]': reverse,
              },
            )}
          >
            {children}
          </div>
        ))}
    </div>
  )
}
