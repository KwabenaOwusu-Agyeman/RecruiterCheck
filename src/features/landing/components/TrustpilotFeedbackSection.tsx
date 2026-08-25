import { useEffect, useRef } from 'react'

const WIDGET_HTML =
  '<a href="https://www.trustpilot.com/review/myrecruitercheck.com" target="_blank" rel="noopener">Trustpilot</a>'

/**
 * Renders the exact official Trustpilot TrustBox "Review Collector" embed
 * supplied via the verified MyRecruiterCheck Trustpilot Business account —
 * markup, businessunit-id, template-id, and token are copied verbatim, per
 * Trustpilot's own instructions. This is an invite-to-review module, not a
 * rating display — it carries its own call to action, so no separate
 * "Review us" button is added alongside it.
 *
 * The widget's inner content is injected imperatively in an effect, after
 * hydration, rather than rendered as JSX. Rendering it as JSX meant React
 * hydrated a div whose contents the bootstrap script
 * (widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js, loaded in
 * index.html's <head>) could mutate before or during that same hydration
 * pass, since it scans the page for `.trustpilot-widget` and swaps in an
 * iframe as soon as it loads — a race that surfaced as React hydration
 * errors #418/#423 in production. Keeping the div empty for both the
 * server-rendered and first client render means there's nothing for React
 * to mismatch on; only after hydration completes does this effect fill it
 * in and explicitly initialize this one element via the bootstrap script's
 * own `Trustpilot.loadFromElement` API (documented for exactly this
 * dynamically-inserted-widget case), so initialization no longer depends on
 * winning a timing race with the bootstrap script's own automatic scan.
 */
export function TrustpilotFeedbackSection() {
  const widgetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = widgetRef.current
    if (!el) return
    el.innerHTML = WIDGET_HTML
    const trustpilot = (window as unknown as { Trustpilot?: { loadFromElement?: (el: Element, force?: boolean) => void } }).Trustpilot
    trustpilot?.loadFromElement?.(el, true)
  }, [])

  return (
    <section className="border-b border-border bg-surface">
      <div className="mx-auto w-full max-w-7xl px-[16px] py-[28px] sm:px-6 sm:py-[36px] lg:max-w-[1200px] lg:px-[32px] lg:py-[40px]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
          <div className="max-w-md">
            <h2 className="font-display text-xl font-semibold tracking-tight text-navy sm:text-2xl">
              Help us improve MyRecruiterCheck
            </h2>
            <p className="mt-2 text-sm text-text-secondary sm:text-base">
              Your feedback helps us build a better experience for job seekers.
            </p>
          </div>

          <div className="w-full lg:w-[360px] lg:shrink-0">
            {/* TrustBox widget - Review Collector. Content injected post-hydration; see comment above. */}
            <div
              ref={widgetRef}
              className="trustpilot-widget"
              data-locale="en-US"
              data-template-id="56278e9abfbbba0bdcd568bc"
              data-businessunit-id="6a8d80000fa83ca390531a17"
              data-style-height="52px"
              data-style-width="100%"
              data-token="b5ee398d-cc69-468d-a988-9870d31d5297"
            />
            {/* End TrustBox widget */}
          </div>
        </div>
      </div>
    </section>
  )
}
