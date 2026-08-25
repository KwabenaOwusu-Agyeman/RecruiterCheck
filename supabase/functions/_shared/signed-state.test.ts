// Run with: npx tsx supabase/functions/_shared/signed-state.test.ts
import assert from 'node:assert/strict'
import { createSignedState, verifySignedState } from './signed-state.ts'

let passed = 0
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    passed += 1
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`FAIL - ${name}`)
    throw error
  }
}

async function run() {
  await test('a freshly created state verifies as valid', async () => {
    const state = await createSignedState('secret')
    const result = await verifySignedState('secret', state)
    assert.deepEqual(result, { valid: true })
  })

  await test('verification fails with the wrong secret', async () => {
    const state = await createSignedState('secret')
    const result = await verifySignedState('other-secret', state)
    assert.equal(result.valid, false)
    assert.equal(result.reason, 'bad_signature')
  })

  await test('verification fails for a tampered payload', async () => {
    const state = await createSignedState('secret')
    const tampered = state.replace(/^\d+/, '1')
    const result = await verifySignedState('secret', tampered)
    assert.equal(result.valid, false)
  })

  await test('verification fails for a malformed state', async () => {
    assert.deepEqual(await verifySignedState('secret', 'not-a-real-state'), {
      valid: false,
      reason: 'malformed',
    })
  })

  await test('verification fails once the state is older than maxAgeMs', async () => {
    const nowMs = Date.now()
    const state = await createSignedState('secret', nowMs - 20 * 60 * 1000)
    const result = await verifySignedState('secret', state, { maxAgeMs: 10 * 60 * 1000, nowMs })
    assert.deepEqual(result, { valid: false, reason: 'expired' })
  })

  await test('two states created back to back are not identical (nonce varies)', async () => {
    const a = await createSignedState('secret')
    const b = await createSignedState('secret')
    assert.notEqual(a, b)
  })
}

run()
  .then(() => console.log(`\n${passed} passed`))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
