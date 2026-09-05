'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/server/auth'
import { serviceClient } from '@/server/supabase'
import { recordAdminAction } from '@/server/audit'
import type { SupportNoteCategory, SupportNoteStatus } from '@/types/db'

const CATEGORIES: readonly SupportNoteCategory[] = [
  'payment',
  'refund',
  'credits',
  'check_failure',
  'account',
  'other',
]
const STATUSES: readonly SupportNoteStatus[] = ['open', 'waiting', 'resolved']

export interface NoteState {
  error: string | null
  ok: boolean
}

export async function createSupportNote(
  _previous: NoteState,
  formData: FormData,
): Promise<NoteState> {
  // Authorisation is re-checked inside the action. A Server Action is a public
  // HTTP endpoint: it can be invoked directly, and the fact that the form that
  // normally calls it sits behind a gated page protects nothing.
  const { admin } = await requireAdmin()

  const userId = String(formData.get('userId') ?? '')
  const body = String(formData.get('body') ?? '').trim()
  const rawCategory = String(formData.get('category') ?? 'other')
  const rawStatus = String(formData.get('status') ?? 'open')

  if (!userId) return { error: 'Missing user.', ok: false }
  if (!body) return { error: 'Write a note before saving.', ok: false }
  if (body.length > 4000) return { error: 'Notes are limited to 4000 characters.', ok: false }

  // Values from a form are untrusted even from an admin: validate against the
  // allowed set rather than passing them to the database and relying on the
  // check constraint to produce a usable error.
  const category = (CATEGORIES as readonly string[]).includes(rawCategory)
    ? (rawCategory as SupportNoteCategory)
    : 'other'
  const status = (STATUSES as readonly string[]).includes(rawStatus)
    ? (rawStatus as SupportNoteStatus)
    : 'open'

  const outcome = await recordAdminAction(
    admin,
    {
      action: 'support_note.create',
      targetType: 'user',
      targetId: userId,
      reason: category,
      // The note body is intentionally not copied into the audit log. The log
      // records that a note was written and by whom; the note itself lives in
      // one place, so redacting or deleting it later does not leave a copy.
      after: { category, status, bodyLength: body.length },
    },
    async () => {
      const { error } = await serviceClient()
        .from('admin_support_notes')
        .insert({
          user_id: userId,
          admin_user_id: admin.user_id,
          body,
          category,
          status,
          related_check_id: null,
          related_batch_id: null,
          resolved_at: status === 'resolved' ? new Date().toISOString() : null,
        })
      if (error) throw new Error(error.message)
      return { created: true }
    },
  )

  if (!outcome.ok) return { error: outcome.error ?? 'Could not save the note.', ok: false }

  revalidatePath(`/users/${userId}`)
  revalidatePath('/support')
  return { error: null, ok: true }
}
