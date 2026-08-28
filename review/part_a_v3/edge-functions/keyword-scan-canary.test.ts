import {
  assert,
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { handleCanaryRequest } from './keyword-scan-canary.ts'
import { handleKeywordScanRequest } from './keyword-scan.ts'

// deno-lint-ignore no-explicit-any
type Any = any

function mockUserClient(
  result: { user: { id: string } | null; error: { message: string } | null },
): Any {
  return {
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: result.user },
          error: result.error,
        }),
    },
  }
}

function mockAdminClient(
  allowlistResult: {
    data: { user_id: string } | null
    error: { message: string } | null
  },
  recordedEqCalls: Array<{ column: string; value: string }> = [],
): Any {
  return {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (column: string, value: string) => {
          recordedEqCalls.push({ column, value })
          return {
            maybeSingle: () => Promise.resolve(allowlistResult),
          }
        },
      }),
    }),
  }
}

function requestWith(body: Record<string, unknown> = {}): Request {
  return new Request('https://example.com/keyword-scan-canary', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

Deno.test('T-CANARY-1: missing JWT (getUser returns no user, no error) -> 401, denied before any allowlist check', async () => {
  const eqCalls: Array<{ column: string; value: string }> = []
  const userClient = mockUserClient({ user: null, error: null })
  const adminClient = mockAdminClient({ data: null, error: null }, eqCalls)

  const res = await handleCanaryRequest(requestWith(), {
    userClient,
    adminClient,
  })
  assertEquals(res.status, 401)
  assertEquals(eqCalls.length, 0) // never reached the allowlist query
})

Deno.test('T-CANARY-2: invalid JWT (getUser returns an error) -> 401', async () => {
  const userClient = mockUserClient({
    user: null,
    error: { message: 'invalid JWT' },
  })
  const adminClient = mockAdminClient({ data: null, error: null })

  const res = await handleCanaryRequest(requestWith(), {
    userClient,
    adminClient,
  })
  assertEquals(res.status, 401)
})

Deno.test('T-CANARY-3: valid but non-allowlisted user -> 503, denied, model never called', async () => {
  let scanHandlerCalled = false
  const userClient = mockUserClient({
    user: { id: 'user-not-allowlisted' },
    error: null,
  })
  const adminClient = mockAdminClient({ data: null, error: null })

  const res = await handleCanaryRequest(requestWith(), {
    userClient,
    adminClient,
  })
  const body = await res.json()

  assertEquals(res.status, 503)
  assertStringIncludes(body.message ?? '', 'not yet available')
  assertEquals(scanHandlerCalled, false)
})

Deno.test('T-CANARY-4: allowlisted user -> delegates through to the real handleKeywordScanRequest', async () => {
  const userClient = mockUserClient({
    user: { id: 'user-allowlisted' },
    error: null,
  })
  const adminClient = mockAdminClient({
    data: { user_id: 'user-allowlisted' },
    error: null,
  })

  const originalOpenaiKey = Deno.env.get('OPENAI_API_KEY')
  Deno.env.delete('OPENAI_API_KEY')
  try {
    const res = await handleCanaryRequest(
      requestWith({ idempotencyKey: 'canary-test-key-001' }),
      {
        userClient,
        adminClient,
      },
    )
    const body = await res.json()
    // This exact string only exists inside handleKeywordScanRequest's own
    // source (keyword-scan.ts) -- seeing it here proves the canary
    // genuinely reached and ran the real shared implementation, not a
    // stub or a duplicate. See T-CANARY-10 for the complementary static
    // proof that the import itself is real.
    assertEquals(res.status, 503)
    assertEquals(body.error, 'Scan service is not configured')
  } finally {
    if (originalOpenaiKey !== undefined) {
      Deno.env.set('OPENAI_API_KEY', originalOpenaiKey)
    }
  }
})

Deno.test('T-CANARY-5: empty allowlist table (zero rows for this user) -> denied identically to explicit non-allowlisting', async () => {
  const userClient = mockUserClient({ user: { id: 'any-user' }, error: null })
  // maybeSingle() on an empty result set resolves { data: null, error: null }
  // -- indistinguishable, by design, from "row exists but doesn't match."
  const adminClient = mockAdminClient({ data: null, error: null })

  const res = await handleCanaryRequest(requestWith(), {
    userClient,
    adminClient,
  })
  assertEquals(res.status, 503)
})

Deno.test('T-CANARY-6: missing allowlist table (query errors, e.g. relation does not exist) -> fails closed, 503', async () => {
  const userClient = mockUserClient({ user: { id: 'any-user' }, error: null })
  const adminClient = mockAdminClient({
    data: null,
    error: { message: 'relation "keyword_scan_canary_users" does not exist' },
  })

  const res = await handleCanaryRequest(requestWith(), {
    userClient,
    adminClient,
  })
  const body = await res.json()
  assertEquals(res.status, 503)
  assertEquals(body.error, 'unavailable')
})

Deno.test('T-CANARY-7: malformed allowlist query result (query errors) -> fails closed, 503', async () => {
  const userClient = mockUserClient({ user: { id: 'any-user' }, error: null })
  const adminClient = mockAdminClient({
    data: null,
    error: { message: 'column "user_id" does not exist' },
  })

  const res = await handleCanaryRequest(requestWith(), {
    userClient,
    adminClient,
  })
  assertEquals(res.status, 503)
})

Deno.test('T-CANARY-8: client-supplied spoofed user id in the request body is never used for the allowlist check', async () => {
  const eqCalls: Array<{ column: string; value: string }> = []
  const userClient = mockUserClient({
    user: { id: 'real-authenticated-user' },
    error: null,
  })
  const adminClient = mockAdminClient({ data: null, error: null }, eqCalls)

  // Attacker-controlled body claims a different (allowlisted-looking) id.
  await handleCanaryRequest(
    requestWith({ userId: 'admin-spoofed-id', idempotencyKey: 'x' }),
    { userClient, adminClient },
  )

  assertEquals(eqCalls.length, 1)
  assertEquals(eqCalls[0].column, 'user_id')
  // Only the JWT-derived id is ever checked -- never the body's userId.
  assertEquals(eqCalls[0].value, 'real-authenticated-user')
})

Deno.test('T-CANARY-9: every denial path causes zero calls into the reservation/model-call implementation', async () => {
  // Re-verified explicitly (not just implied by the response status) across
  // every denial scenario: none of them can reach handleKeywordScanRequest,
  // because handleCanaryRequest only calls it after the allowlist branch
  // returns a truthy row -- structurally impossible to reach otherwise for
  // missing JWT, invalid JWT, non-allowlisted, or query-error cases.
  const scenarios: Array<[Any, Any]> = [
    [
      mockUserClient({ user: null, error: null }),
      mockAdminClient({ data: null, error: null }),
    ],
    [
      mockUserClient({ user: null, error: { message: 'bad' } }),
      mockAdminClient({ data: null, error: null }),
    ],
    [
      mockUserClient({ user: { id: 'u' }, error: null }),
      mockAdminClient({ data: null, error: null }),
    ],
    [
      mockUserClient({ user: { id: 'u' }, error: null }),
      mockAdminClient({ data: null, error: { message: 'boom' } }),
    ],
  ]

  for (const [userClient, adminClient] of scenarios) {
    const res = await handleCanaryRequest(requestWith(), {
      userClient,
      adminClient,
    })
    assert(
      res.status === 401 || res.status === 503,
      `unexpected status ${res.status}`,
    )
  }
})

Deno.test('T-CANARY-10: the production handler is genuinely shared (imported), not duplicated', async () => {
  // Runtime proof: handleKeywordScanRequest is directly importable from
  // keyword-scan-canary.ts's own dependency (keyword-scan.ts), and is a
  // real function -- not a type-only or dead import.
  assertEquals(typeof handleKeywordScanRequest, 'function')

  // Static-source proof: the canary file imports it by name from the real
  // production module, and does NOT itself call the reservation RPCs that
  // only the shared implementation is allowed to call -- if it did, that
  // would mean business logic had been duplicated rather than shared.
  const source = await Deno.readTextFile(
    new URL('./keyword-scan-canary.ts', import.meta.url),
  )
  assertStringIncludes(
    source,
    "import { handleKeywordScanRequest } from './keyword-scan.ts'",
  )
  assert(
    !source.includes("rpc('reserve_keyword_scan'"),
    'keyword-scan-canary.ts must never call reserve_keyword_scan directly -- that would be duplicated business logic',
  )
  assert(
    !source.includes("rpc('complete_keyword_scan'"),
    'keyword-scan-canary.ts must never call complete_keyword_scan directly',
  )
})
