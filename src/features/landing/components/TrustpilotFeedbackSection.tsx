/**
 * Renders the exact official Trustpilot TrustBox "Review Collector" embed
 * supplied via the verified MyRecruiterCheck Trustpilot Business account —
 * markup, businessunit-id, template-id, and token are copied verbatim, per
 * Trustpilot's own instructions. The bootstrap script
 * (widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js, loaded in
 * index.html's <head>) scans the page for `.trustpilot-widget` on load and
 * replaces this div's content with the real widget, so nothing here should
 * be altered or treated as static content. This is an invite-to-review
 * module, not a rating display — it carries its own call to action, so no
 * separate "Review us" button is added alongside it.
 */
export function TrustpilotFeedbackSection() {
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
            {/* TrustBox widget - Review Collector. Do not modify. */}
            <div
              className="trustpilot-widget"
              data-locale="en-US"
              data-template-id="56278e9abfbbba0bdcd568bc"
              data-businessunit-id="6a8d80000fa83ca390531a17"
              data-style-height="52px"
              data-style-width="100%"
              data-token="b5ee398d-cc69-468d-a988-9870d31d5297"
            >
              <a href="https://www.trustpilot.com/review/myrecruitercheck.com" target="_blank" rel="noopener">
                Trustpilot
              </a>
            </div>
            {/* End TrustBox widget */}
          </div>
        </div>
      </div>
    </section>
  )
}
