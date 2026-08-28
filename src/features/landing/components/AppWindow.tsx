import { type ReactNode } from 'react'

/**
 * The "product screenshot" treatment, built in code: browser chrome around
 * real markup instead of a bitmap. Code-built imagery is the house style
 * here out of necessity as much as taste — the CSP's img-src allows only
 * self-hosted images and style-src has no inline allowance, so the way to a
 * produced look is compiled markup, and it stays crisp on every display and
 * theme for free. Same chrome pattern as DashboardShowcase's BrowserChrome,
 * without the glow wrapper and fixed panel height that one needs.
 */
export function AppWindow({ urlLabel, children }: { urlLabel: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[20px] border border-border-soft bg-surface shadow-elevated">
      <div className="flex items-center gap-2 border-b border-border-soft bg-background px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-border-strong" aria-hidden="true" />
        <span className="h-2.5 w-2.5 rounded-full bg-border-strong" aria-hidden="true" />
        <span className="h-2.5 w-2.5 rounded-full bg-border-strong" aria-hidden="true" />
        <span className="ml-3 truncate rounded-full bg-surface px-3 py-1 text-xs text-text-secondary">
          {urlLabel}
        </span>
      </div>
      {children}
    </div>
  )
}
