import { type ElementType, type ReactNode, type RefObject, useMemo } from 'react'
import { motion, useInView, type Variants } from 'motion/react'

interface TimelineContentProps {
  as?: ElementType
  animationNum: number
  timelineRef: RefObject<HTMLElement>
  customVariants: Variants
  className?: string
  children: ReactNode
}

// Scroll-reveal wrapper: elements fade/slide in once `timelineRef` enters the
// viewport, staggered by `animationNum` (consumed inside `customVariants`).
export function TimelineContent({
  as = 'div',
  animationNum,
  timelineRef,
  customVariants,
  className,
  children,
}: TimelineContentProps) {
  const isInView = useInView(timelineRef, { once: true, amount: 0.2 })
  const MotionComponent = useMemo(() => motion.create(as), [as])

  return (
    <MotionComponent
      custom={animationNum}
      variants={customVariants}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      className={className}
    >
      {children}
    </MotionComponent>
  )
}
