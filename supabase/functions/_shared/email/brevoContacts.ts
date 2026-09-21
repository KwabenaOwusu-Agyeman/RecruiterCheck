// Brevo contact-list operations, kept separate from brevoClient.ts because
// that file is strictly transactional sending and this is marketing-list
// management. Both talk to Brevo by direct fetch rather than an SDK, matching
// the one established way this codebase calls Brevo.

export interface BrevoContactResult {
  added: boolean
  /** Safe to log — never the API key or the contact's address. */
  reason?: string
}

/**
 * Adds (or updates) a contact and puts them in a list.
 *
 * Brevo returns 400 with code `duplicate_parameter` when the contact already
 * exists, which is a normal re-subscribe rather than a failure, so it is
 * treated as success and the list membership is applied separately.
 *
 * Never throws: the newsletter signup must still succeed for the subscriber
 * even if Brevo is unreachable, because the durable consent record is the row
 * in public.newsletter_subscribers, not the Brevo contact.
 */
export async function upsertBrevoContact(email: string, listId: number): Promise<BrevoContactResult> {
  const apiKey = Deno.env.get('BREVO_API_KEY')
  if (!apiKey) return { added: false, reason: 'BREVO_API_KEY not set' }

  const headers = {
    'api-key': apiKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email,
        listIds: [listId],
        updateEnabled: true,
      }),
    })

    if (response.ok) return { added: true }

    // An existing contact is not an error — make sure they are on the list.
    if (response.status === 400) {
      const patch = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
        method: 'PUT',
        headers,
        // Never clears a blacklist: Brevo sets it for hard bounces, spam
        // complaints and its own unsubscribe link, and this endpoint accepts
        // any address from anyone, so it must not be able to undo those.
        body: JSON.stringify({ listIds: [listId] }),
      })
      return patch.ok
        ? { added: true }
        : { added: false, reason: `Brevo list update responded ${patch.status}` }
    }

    return { added: false, reason: `Brevo responded ${response.status}` }
  } catch (error) {
    return { added: false, reason: `network error: ${error instanceof Error ? error.name : 'unknown'}` }
  }
}

/**
 * Takes a contact off a list, which is what the weekly campaign sends to.
 * The contact itself is kept, so transactional email (check results, sign
 * in) is unaffected.
 *
 * Never throws. A contact Brevo does not know is already off the list, so a
 * 404 counts as done.
 */
export async function removeBrevoContactFromList(email: string, listId: number): Promise<BrevoContactResult> {
  const apiKey = Deno.env.get('BREVO_API_KEY')
  if (!apiKey) return { added: false, reason: 'BREVO_API_KEY not set' }

  try {
    const response = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
      method: 'PUT',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ unlinkListIds: [listId] }),
    })
    if (response.ok || response.status === 404) return { added: true }
    return { added: false, reason: `Brevo list removal responded ${response.status}` }
  } catch (error) {
    return { added: false, reason: `network error: ${error instanceof Error ? error.name : 'unknown'}` }
  }
}
