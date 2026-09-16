'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/cn'

// Only routes that exist are listed. A nav full of dead links that render
// "coming soon" tells the operator less than a nav that is honest about what
// the tool currently does.
const SECTIONS: { title: string; items: { href: string; label: string; ownerOnly?: boolean }[] }[] = [
  {
    title: 'Daily',
    items: [{ href: '/', label: 'Overview' }],
  },
  {
    title: 'Marketing',
    items: [
      { href: '/acquisition', label: 'Acquisition' },
      { href: '/content', label: 'Content' },
      { href: '/audience', label: 'Audience' },
      { href: '/email', label: 'Email' },
    ],
  },
  {
    title: 'Customers',
    items: [
      { href: '/users', label: 'Users' },
      { href: '/checks', label: 'Application Checks' },
      { href: '/reports', label: 'Reports', ownerOnly: true },
      { href: '/support', label: 'Support' },
    ],
  },
  {
    title: 'Business',
    items: [
      { href: '/payments', label: 'Payments' },
      { href: '/refunds', label: 'Refunds' },
      { href: '/credits', label: 'Credits' },
    ],
  },
  {
    title: 'Operations',
    items: [{ href: '/audit', label: 'Admin Audit Log' }],
  },
]

export function Nav({
  publicSiteUrl,
  showReports,
}: {
  publicSiteUrl: string
  /** Mirrors canViewReports(): the Reports page is owner only. */
  showReports: boolean
}) {
  const pathname = usePathname()

  // A report lives at /checks/[id]/report but belongs to Reports in the nav.
  const isReport = /^\/checks\/[^/]+\/report$/.test(pathname)
  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    if (isReport) return href === '/reports'
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  return (
    <nav aria-label="Dashboard sections" className="flex h-full flex-col gap-6 p-4">
      {SECTIONS.map((section) => (
        <div key={section.title}>
          <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-text-caption">
            {section.title}
          </p>
          <ul className="flex flex-col gap-0.5">
            {section.items.filter((item) => !item.ownerOnly || showReports).map((item) => {
              const active = isActive(item.href)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'block rounded-full px-3 py-2 text-sm transition-colors',
                      active
                        ? 'bg-navy font-medium text-white'
                        : 'text-text-secondary hover:bg-border-soft hover:text-text-primary',
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      <div className="mt-auto border-t border-border pt-4">
        <a
          href={publicSiteUrl}
          className="block rounded-full px-3 py-2 text-sm text-text-secondary hover:bg-border-soft hover:text-text-primary"
        >
          Back to MyRecruiterCheck
        </a>
      </div>
    </nav>
  )
}
