import { type ReactNode } from 'react'
import { cn } from '@/utils/cn'

interface ContainerProps {
  children: ReactNode
  className?: string
}

export function Container({ children, className }: ContainerProps) {
  return (
    <div
      className={cn(
        'mx-auto w-full max-w-7xl px-[16px] sm:px-6 lg:max-w-[1200px] lg:px-[32px]',
        className,
      )}
    >
      {children}
    </div>
  )
}
