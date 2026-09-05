import { requireAdmin } from '@/server/auth'
import { env } from '@/server/env'
import { signOutAction } from '../actions'
import { Nav } from './nav'
import { Button } from '@/components/ui/Button'

// Every page under this layout is gated here AND again in its own body.
// A layout is not a security boundary on its own: Next can render a page
// without re-running a parent layout on some navigations, so each page calls
// requireAdmin() too. Belt and braces, deliberately.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { admin } = await requireAdmin()

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="shrink-0 border-b border-border bg-surface lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-5 py-4 lg:block">
          <div>
            <p className="font-display text-lg font-semibold leading-tight text-navy">
              MyRecruiterCheck
            </p>
            <p className="text-xs text-text-caption">Control Centre</p>
          </div>
        </div>
        <Nav publicSiteUrl={env.publicSiteUrl} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-5 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text-primary">{admin.email}</p>
            <p className="text-xs text-text-caption">
              {admin.role} · times shown in {admin.timezone}
            </p>
          </div>
          <form action={signOutAction}>
            <Button type="submit" variant="secondary" size="sm">
              Sign out
            </Button>
          </form>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  )
}
