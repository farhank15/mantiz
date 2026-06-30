import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { cn } from './utils'

interface TextRevealProps {
  text: string
  className?: string
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'span'
  once?: boolean
}

export default function TextReveal({
  text,
  className,
  as: Tag = 'p',
  once = true,
}: TextRevealProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once, margin: '-100px' })

  const words = text.split(' ')

  return (
    <div ref={ref} className={cn('overflow-hidden', className)}>
      <Tag className="inline">
        {words.map((word, i) => (
          <span key={i} className="inline-block">
            <motion.span
              className="inline-block"
              initial={{ y: '100%', opacity: 0 }}
              animate={isInView ? { y: 0, opacity: 1 } : { y: '100%', opacity: 0 }}
              transition={{
                duration: 0.5,
                delay: i * 0.05,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              {word}
            </motion.span>
            {i < words.length - 1 && '\u00A0'}
          </span>
        ))}
      </Tag>
    </div>
  )
}
