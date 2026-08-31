import { type ReactNode, useEffect } from 'react'
import { Button } from '@/components/ui/Button'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: ReactNode
  confirmLabel: string
  confirmingLabel?: string
  cancelLabel?: string
  busy?: boolean
  destructive?: boolean
  /** Optional form content rendered between the description and the buttons. */
  children?: ReactNode
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  confirmingLabel,
  cancelLabel = 'Cancel',
  busy = false,
  destructive = true,
  children,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onCancel()
    }

    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [open, busy, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-[#05050D]/50 p-0 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[20px] border border-border-soft bg-surface p-5 shadow-elevated sm:max-h-[85dvh] sm:max-w-md sm:rounded-[20px] sm:p-6"
      >
        <h2 id="confirm-dialog-title" className="text-base font-semibold text-text-primary">
          {title}
        </h2>
        <div className="mt-2 text-sm text-text-secondary">{description}</div>
        {children ? <div className="mt-5">{children}</div> : null}
        {/* Stacked and full width on a phone so neither button is a thumb
            stretch; side by side from sm up. Confirm sits first in the DOM on
            mobile via order utilities so the primary action is nearest the
            thumb without changing focus order for keyboard users. */}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full sm:w-auto"
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            className="w-full sm:w-auto"
            disabled={busy}
            onClick={onConfirm}
            variant={destructive ? 'danger' : 'primary'}
          >
            {busy ? (confirmingLabel ?? confirmLabel) : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
