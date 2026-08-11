import { Button } from '@/components/ui/Button'
import { useAuthModal } from '@/features/auth/context/AuthModalContext'
import { useCheckCta } from '@/hooks/useCheckCta'
import { cn } from '@/utils/cn'

export function StickyMobileCta() {
  const { mode } = useAuthModal()
  const handleCheckCta = useCheckCta()
  const modalOpen = mode !== null

  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface px-4 pt-3 sm:hidden',
        'pb-[max(0.75rem,env(safe-area-inset-bottom))]',
        modalOpen && 'pointer-events-none opacity-0',
      )}
      aria-hidden={modalOpen}
    >
      <Button
        size="lg"
        className="h-12 w-full text-base"
        onClick={handleCheckCta}
        tabIndex={modalOpen ? -1 : undefined}
      >
        Check
      </Button>
    </div>
  )
}
