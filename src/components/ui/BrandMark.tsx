import { cn } from '@/utils/cn'

/**
 * The mark: outline figure, double ring, solid figure, navy on the app's
 * cream ground. One treatment everywhere — the header lockup here and the
 * icon files in public/icons are the same artwork in the same colours, so
 * the tab, the home screen and the page all show one logo rather than a
 * lockup and a recoloured icon variant.
 *
 * The header draws it bare (no ground of its own) because the page already
 * supplies the cream; the icon files paint the cream themselves, since a
 * tab or launcher tile has no ground to inherit.
 *
 * Inline SVG rather than an <img> to public/icons/logo.svg: no request, it
 * stays sharp at any size, and the colour comes from the palette
 * (stroke-navy / fill-navy) instead of a hardcoded hex.
 *
 * The viewBox is cropped tight to the artwork (the 512 master's mark spans
 * x 122-390, y 148-347) so the glyph aligns to the wordmark's cap height
 * instead of floating inside the master's padding — which is also what
 * lets it sit as close to the name as the reference does.
 *
 * Kept in geometric sync with public/icons/logo.svg, the master the raster
 * icons are generated from. Change one, change both.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="117 143 278 209"
      className={cn('shrink-0', className)}
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" strokeWidth="10" className="stroke-navy">
        <circle cx="158" cy="202" r="28" />
        <rect x="127" y="246" width="62" height="94" rx="31" />
        <circle cx="258" cy="268" r="52" />
        <circle cx="258" cy="268" r="34" />
      </g>
      <g className="fill-navy">
        <circle cx="356" cy="180" r="32" />
        <rect x="322" y="216" width="68" height="126" rx="34" />
      </g>
    </svg>
  )
}
