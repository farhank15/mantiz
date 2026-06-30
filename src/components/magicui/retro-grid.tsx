import { cn } from './utils'

interface DotPatternProps {
  className?: string
  glow?: boolean
}

export default function RetroGrid({ className, glow = true }: DotPatternProps) {
  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      {/* Grid pattern */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)
          `,
          backgroundSize: '28px 28px',
        }}
      />

      {/* Subtle horizontal line glow */}
      {glow && (
        <>
          <div
            className="absolute left-1/2 top-1/3 h-px w-full -translate-x-1/2"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(88,166,255,0.08), rgba(238,49,36,0.08), transparent)',
              filter: 'blur(2px)',
            }}
          />
          <div
            className="absolute left-1/2 top-2/3 h-px w-3/4 -translate-x-1/2"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(238,49,36,0.06), transparent)',
              filter: 'blur(1px)',
            }}
          />
        </>
      )}
    </div>
  )
}
