// Run with: npx tsx supabase/functions/instagram-mcp/protocol.test.ts
import assert from 'node:assert/strict'
import { handleBody, handleRequest } from './protocol.ts'
import type { AuditEntry, ToolContext } from './logic.ts'
import type { FetchFn } from '../_shared/instagram-client.ts'

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

function makeCtx(fetchFn: FetchFn): { ctx: ToolContext; audits: AuditEntry[] } {
  const audits: AuditEntry[] = []
  return {
    audits,
    ctx: {
      graphConfig: { accessToken: 'tok', igUserId: '1789', graphApiVersion: 'v23.0' },
      testMode: true,
      fetchFn,
      logAudit: async (entry) => {
        audits.push(entry)
      },
    },
  }
}

async function run() {
  await test('initialize returns protocol version and tools capability', async () => {
    const { ctx } = makeCtx((async () => new Response('{}')) as FetchFn)
    const response = await handleRequest({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, ctx)
    assert.equal(response?.id, 1)
    assert.ok(response?.result)
  })

  await test('notifications/initialized returns null (no response)', async () => {
    const { ctx } = makeCtx((async () => new Response('{}')) as FetchFn)
    const response = await handleRequest({ jsonrpc: '2.0', method: 'notifications/initialized' }, ctx)
    assert.equal(response, null)
  })

  await test('tools/list returns all 9 tools with input schemas', async () => {
    const { ctx } = makeCtx((async () => new Response('{}')) as FetchFn)
    const response = await handleRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, ctx)
    const result = response?.result as { tools: Array<{ name: string }> }
    assert.equal(result.tools.length, 9)
  })

  await test('tools/call with an unknown tool name is rejected with INVALID_PARAMS', async () => {
    const { ctx } = makeCtx((async () => new Response('{}')) as FetchFn)
    const response = await handleRequest(
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'not_a_real_tool', arguments: {} } },
      ctx,
    )
    assert.equal(response?.error?.code, -32602)
  })

  await test('tools/call dispatches to callTool and returns its result as the RPC result', async () => {
    const { ctx } = makeCtx((async () =>
      new Response(JSON.stringify({ id: '1789', username: 'myrecruitercheck' }), {
        headers: { 'Content-Type': 'application/json' },
      })) as FetchFn)
    const response = await handleRequest(
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'instagram_get_account', arguments: {} } },
      ctx,
    )
    const result = response?.result as { content: Array<{ text: string }> }
    assert.ok(result.content[0].text.includes('myrecruitercheck'))
  })

  await test('a request missing jsonrpc: "2.0" is rejected as INVALID_REQUEST', async () => {
    const { ctx } = makeCtx((async () => new Response('{}')) as FetchFn)
    const response = await handleRequest({ id: 5, method: 'ping' }, ctx)
    assert.equal(response?.error?.code, -32600)
  })

  await test('an unknown method is rejected as METHOD_NOT_FOUND', async () => {
    const { ctx } = makeCtx((async () => new Response('{}')) as FetchFn)
    const response = await handleRequest({ jsonrpc: '2.0', id: 6, method: 'not/a/method' }, ctx)
    assert.equal(response?.error?.code, -32601)
  })

  await test('handleBody supports a batch array and drops notifications from the response', async () => {
    const { ctx } = makeCtx((async () => new Response('{}')) as FetchFn)
    const response = await handleBody(
      [
        { jsonrpc: '2.0', id: 7, method: 'ping' },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
      ],
      ctx,
    )
    assert.ok(Array.isArray(response))
    assert.equal((response as unknown[]).length, 1)
  })

  await test('handleBody returns null for an all-notifications batch', async () => {
    const { ctx } = makeCtx((async () => new Response('{}')) as FetchFn)
    const response = await handleBody([{ jsonrpc: '2.0', method: 'notifications/initialized' }], ctx)
    assert.equal(response, null)
  })
}

run()
  .then(() => console.log(`\n${passed} passed`))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
