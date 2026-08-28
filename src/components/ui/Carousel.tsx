import { createContext, useContext, type HTMLAttributes, type ReactNode } from 'react'
import useEmblaCarousel from 'embla-carousel-react'
import { cn } from '@/utils/cn'

// Minimal Embla wrapper, adapted from the shadcn carousel primitive. Three
// deliberate differences from that original:
//
//  1. No "use client" — this is a Vite/React Router app, not Next.js.
//  2. `@/utils/cn`, this repo's helper, not shadcn's `@/lib/utils`.
//  3. No CarouselPrevious/CarouselNext. Nothing here needs arrows, and
//     dropping them avoids pulling in shadcn's Button, @radix-ui/react-slot
//     and class-variance-authority for buttons that would never render.
//
// Horizontal only, for the same reason: the vertical axis is unused, so the
// orientation branch would be untested code.

type UseCarouselParameters = Parameters<typeof useEmblaCarousel>
type CarouselOptions = UseCarouselParameters[0]
type CarouselPlugin = UseCarouselParameters[1]

interface CarouselContextValue {
  carouselRef: ReturnType<typeof useEmblaCarousel>[0]
}

const CarouselContext = createContext<CarouselContextValue | null>(null)

function useCarousel(): CarouselContextValue {
  const context = useContext(CarouselContext)
  if (!context) throw new Error('useCarousel must be used within a <Carousel />')
  return context
}

interface CarouselProps extends HTMLAttributes<HTMLDivElement> {
  opts?: CarouselOptions
  plugins?: CarouselPlugin
  children: ReactNode
}

export function Carousel({ opts, plugins, className, children, ...props }: CarouselProps) {
  const [carouselRef] = useEmblaCarousel({ ...opts, axis: 'x' }, plugins)

  return (
    <CarouselContext.Provider value={{ carouselRef }}>
      <div className={cn('relative', className)} role="region" aria-roledescription="carousel" {...props}>
        {children}
      </div>
    </CarouselContext.Provider>
  )
}

export function CarouselContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const { carouselRef } = useCarousel()

  return (
    <div ref={carouselRef} className="overflow-hidden">
      <div className={cn('flex', className)} {...props} />
    </div>
  )
}

export function CarouselItem({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="group"
      aria-roledescription="slide"
      className={cn('min-w-0 shrink-0 grow-0', className)}
      {...props}
    />
  )
}
