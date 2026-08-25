import { motion } from 'motion/react'
import { type ReactNode } from 'react'

interface RevealProps {
  children: ReactNode
  className?: string
  delay?: number
}

/**
 * Fades and slides a section up into place the first time it scrolls into
 * view, the same "content arrives as you scroll" feel monday.com's landing
 * page uses throughout. `viewport={{ once: true, margin: '-80px' }}` fires
 * the animation slightly before the element is fully on screen and never
 * re-triggers on scroll-back, so it reads as a one-time reveal, not a
 * distracting repeat effect.
 */
export function Reveal({ children, className, delay = 0 }: RevealProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.5, ease: 'easeOut', delay }}
    >
      {children}
    </motion.div>
  )
}
