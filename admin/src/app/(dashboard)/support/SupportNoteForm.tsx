'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { createSupportNote, type NoteState } from './actions'
import { Button } from '@/components/ui/Button'

const initialState: NoteState = { error: null, ok: false }

const selectStyle =
  'h-8 rounded-full border border-border-strong bg-surface px-3 text-sm text-text-primary'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Saving...' : 'Add note'}
    </Button>
  )
}

export function SupportNoteForm({ userId }: { userId: string }) {
  const [state, formAction] = useActionState(createSupportNote, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="userId" value={userId} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="note-body" className="text-sm font-medium text-text-primary">
          New internal note
        </label>
        <textarea
          id="note-body"
          name="body"
          rows={3}
          maxLength={4000}
          required
          className="rounded-[16px] border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary"
          placeholder="What happened, and what was done about it."
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="note-category" className="sr-only">
          Category
        </label>
        <select id="note-category" name="category" className={selectStyle} defaultValue="other">
          <option value="payment">Payment</option>
          <option value="refund">Refund</option>
          <option value="credits">Credits</option>
          <option value="check_failure">Check failure</option>
          <option value="account">Account</option>
          <option value="other">Other</option>
        </select>

        <label htmlFor="note-status" className="sr-only">
          Status
        </label>
        <select id="note-status" name="status" className={selectStyle} defaultValue="open">
          <option value="open">Open</option>
          <option value="waiting">Waiting</option>
          <option value="resolved">Resolved</option>
        </select>

        <Submit />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-error">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="text-sm text-success-deep">
          Note saved.
        </p>
      ) : null}
    </form>
  )
}
