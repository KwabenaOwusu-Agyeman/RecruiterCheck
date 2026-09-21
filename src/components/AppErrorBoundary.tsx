import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

interface BoundaryProps {
  children: ReactNode
  // Changing this clears a caught error, so navigating to another page
  // recovers without a full reload.
  resetKey: string
}

interface BoundaryState {
  failed: boolean
}

/**
 * Without a boundary, a render error anywhere unmounts the whole tree and
 * leaves a blank page with no way forward. This catches it, says what to do,
 * and clears itself on navigation. It renders nothing of its own until
 * something fails, so prerendered markup and hydration are unchanged.
 */
class Boundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false }

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render error', error, info.componentStack)
  }

  componentDidUpdate(prev: BoundaryProps) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) {
      this.setState({ failed: false })
    }
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="mx-auto max-w-md text-center">
          <h1 className="font-display text-2xl text-text-primary sm:text-3xl">This page did not load properly</h1>
          <p className="mt-4 text-base leading-7 text-text-secondary">
            Reloading usually fixes it. If it keeps happening, email{' '}
            <a className="font-medium text-blue underline" href="mailto:support@myrecruitercheck.com">
              support@myrecruitercheck.com
            </a>{' '}
            and tell us which page you were on.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-12 items-center justify-center whitespace-nowrap rounded-[10px] border border-navy bg-navy px-6 text-base font-medium text-white transition-colors duration-150 hover:bg-navy/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2"
            >
              Reload page
            </button>
            <a
              href="/"
              className="inline-flex h-12 items-center justify-center whitespace-nowrap rounded-[10px] border border-border-strong bg-surface px-6 text-base font-medium text-text-primary transition-colors duration-150 hover:border-navy/40 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2"
            >
              Back to homepage
            </a>
          </div>
        </div>
      </main>
    )
  }
}

export function AppErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return <Boundary resetKey={pathname}>{children}</Boundary>
}
