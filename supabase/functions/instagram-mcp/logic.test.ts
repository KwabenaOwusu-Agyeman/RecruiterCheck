// Run with: npx tsx supabase/functions/instagram-mcp/logic.test.ts
import assert from 'node:assert/strict'
import { callTool, TOOLS, type AuditEntry, type ToolContext } from './logic.ts'
import type { FetchFn, GraphConfig } from '../_shared/instagram-client.ts'

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

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

const CONFIG: GraphConfig = { accessToken: 'tok', igUserId: '1789', graphApiVersion: 'v23.0' }

function makeCtx(opts: {
  testMode?: boolean
  fetchFn: FetchFn
}): { ctx: ToolContext; audits: AuditEntry[] } {
  const audits: AuditEntry[] = []
  const ctx: ToolContext = {
    graphConfig: CONFIG,
    testMode: opts.testMode ?? true,
    fetchFn: opts.fetchFn,
    logAudit: async (entry) => {
      audits.push(entry)
    },
  }
  return { ctx, audits }
}

function textOf(result: { content: Array<{ type: 'text'; text: string }> }): string {
  return result.content[0]?.text ?? ''
}

async function run() {
  await test('TOOLS exposes exactly the 9 documented tool names', () => {
    const names = TOOLS.map((t) => t.name).sort()
    assert.deepEqual(names, [
      'instagram_create_carousel',
      'instagram_create_image_post',
      'instagram_create_reel',
      'instagram_create_story',
      'instagram_get_account',
      'instagram_get_post_insights',
      'instagram_get_publish_status',
      'instagram_get_publishing_limit',
      'instagram_list_recent_posts',
    ])
  })

  await test('instagram_get_account returns account info and logs a success audit entry', async () => {
    const { ctx, audits } = makeCtx({
      fetchFn: (async () => jsonResponse({ id: '1789', username: 'myrecruitercheck', account_type: 'BUSINESS' })) as FetchFn,
    })
    const result = await callTool('instagram_get_account', {}, ctx)
    assert.equal(result.isError, undefined)
    assert.ok(textOf(result).includes('myrecruitercheck'))
    assert.equal(audits.length, 1)
    assert.equal(audits[0].status, 'success')
  })

  await test('publish tools reject when confirm is not exactly true', async () => {
    const { ctx, audits } = makeCtx({ fetchFn: (async () => jsonResponse({})) as FetchFn })
    const result = await callTool('instagram_create_image_post', { image_url: 'https://cdn.example.com/a.jpg' }, ctx)
    assert.equal(result.isError, true)
    assert.ok(textOf(result).includes('Confirmation required'))
    assert.equal(audits.length, 1)
    assert.equal(audits[0].status, 'rejected')
  })

  await test('publish tools reject confirm: "true" (string) same as missing', async () => {
    const { ctx } = makeCtx({ fetchFn: (async () => jsonResponse({})) as FetchFn })
    const result = await callTool(
      'instagram_create_image_post',
      { image_url: 'https://cdn.example.com/a.jpg', confirm: 'true' },
      ctx,
    )
    assert.equal(result.isError, true)
  })

  await test('instagram_create_image_post rejects a caption over the length limit before any network call', async () => {
    let calls = 0
    const { ctx, audits } = makeCtx({
      fetchFn: (async () => {
        calls += 1
        return jsonResponse({})
      }) as FetchFn,
    })
    const result = await callTool(
      'instagram_create_image_post',
      { image_url: 'https://cdn.example.com/a.jpg', caption: 'x'.repeat(2201), confirm: true },
      ctx,
    )
    assert.equal(result.isError, true)
    assert.ok(textOf(result).includes('2200'))
    assert.equal(calls, 0)
    assert.equal(audits[0].status, 'error')
  })

  await test('instagram_create_image_post rejects a non-https image_url', async () => {
    const { ctx } = makeCtx({ fetchFn: (async () => jsonResponse({})) as FetchFn })
    const result = await callTool(
      'instagram_create_image_post',
      { image_url: 'http://cdn.example.com/a.jpg', confirm: true },
      ctx,
    )
    assert.equal(result.isError, true)
    assert.ok(textOf(result).includes('HTTPS'))
  })

  await test('instagram_create_image_post blocks publishing when quota is exhausted', async () => {
    const fetchFn: FetchFn = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('content_publishing_limit')) {
        return jsonResponse({ data: [{ quota_usage: 100, config: { quota_total: 100, quota_duration: 86400 } }] })
      }
      if (url.includes('/a.jpg')) {
        return new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': '1000' } })
      }
      throw new Error(`unexpected fetch to ${url}`)
    }) as FetchFn
    const { ctx } = makeCtx({ fetchFn })
    const result = await callTool(
      'instagram_create_image_post',
      { image_url: 'https://cdn.example.com/a.jpg', confirm: true },
      ctx,
    )
    assert.equal(result.isError, true)
    assert.ok(textOf(result).toLowerCase().includes('quota'))
  })

  await test('instagram_create_image_post in test mode validates everything but never calls media_publish', async () => {
    const calledUrls: string[] = []
    const fetchFn: FetchFn = (async (input: RequestInfo | URL) => {
      const url = String(input)
      calledUrls.push(url)
      if (url.includes('content_publishing_limit')) {
        return jsonResponse({ data: [{ quota_usage: 1, config: { quota_total: 100, quota_duration: 86400 } }] })
      }
      if (url.includes('/a.jpg')) {
        return new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': '1000' } })
      }
      if (url.includes('/media') && !url.includes('media_publish')) {
        return jsonResponse({ id: 'container-1' })
      }
      throw new Error(`unexpected fetch to ${url}`)
    }) as FetchFn
    const { ctx, audits } = makeCtx({ testMode: true, fetchFn })
    const result = await callTool(
      'instagram_create_image_post',
      { image_url: 'https://cdn.example.com/a.jpg', caption: 'Hello world', confirm: true },
      ctx,
    )
    assert.equal(result.isError, undefined)
    assert.ok(textOf(result).includes('"testMode": true'))
    assert.ok(calledUrls.every((url) => !url.includes('media_publish')))
    assert.equal(audits[0].status, 'success')
  })

  await test('instagram_create_image_post in real mode polls status then publishes', async () => {
    let statusCalls = 0
    const fetchFn: FetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('content_publishing_limit')) {
        return jsonResponse({ data: [{ quota_usage: 1, config: { quota_total: 100, quota_duration: 86400 } }] })
      }
      if (url.includes('/a.jpg')) {
        return new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': '1000' } })
      }
      if (url.includes('media_publish')) {
        assert.ok(String(init?.body).includes('creation_id=container-1'))
        return jsonResponse({ id: 'media-1' })
      }
      if (url.includes('/1789/media')) {
        return jsonResponse({ id: 'container-1' })
      }
      if (url.match(/\/container-1\?/)) {
        statusCalls += 1
        return jsonResponse({ status_code: 'FINISHED' })
      }
      throw new Error(`unexpected fetch to ${url}`)
    }) as FetchFn
    const { ctx } = makeCtx({ testMode: false, fetchFn })
    const result = await callTool(
      'instagram_create_image_post',
      { image_url: 'https://cdn.example.com/a.jpg', confirm: true },
      ctx,
    )
    assert.equal(result.isError, undefined)
    assert.ok(textOf(result).includes('media-1'))
    assert.equal(statusCalls, 1)
  })

  await test('instagram_create_carousel enforces the 2-10 item count before any network call', async () => {
    let calls = 0
    const fetchFn: FetchFn = (async () => {
      calls += 1
      return jsonResponse({})
    }) as FetchFn
    const { ctx } = makeCtx({ fetchFn })
    const result = await callTool(
      'instagram_create_carousel',
      { items: [{ image_url: 'https://cdn.example.com/a.jpg' }], confirm: true },
      ctx,
    )
    assert.equal(result.isError, true)
    assert.ok(textOf(result).includes('between 2 and 10'))
    assert.equal(calls, 0)
  })

  await test('instagram_create_story requires exactly one of image_url/video_url', async () => {
    const { ctx } = makeCtx({ fetchFn: (async () => jsonResponse({})) as FetchFn })
    const both = await callTool(
      'instagram_create_story',
      { image_url: 'https://cdn.example.com/a.jpg', video_url: 'https://cdn.example.com/a.mp4', confirm: true },
      ctx,
    )
    assert.equal(both.isError, true)
    const neither = await callTool('instagram_create_story', { confirm: true }, ctx)
    assert.equal(neither.isError, true)
  })

  await test('a Graph API rate-limit error surfaces a clear message', async () => {
    const fetchFn: FetchFn = (async () =>
      jsonResponse({ error: { message: 'Application request limit reached', code: 4 } }, 400)) as FetchFn
    const { ctx } = makeCtx({ fetchFn })
    const result = await callTool('instagram_get_account', {}, ctx)
    assert.equal(result.isError, true)
    assert.ok(textOf(result).toLowerCase().includes('rate limit'))
  })

  await test('unknown tool name returns an error result without throwing', async () => {
    const { ctx } = makeCtx({ fetchFn: (async () => jsonResponse({})) as FetchFn })
    const result = await callTool('instagram_delete_everything', {}, ctx)
    assert.equal(result.isError, true)
  })
}

run()
  .then(() => console.log(`\n${passed} passed`))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
