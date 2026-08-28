// Candidate file for src/hooks/useKeywordScanIdempotency.ts
// Item C: polling by idempotency key (preferred, survives a lost initial
// HTTP response); never renews any server-side lease (poll_keyword_scan_status
// is a pure read); already_processing is non-terminal and never creates a
// new key; released/result_expired are terminal.

const STORAGE_PREFIX = 'mrc:keyword-scan-attempt:'

interface StoredAttempt {
  idempotencyKey: string
  createdAt: number
}

function storageKey(userId: string, routeOrComponentId: string): string {
  return `${STORAGE_PREFIX}${userId}:${routeOrComponentId}`
}

export function useKeywordScanIdempotency(
  userId: string,
  routeOrComponentId: string,
) {
  const key = storageKey(userId, routeOrComponentId)

  function getOrCreateKey(): string {
    const existingRaw = sessionStorage.getItem(key)
    if (existingRaw) {
      try {
        const existing: StoredAttempt = JSON.parse(existingRaw)
        if (existing.idempotencyKey) return existing.idempotencyKey
      } catch {
        // corrupted entry -- fall through
      }
    }
    const fresh: StoredAttempt = {
      idempotencyKey: crypto.randomUUID(),
      createdAt: Date.now(),
    }
    sessionStorage.setItem(key, JSON.stringify(fresh)) // never CV/JD/result content, only the key
    return fresh.idempotencyKey
  }

  function clearOnTerminalOutcome() {
    sessionStorage.removeItem(key)
  }

  function isTerminal(outcome: string): boolean {
    // already_processing and reserved are the only non-terminal outcomes.
    return outcome !== 'already_processing' && outcome !== 'reserved'
  }

  /**
   * Bounded polling against poll_keyword_scan_status (by idempotency key),
   * never against the keyword-scan edge function itself -- so polling never
   * re-parses files, re-fetches a URL, re-checks the new-scan rate limit,
   * or calls OpenAI, and never renews any server-side lease.
   */
  async function pollUntilSettled(
    idempotencyKey: string,
    poll: (
      key: string,
    ) => Promise<{ outcome: string; cached_result?: unknown }>,
    { maxAttempts = 8, baseDelayMs = 2000, maxDelayMs = 10000 } = {},
  ) {
    let attempt = 0
    while (attempt < maxAttempts) {
      const result = await poll(idempotencyKey)
      if (result.outcome !== 'already_processing') {
        if (isTerminal(result.outcome)) clearOnTerminalOutcome()
        return result
      }
      const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs)
      await new Promise((r) => setTimeout(r, delay))
      attempt += 1
    }
    return { outcome: 'timed_out' }
  }

  return {
    getOrCreateKey,
    clearOnTerminalOutcome,
    isTerminal,
    pollUntilSettled,
  }
}
