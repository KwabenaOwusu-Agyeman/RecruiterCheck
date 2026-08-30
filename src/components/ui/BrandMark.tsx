import { cn } from '@/utils/cn'

/**
 * The app mark: outline figure, double ring, solid figure, cream on navy.
 * Inline SVG rather than an <img> to public/icons/logo.svg — it costs no
 * request, stays sharp at every size, and takes its colours from the
 * palette (fill-navy / the cream `background` token) instead of hardcoded
 * hexes, so a palette change carries here too.
 *
 * Kept in geometric sync with public/icons/logo.svg, which is the master
 * the favicon and PWA rasters are generated from. Change one, change both.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      className={cn('shrink-0', className)}
      aria-hidden="true"
      focusable="false"
    >
      <rect width="512" height="512" rx="112" className="fill-navy" />
      <g fill="none" strokeWidth="10" className="stroke-background">
        <circle cx="158" cy="202" r="28" />
        <rect x="127" y="246" width="62" height="94" rx="31" />
        <circle cx="258" cy="268" r="52" />
        <circle cx="258" cy="268" r="34" />
      </g>
      <g className="fill-background">
        <circle cx="356" cy="180" r="32" />
        <rect x="322" y="216" width="68" height="126" rx="34" />
      </g>
    </svg>
  )
}
