// Run with: npx tsx supabase/functions/_shared/instagram-client.test.ts
import assert from 'node:assert/strict'
import {
  checkRemoteMedia,
  createMediaContainer,
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  getAccountInfo,
  getContainerStatus,
  getMediaInsights,
  getPublishingLimit,
  InstagramApiRequestError,
  listRecentMedia,
  publishMediaContainer,
  refreshLongLivedToken,
  validateCaption,
  validateCarouselItemCount,
  validateImageMedia,
  validateMediaUrl,
  validateVideoMedia,
  ValidationError,
  type FetchFn,
} from './instagram-client.ts'

let passed = 0
function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1
      console.log(`ok - ${name}`)
    })
    .catch((error) => {
      console.error(`FAIL - ${name}`)
      throw error
    })
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function fakeFetch(handler: (url: string, init?: RequestInit) => Response): FetchFn {
  return (async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)) as FetchFn
}

const CONFIG = { accessToken: 'tok', igUserId: '1789', graphApiVersion: 'v23.0' }

async function run() {
  await test('validateCaption rejects captions over the Instagram limit', () => {
    assert.throws(() => validateCaption('a'.repeat(2201)), ValidationError)
  })

  await test('validateCaption rejects control characters', () => {
    assert.throws(() => validateCaption('hello\x00world'), ValidationError)
  })

  await test('validateCaption allows undefined and normal text', () => {
    assert.equal(validateCaption(undefined), undefined)
    assert.equal(validateCaption('Great news! #hiring'), 'Great news! #hiring')
  })

  await test('validateMediaUrl rejects non-https URLs', () => {
    assert.throws(() => validateMediaUrl('http://example.com/a.jpg'), ValidationError)
  })

  await test('validateMediaUrl rejects private/local hosts', () => {
    assert.throws(() => validateMediaUrl('https://localhost/a.jpg'), ValidationError)
    assert.throws(() => validateMediaUrl('https://192.168.1.5/a.jpg'), ValidationError)
    assert.throws(() => validateMediaUrl('https://10.0.0.1/a.jpg'), ValidationError)
  })

  await test('validateMediaUrl accepts a normal public https URL', () => {
    assert.equal(validateMediaUrl('https://cdn.example.com/a.jpg'), 'https://cdn.example.com/a.jpg')
  })

  await test('validateCarouselItemCount enforces the 2-10 item range', () => {
    assert.throws(() => validateCarouselItemCount(1), ValidationError)
    assert.throws(() => validateCarouselItemCount(11), ValidationError)
    validateCarouselItemCount(2)
    validateCarouselItemCount(10)
  })

  await test('validateImageMedia rejects disallowed MIME types and oversized files', () => {
    assert.throws(() => validateImageMedia({ contentType: 'image/gif', contentLength: 100 }), ValidationError)
    assert.throws(
      () => validateImageMedia({ contentType: 'image/jpeg', contentLength: 9 * 1024 * 1024 }),
      ValidationError,
    )
    validateImageMedia({ contentType: 'image/jpeg', contentLength: 1000 })
  })

  await test('validateVideoMedia rejects disallowed MIME types', () => {
    assert.throws(() => validateVideoMedia({ contentType: 'video/webm', contentLength: 100 }), ValidationError)
    validateVideoMedia({ contentType: 'video/mp4', contentLength: 1000 })
  })

  await test('checkRemoteMedia surfaces content-type/length from a HEAD request', async () => {
    const fetchFn = fakeFetch(() => new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': '12345' } }))
    const result = await checkRemoteMedia('https://cdn.example.com/a.jpg', fetchFn)
    assert.deepEqual(result, { contentType: 'image/jpeg', contentLength: 12345 })
  })

  await test('checkRemoteMedia throws on an unreachable URL', async () => {
    const fetchFn = fakeFetch(() => new Response(null, { status: 404 }))
    await assert.rejects(() => checkRemoteMedia('https://cdn.example.com/missing.jpg', fetchFn), ValidationError)
  })

  await test('exchangeCodeForShortLivedToken parses the data[0] shape', async () => {
    const fetchFn = fakeFetch((url) => {
      assert.equal(url, 'https://api.instagram.com/oauth/access_token')
      return jsonResponse({ data: [{ access_token: 'short', user_id: '1789', permissions: 'instagram_business_basic,instagram_business_content_publish' }] })
    })
    const result = await exchangeCodeForShortLivedToken(
      { appId: 'app', appSecret: 'secret', redirectUri: 'https://x/callback', code: 'code' },
      fetchFn,
    )
    assert.deepEqual(result, {
      accessToken: 'short',
      igUserId: '1789',
      permissions: ['instagram_business_basic', 'instagram_business_content_publish'],
    })
  })

  await test('exchangeForLongLivedToken hits graph.instagram.com/access_token', async () => {
    const fetchFn = fakeFetch((url) => {
      assert.ok(url.startsWith('https://graph.instagram.com/access_token'))
      assert.ok(url.includes('grant_type=ig_exchange_token'))
      return jsonResponse({ access_token: 'long', expires_in: 5184000 })
    })
    const result = await exchangeForLongLivedToken({ appSecret: 'secret', shortLivedAccessToken: 'short' }, fetchFn)
    assert.deepEqual(result, { accessToken: 'long', expiresInSeconds: 5184000 })
  })

  await test('refreshLongLivedToken hits refresh_access_token', async () => {
    const fetchFn = fakeFetch((url) => {
      assert.ok(url.startsWith('https://graph.instagram.com/refresh_access_token'))
      assert.ok(url.includes('grant_type=ig_refresh_token'))
      return jsonResponse({ access_token: 'refreshed', expires_in: 5184000 })
    })
    const result = await refreshLongLivedToken({ accessToken: 'long' }, fetchFn)
    assert.deepEqual(result, { accessToken: 'refreshed', expiresInSeconds: 5184000 })
  })

  await test('getAccountInfo maps the Graph API response', async () => {
    const fetchFn = fakeFetch(() => jsonResponse({ id: '1789', username: 'myrecruitercheck', account_type: 'BUSINESS', media_count: 42 }))
    const result = await getAccountInfo(CONFIG, fetchFn)
    assert.deepEqual(result, { id: '1789', username: 'myrecruitercheck', accountType: 'BUSINESS', mediaCount: 42 })
  })

  await test('createMediaContainer posts to /{ig-user-id}/media with expected fields', async () => {
    const fetchFn = fakeFetch((url, init) => {
      assert.ok(url.startsWith('https://graph.instagram.com/v23.0/1789/media'))
      assert.equal(init?.method, 'POST')
      const body = String(init?.body)
      assert.ok(body.includes('image_url=https'))
      assert.ok(body.includes('caption=Hello'))
      return jsonResponse({ id: 'container-1' })
    })
    const result = await createMediaContainer(
      CONFIG,
      { mediaType: 'IMAGE', imageUrl: 'https://cdn.example.com/a.jpg', caption: 'Hello' },
      fetchFn,
    )
    assert.deepEqual(result, { containerId: 'container-1' })
  })

  await test('createMediaContainer sends media_type + children for carousels', async () => {
    const fetchFn = fakeFetch((_url, init) => {
      const body = String(init?.body)
      assert.ok(body.includes('media_type=CAROUSEL'))
      assert.ok(body.includes('children=c1%2Cc2%2Cc3'))
      return jsonResponse({ id: 'container-carousel' })
    })
    const result = await createMediaContainer(
      CONFIG,
      { mediaType: 'CAROUSEL', children: ['c1', 'c2', 'c3'], caption: 'Carousel' },
      fetchFn,
    )
    assert.deepEqual(result, { containerId: 'container-carousel' })
  })

  await test('publishMediaContainer posts creation_id to /media_publish', async () => {
    const fetchFn = fakeFetch((url, init) => {
      assert.ok(url.endsWith('/1789/media_publish?access_token=tok'))
      assert.ok(String(init?.body).includes('creation_id=container-1'))
      return jsonResponse({ id: 'media-1' })
    })
    const result = await publishMediaContainer(CONFIG, 'container-1', fetchFn)
    assert.deepEqual(result, { mediaId: 'media-1' })
  })

  await test('getContainerStatus reads status_code/status', async () => {
    const fetchFn = fakeFetch(() => jsonResponse({ status_code: 'FINISHED', status: 'ok' }))
    const result = await getContainerStatus(CONFIG, 'container-1', fetchFn)
    assert.deepEqual(result, { statusCode: 'FINISHED', status: 'ok' })
  })

  await test('getPublishingLimit maps quota_usage/config', async () => {
    const fetchFn = fakeFetch(() =>
      jsonResponse({ data: [{ quota_usage: 3, config: { quota_total: 100, quota_duration: 86400 } }] }),
    )
    const result = await getPublishingLimit(CONFIG, fetchFn)
    assert.deepEqual(result, { quotaUsage: 3, configCapacity: 100, configDurationSeconds: 86400 })
  })

  await test('listRecentMedia maps each item', async () => {
    const fetchFn = fakeFetch(() =>
      jsonResponse({
        data: [
          {
            id: 'm1',
            caption: 'hi',
            media_type: 'IMAGE',
            media_url: 'https://x/m1.jpg',
            permalink: 'https://instagram.com/p/m1',
            timestamp: '2026-08-01T00:00:00+0000',
            like_count: 10,
            comments_count: 2,
          },
        ],
      }),
    )
    const result = await listRecentMedia(CONFIG, 5, fetchFn)
    assert.deepEqual(result, [
      {
        id: 'm1',
        caption: 'hi',
        mediaType: 'IMAGE',
        mediaUrl: 'https://x/m1.jpg',
        permalink: 'https://instagram.com/p/m1',
        timestamp: '2026-08-01T00:00:00+0000',
        likeCount: 10,
        commentsCount: 2,
      },
    ])
  })

  await test('getMediaInsights maps metric name -> first value', async () => {
    const fetchFn = fakeFetch(() =>
      jsonResponse({ data: [{ name: 'reach', values: [{ value: 123 }] }, { name: 'saved', values: [{ value: 4 }] }] }),
    )
    const result = await getMediaInsights(CONFIG, 'm1', ['reach', 'saved'], fetchFn)
    assert.deepEqual(result, { reach: 123, saved: 4 })
  })

  await test('a non-2xx Graph API response throws InstagramApiRequestError with Meta message', async () => {
    const fetchFn = fakeFetch(() => jsonResponse({ error: { message: 'Invalid OAuth access token', code: 190 } }, 401))
    await assert.rejects(() => getAccountInfo(CONFIG, fetchFn), (error: unknown) => {
      assert.ok(error instanceof InstagramApiRequestError)
      assert.equal(error.message, 'Invalid OAuth access token')
      assert.equal(error.code, 190)
      return true
    })
  })

  await test('a non-2xx api.instagram.com/oauth/access_token response surfaces the flat error_message shape', async () => {
    const fetchFn = fakeFetch(() =>
      jsonResponse({ error_type: 'OAuthException', code: 400, error_message: 'Invalid platform app' }, 400),
    )
    await assert.rejects(
      () => exchangeCodeForShortLivedToken({ appId: 'app', appSecret: 'secret', redirectUri: 'https://x/callback', code: 'code' }, fetchFn),
      (error: unknown) => {
        assert.ok(error instanceof InstagramApiRequestError)
        assert.equal(error.message, 'Invalid platform app')
        assert.equal(error.code, 400)
        return true
      },
    )
  })
}

run()
  .then(() => {
    console.log(`\n${passed} passed`)
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
