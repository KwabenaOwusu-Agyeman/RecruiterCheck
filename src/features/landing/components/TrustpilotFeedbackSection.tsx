import { useEffect, useRef } from 'react'

const WIDGET_HTML =
  '<a href="https://www.trustpilot.com/review/myrecruitercheck.com" target="_blank" rel="noopener">Trustpilot</a>'

const BOOTSTRAP_SRC = '//widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js'

type TrustpilotGlobal = { loadFromElement?: (el: Element, force?: boolean) => void }

function getTrustpilotGlobal(): TrustpilotGlobal | undefined {
  return (window as unknown as { Trustpilot?: TrustpilotGlobal }).Trustpilot
}

/**
 * Renders the exact official Trustpilot TrustBox "Review Collector" embed
 * supplied via the verified MyRecruiterCheck Trustpilot Business account —
 * markup, businessunit-id, template-id, and token are copied verbatim, per
 * Trustpilot's own instructions. This is an invite-to-review module, not a
 * rating display — it carries its own call to action, so no separate
 * "Review us" button is added alongside it.
 *
 * The bootstrap script (widget.trustpilot.com/bootstrap/v5/...) is loaded
 * dynamically here, from this effect, rather than as a static <script> in
 * index.html's <head>. Loading it statically meant it could start
 * executing and mutating the page before or during React's hydration pass
 * (hydrateRoot, see main.tsx) — confirmed live: production showed React
 * hydration errors #418/#423 on every load, and isolating the cause (built
 * and served the same bundle with only that <head> script removed) showed
 * the errors are entirely gone without it, unrelated to how this
 * component's own div is rendered. Fetching and initializing the widget
 * only from this post-hydration effect removes the race entirely — the
 * script cannot touch the DOM before hydration has already finished. Init
 * happens through Trustpilot's own `loadFromElement` API (documented for
 * exactly this dynamically-inserted-widget case) once the script has
 * loaded, and the script itself is only ever fetched once (guarded via a
 * data attribute) even if this component were to appear more than once.
 */
export function TrustpilotFeedbackSection() {
  const widgetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = widgetRef.current
    if (!el) return
    el.innerHTML = WIDGET_HTML

    function init() {
      if (el) getTrustpilotGlobal()?.loadFromElement?.(el, true)
    }

    if (getTrustpilotGlobal()) {
      init()
      return
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-trustpilot-bootstrap]')
    if (existing) {
      existing.addEventListener('load', init, { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = BOOTSTRAP_SRC
    script.async = true
    script.dataset.trustpilotBootstrap = 'true'
    script.addEventListener('load', init, { once: true })
    document.body.appendChild(script)
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
