import { REFUND_REASONS, type RefundReason } from '@/lib/constants'

interface RefundReasonPickerProps {
  reason: RefundReason | null
  detail: string
  disabled?: boolean
  onReasonChange: (reason: RefundReason | null) => void
  onDetailChange: (detail: string) => void
}

export const REFUND_DETAIL_MAX = 500

/**
 * Optional reason capture on the refund dialog.
 *
 * Deliberately optional, and labelled as such. A refund of an unused pack
 * inside the guarantee window is the customer's to take; making them justify
 * it would be friction on something they are entitled to, and for a statutory
 * withdrawal it would not be enforceable either. Nothing here gates the
 * confirm button.
 */
export function RefundReasonPicker({
  reason,
  detail,
  disabled = false,
  onReasonChange,
  onDetailChange,
}: RefundReasonPickerProps) {
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="text-sm font-medium text-text-primary">
        Why are you refunding?{' '}
        <span className="font-normal text-text-caption">Optional</span>
      </legend>

      <div className="mt-3 space-y-2">
        {REFUND_REASONS.map((option) => {
          const selected = reason === option.id
          return (
            <label
              key={option.id}
              className={[
                'flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm transition',
                selected
                  ? 'border-blue bg-navy-tint text-text-primary'
                  : 'border-border-soft bg-surface text-text-secondary hover:border-border-strong',
                disabled ? 'cursor-not-allowed opacity-60' : '',
              ].join(' ')}
            >
              <input
                type="radio"
                name="refund-reason"
                value={option.id}
                checked={selected}
                onChange={() => onReasonChange(option.id)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-blue"
              />
              <span className="min-w-0">{option.label}</span>
            </label>
          )
        })}
      </div>

      {reason === 'something_else' ? (
        <div className="mt-3">
          <label htmlFor="refund-detail" className="sr-only">
            Tell us more
          </label>
          <textarea
            id="refund-detail"
            rows={3}
            maxLength={REFUND_DETAIL_MAX}
            value={detail}
            onChange={(event) => onDetailChange(event.target.value)}
            placeholder="Tell us what happened, if you would like to."
            className="w-full resize-y rounded-xl border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-caption focus:border-blue focus:outline-none focus:ring-2 focus:ring-blue/30"
          />
          <p className="mt-1 text-right text-xs text-text-caption">
            {detail.length} of {REFUND_DETAIL_MAX}
          </p>
        </div>
      ) : null}

      {reason ? (
        <button
          type="button"
          className="mt-3 text-xs font-medium text-text-caption underline hover:text-text-secondary"
          onClick={() => {
            onReasonChange(null)
            onDetailChange('')
          }}
        >
          Clear
        </button>
      ) : null}
    </fieldset>
  )
}
