// Run with: npx tsx supabase/functions/brevo-unsubscribe-webhook/logic.test.ts
import assert from 'node:assert/strict'
import { parseUnsubscribeEvent } from './logic.ts'

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
  await test('unsubscribed event marks the subscriber', () => {
    const r = parseUnsubscribeEvent({ event: 'unsubscribed', email: 'a@b.com' })
    assert.equal(r.shouldUnsubscribe, true)
    assert.equal(r.email, 'a@b.com')
  })

  await test('spam, blocked and hard_bounce all stop sending', () => {
    for (const event of ['spam', 'blocked', 'hard_bounce', 'unsubscribe']) {
      assert.equal(parseUnsubscribeEvent({ event, email: 'a@b.com' }).shouldUnsubscribe, true, event)
    }
  })

  await test('engagement events are ignored, not treated as unsubscribes', () => {
    // The important negative case: mistaking these would silently gut the list.
    for (const event of ['opened', 'click', 'delivered', 'soft_bounce', 'request']) {
      const r = parseUnsubscribeEvent({ event, email: 'a@b.com' })
      assert.equal(r.shouldUnsubscribe, false, event)
      assert.match(r.reason, /ignored event/)
    }
  })

  await test('event matching is case and whitespace insensitive', () => {
    assert.equal(parseUnsubscribeEvent({ event: '  UNSUBSCRIBED ', email: 'a@b.com' }).shouldUnsubscribe, true)
  })

  await test('email is normalised to lowercase', () => {
    assert.equal(parseUnsubscribeEvent({ event: 'unsubscribed', email: '  A@B.COM ' }).email, 'a@b.com')
  })

  await test('missing or malformed payloads are rejected safely', () => {
    assert.equal(parseUnsubscribeEvent({}).shouldUnsubscribe, false)
    assert.equal(parseUnsubscribeEvent({ event: 'unsubscribed' }).shouldUnsubscribe, false)
    assert.equal(parseUnsubscribeEvent({ event: 'unsubscribed', email: 'not-an-email' }).shouldUnsubscribe, false)
    assert.equal(parseUnsubscribeEvent({ email: 'a@b.com' }).shouldUnsubscribe, false)
  })

  console.log(`\n${passed} passed`)
}

await run()
