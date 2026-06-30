import { cn } from './utils'

interface AnimatedGradientTextProps {
  children: React.ReactNode
  className?: string
}

export default function AnimatedGradientText({
  children,
  className,
}: AnimatedGradientTextProps) {
  return (
    <span
      className={cn(
        'animate-gradient-text bg-[length:200%_auto] bg-clip-text text-transparent',
        'bg-gradient-to-r from-[var(--severity-critical)] via-[var(--severity-high)] to-[var(--severity-critical)]',
        className,
      )}
    >
      {children}
    </span>
  )
}
