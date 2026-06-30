import { cn } from './utils'
import type { ButtonHTMLAttributes } from 'react'

interface ShimmerButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  shimmerColor?: string
  shimmerSize?: string
  borderRadius?: string
  shimmerDuration?: string
  background?: string
  className?: string
  children?: React.ReactNode
  as?: 'button' | 'a' | 'span'
  href?: string
  target?: string
  rel?: string
}

export default function ShimmerButton({
  shimmerColor = 'rgba(88,166,255,0.3)',
  shimmerSize = '3px',
  borderRadius = '100px',
  shimmerDuration = '3s',
  background = 'rgba(33,38,45,0.9)',
  className,
  children,
  as = 'button',
  href,
  target,
  rel,
  ...props
}: ShimmerButtonProps) {
  const Tag = as

  const classes = cn(
    'group relative inline-flex items-center justify-center overflow-hidden whitespace-nowrap border border-[var(--border)] px-6 py-3 text-sm font-semibold text-[var(--ink)] transition-all duration-300',
    'hover:shadow-[0_0_20px_rgba(88,166,255,0.15)]',
    className,
  )

  const content = (
    <>
      {/* Shimmer overlay */}
      <div
        className="absolute inset-0 overflow-hidden rounded-[inherit]"
        style={{ borderRadius }}
      >
        <div
          className="animate-shimmer absolute inset-0"
          style={{
            background: `linear-gradient(105deg, transparent 40%, ${shimmerColor} 45%, transparent 50%)`,
            backgroundSize: '200% 100%',
          }}
        />
      </div>
      {/* Border beam */}
      <div
        className="absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `conic-gradient(from 0deg at 50% 50%, transparent, ${shimmerColor}, transparent 50%)`,
          padding: shimmerSize,
          WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
        }}
      />
      <span className="relative z-10 flex items-center gap-2">{children}</span>
    </>
  )

  if (Tag === 'a') {
    return (
      <a href={href} target={target} rel={rel} className={classes} style={{ borderRadius, background }}>
        {content}
      </a>
    )
  }

  if (Tag === 'span') {
    return (
      <span className={classes} style={{ borderRadius, background }}>
        {content}
      </span>
    )
  }

  return (
    <button className={classes} style={{ borderRadius, background }} {...props}>
      {content}
    </button>
  )
}
