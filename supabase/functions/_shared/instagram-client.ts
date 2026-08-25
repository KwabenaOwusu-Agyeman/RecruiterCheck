// Thin wrapper around the "Instagram API with Instagram Login" (Business
// Login for Instagram) flow and the Instagram Graph API's content
// publishing endpoints. Deliberately dependency-free (no Deno.* globals, no
// npm imports) so it can run both inside a Supabase edge function and under
// plain `npx tsx` for tests — every function takes its config/fetch
// explicitly instead of reading environment or module-level state.
//
// Graph API versions churn every few months (v21 -> v25 -> v26 within the
// last year), so this module never hardcodes one: callers must pass
// `graphApiVersion` (sourced from the GRAPH_API_VERSION env var at the
// index.ts layer). Verify the current version at
// https://developers.facebook.com/docs/graph-api/changelog before setting it.

export type FetchFn = typeof fetch

export interface InstagramApiError {
  error: {
    message: string
    type?: string
    code?: number
    error_subcode?: number
    fbtrace_id?: string
  }
}

// api.instagram.com/oauth/access_token (the short-lived token exchange)
// reports errors in this flat shape instead of the {error: {...}} shape
// used everywhere else in the Graph/Instagram API.
export interface InstagramFlatApiError {
  error_type?: string
  error_message?: string
  code?: number
}

export class InstagramApiRequestError extends Error {
  readonly status: number
  readonly code?: number
  readonly subcode?: number

  constructor(message: string, status: number, code?: number, subcode?: number) {
    super(message)
    this.name = 'InstagramApiRequestError'
    this.status = status
    this.code = code
    this.subcode = subcode
  }
}

async function parseOrThrow<T>(response: Response): Promise<T> {
  const text = await response.text()
  let body: unknown
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    body = { raw: text }
  }

  if (!response.ok) {
    const errBody = body as Partial<InstagramApiError> & Partial<InstagramFlatApiError>
    const message =
      errBody?.error?.message ??
      errBody?.error_message ??
      `Instagram API request failed with status ${response.status}`
    const code = errBody?.error?.code ?? errBody?.code
    throw new InstagramApiRequestError(message, response.status, code, errBody?.error?.error_subcode)
  }

  return body as T
}

// ---------------------------------------------------------------------------
// OAuth / token lifecycle
// ---------------------------------------------------------------------------

export interface ExchangeCodeParams {
  appId: string
  appSecret: string
  redirectUri: string
  code: string
}

export interface ShortLivedTokenResult {
  accessToken: string
  igUserId: string
  permissions: string[]
}

// POST https://api.instagram.com/oauth/access_token
export async function exchangeCodeForShortLivedToken(
  params: ExchangeCodeParams,
  fetchFn: FetchFn = fetch,
): Promise<ShortLivedTokenResult> {
  const body = new URLSearchParams({
    client_id: params.appId,
    client_secret: params.appSecret,
    grant_type: 'authorization_code',
    redirect_uri: params.redirectUri,
    code: params.code,
  })

  const response = await fetchFn('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  const result = await parseOrThrow<{ data?: Array<{ access_token: string; user_id: string; permissions: string }> }>(
    response,
  )
  const entry = result.data?.[0]
  if (!entry) {
    throw new InstagramApiRequestError('Instagram token exchange returned no data', 502)
  }

  return {
    accessToken: entry.access_token,
    igUserId: entry.user_id,
    permissions: entry.permissions ? entry.permissions.split(',') : [],
  }
}

export interface LongLivedTokenResult {
  accessToken: string
  expiresInSeconds: number
}

// GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token
export async function exchangeForLongLivedToken(
  params: { appSecret: string; shortLivedAccessToken: string },
  fetchFn: FetchFn = fetch,
): Promise<LongLivedTokenResult> {
  const url = new URL('https://graph.instagram.com/access_token')
  url.searchParams.set('grant_type', 'ig_exchange_token')
  url.searchParams.set('client_secret', params.appSecret)
  url.searchParams.set('access_token', params.shortLivedAccessToken)

  const response = await fetchFn(url.toString())
  const result = await parseOrThrow<{ access_token: string; expires_in: number }>(response)
  return { accessToken: result.access_token, expiresInSeconds: result.expires_in }
}

// GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token
// Meta requires the token being refreshed to be at least 24h old.
export async function refreshLongLivedToken(
  params: { accessToken: string },
  fetchFn: FetchFn = fetch,
): Promise<LongLivedTokenResult> {
  const url = new URL('https://graph.instagram.com/refresh_access_token')
  url.searchParams.set('grant_type', 'ig_refresh_token')
  url.searchParams.set('access_token', params.accessToken)

  const response = await fetchFn(url.toString())
  const result = await parseOrThrow<{ access_token: string; expires_in: number }>(response)
  return { accessToken: result.access_token, expiresInSeconds: result.expires_in }
}

// ---------------------------------------------------------------------------
// Common config passed to every Graph API call below
// ---------------------------------------------------------------------------

export interface GraphConfig {
  accessToken: string
  igUserId: string
  graphApiVersion: string
}

function graphUrl(config: GraphConfig, path: string): URL {
  const url = new URL(`https://graph.instagram.com/${config.graphApiVersion}${path}`)
  url.searchParams.set('access_token', config.accessToken)
  return url
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

export interface InstagramAccountInfo {
  id: string
  username: string
  accountType?: string
  mediaCount?: number
}

export async function getAccountInfo(config: GraphConfig, fetchFn: FetchFn = fetch): Promise<InstagramAccountInfo> {
  const url = graphUrl(config, `/${config.igUserId}`)
  url.searchParams.set('fields', 'id,username,account_type,media_count')
  const response = await fetchFn(url.toString())
  const result = await parseOrThrow<{ id: string; username: string; account_type?: string; media_count?: number }>(
    response,
  )
  return {
    id: result.id,
    username: result.username,
    accountType: result.account_type,
    mediaCount: result.media_count,
  }
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

export type MediaType = 'IMAGE' | 'REELS' | 'STORIES' | 'CAROUSEL'

export interface CreateContainerParams {
  mediaType: MediaType
  caption?: string
  imageUrl?: string
  videoUrl?: string
  coverUrl?: string
  isCarouselItem?: boolean
  children?: string[]
  shareToFeed?: boolean
}

export async function createMediaContainer(
  config: GraphConfig,
  params: CreateContainerParams,
  fetchFn: FetchFn = fetch,
): Promise<{ containerId: string }> {
  const url = graphUrl(config, `/${config.igUserId}/media`)
  const body = new URLSearchParams()

  if (params.mediaType !== 'IMAGE' || params.children) {
    body.set('media_type', params.mediaType)
  }
  if (params.caption) body.set('caption', params.caption)
  if (params.imageUrl) body.set('image_url', params.imageUrl)
  if (params.videoUrl) body.set('video_url', params.videoUrl)
  if (params.coverUrl) body.set('cover_url', params.coverUrl)
  if (params.isCarouselItem) body.set('is_carousel_item', 'true')
  if (params.children?.length) body.set('children', params.children.join(','))
  if (typeof params.shareToFeed === 'boolean') body.set('share_to_feed', String(params.shareToFeed))

  const response = await fetchFn(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const result = await parseOrThrow<{ id: string }>(response)
  return { containerId: result.id }
}

export async function publishMediaContainer(
  config: GraphConfig,
  creationId: string,
  fetchFn: FetchFn = fetch,
): Promise<{ mediaId: string }> {
  const url = graphUrl(config, `/${config.igUserId}/media_publish`)
  const body = new URLSearchParams({ creation_id: creationId })

  const response = await fetchFn(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const result = await parseOrThrow<{ id: string }>(response)
  return { mediaId: result.id }
}

export type PublishStatusCode = 'EXPIRED' | 'ERROR' | 'FINISHED' | 'IN_PROGRESS' | 'PUBLISHED'

export async function getContainerStatus(
  config: GraphConfig,
  containerId: string,
  fetchFn: FetchFn = fetch,
): Promise<{ statusCode: PublishStatusCode; status?: string }> {
  const url = graphUrl(config, `/${containerId}`)
  url.searchParams.set('fields', 'status_code,status')
  const response = await fetchFn(url.toString())
  const result = await parseOrThrow<{ status_code: PublishStatusCode; status?: string }>(response)
  return { statusCode: result.status_code, status: result.status }
}

export interface PublishingLimit {
  quotaUsage: number
  configCapacity: number
  configDurationSeconds: number
}

export async function getPublishingLimit(config: GraphConfig, fetchFn: FetchFn = fetch): Promise<PublishingLimit> {
  const url = graphUrl(config, `/${config.igUserId}/content_publishing_limit`)
  url.searchParams.set('fields', 'config,quota_usage')
  const response = await fetchFn(url.toString())
  const result = await parseOrThrow<{
    data: Array<{ quota_usage: number; config: { quota_total: number; quota_duration: number } }>
  }>(response)
  const entry = result.data?.[0]
  if (!entry) {
    throw new InstagramApiRequestError('Instagram publishing limit response had no data', 502)
  }
  return {
    quotaUsage: entry.quota_usage,
    configCapacity: entry.config.quota_total,
    configDurationSeconds: entry.config.quota_duration,
  }
}

// ---------------------------------------------------------------------------
// Reading recent posts + insights
// ---------------------------------------------------------------------------

export interface RecentMediaItem {
  id: string
  caption?: string
  mediaType?: string
  mediaUrl?: string
  permalink?: string
  timestamp?: string
  likeCount?: number
  commentsCount?: number
}

export async function listRecentMedia(
  config: GraphConfig,
  limit: number,
  fetchFn: FetchFn = fetch,
): Promise<RecentMediaItem[]> {
  const url = graphUrl(config, `/${config.igUserId}/media`)
  url.searchParams.set(
    'fields',
    'id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count',
  )
  url.searchParams.set('limit', String(limit))
  const response = await fetchFn(url.toString())
  const result = await parseOrThrow<{
    data: Array<{
      id: string
      caption?: string
      media_type?: string
      media_url?: string
      permalink?: string
      timestamp?: string
      like_count?: number
      comments_count?: number
    }>
  }>(response)

  return (result.data ?? []).map((item) => ({
    id: item.id,
    caption: item.caption,
    mediaType: item.media_type,
    mediaUrl: item.media_url,
    permalink: item.permalink,
    timestamp: item.timestamp,
    likeCount: item.like_count,
    commentsCount: item.comments_count,
  }))
}

export async function getMediaInsights(
  config: GraphConfig,
  mediaId: string,
  metrics: string[],
  fetchFn: FetchFn = fetch,
): Promise<Record<string, number>> {
  const url = graphUrl(config, `/${mediaId}/insights`)
  url.searchParams.set('metric', metrics.join(','))
  const response = await fetchFn(url.toString())
  const result = await parseOrThrow<{ data: Array<{ name: string; values: Array<{ value: number }> }> }>(response)

  const insights: Record<string, number> = {}
  for (const metric of result.data ?? []) {
    insights[metric.name] = metric.values?.[0]?.value ?? 0
  }
  return insights
}

// ---------------------------------------------------------------------------
// Input validation (pure — no network calls)
// ---------------------------------------------------------------------------

export const CAPTION_MAX_LENGTH = 2200
export const CAROUSEL_MIN_ITEMS = 2
export const CAROUSEL_MAX_ITEMS = 10
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png']
export const ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime']
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024 // Meta's stated image container limit
export const MAX_VIDEO_BYTES = 1024 * 1024 * 1024 // 1 GiB, well under Reels' 4 GiB cap; keeps validation conservative

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export function validateCaption(caption: string | undefined): string | undefined {
  if (caption === undefined) return undefined
  if (typeof caption !== 'string') {
    throw new ValidationError('Caption must be a string')
  }
  if (caption.length > CAPTION_MAX_LENGTH) {
    throw new ValidationError(`Caption exceeds Instagram's ${CAPTION_MAX_LENGTH} character limit`)
  }
  // deno-lint-ignore no-control-regex
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(caption)) {
    throw new ValidationError('Caption contains disallowed control characters')
  }
  return caption
}

export function validateMediaUrl(url: string, fieldName = 'media URL'): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new ValidationError(`${fieldName} is not a valid URL`)
  }
  if (parsed.protocol !== 'https:') {
    throw new ValidationError(`${fieldName} must use HTTPS (Meta's servers fetch this URL directly)`)
  }
  const host = parsed.hostname.toLowerCase()
  const isPrivate =
    host === 'localhost' ||
    host.endsWith('.local') ||
    host === '127.0.0.1' ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    host === '0.0.0.0'
  if (isPrivate) {
    throw new ValidationError(`${fieldName} must be a publicly reachable HTTPS URL, not a private/local address`)
  }
  return url
}

export interface RemoteMediaCheck {
  contentType: string | null
  contentLength: number | null
}

// Performs a HEAD request against a caller-supplied media URL so obviously
// wrong input (wrong MIME type, oversized file) is rejected with a clear
// message before we ever call the Graph API, rather than surfacing an
// opaque container-processing error later. Meta's own servers still fetch
// and re-validate the URL independently when the container is created.
export async function checkRemoteMedia(url: string, fetchFn: FetchFn = fetch): Promise<RemoteMediaCheck> {
  const response = await fetchFn(url, { method: 'HEAD' })
  if (!response.ok) {
    throw new ValidationError(`Media URL is not reachable (HTTP ${response.status})`)
  }
  const contentType = response.headers.get('content-type')
  const contentLengthHeader = response.headers.get('content-length')
  return {
    contentType,
    contentLength: contentLengthHeader ? Number(contentLengthHeader) : null,
  }
}

export function validateImageMedia(check: RemoteMediaCheck): void {
  if (check.contentType && !ALLOWED_IMAGE_MIME_TYPES.includes(check.contentType.split(';')[0].trim())) {
    throw new ValidationError(
      `Unsupported image MIME type "${check.contentType}" — expected one of ${ALLOWED_IMAGE_MIME_TYPES.join(', ')}`,
    )
  }
  if (check.contentLength !== null && check.contentLength > MAX_IMAGE_BYTES) {
    throw new ValidationError(`Image exceeds the ${MAX_IMAGE_BYTES} byte limit`)
  }
}

export function validateVideoMedia(check: RemoteMediaCheck): void {
  if (check.contentType && !ALLOWED_VIDEO_MIME_TYPES.includes(check.contentType.split(';')[0].trim())) {
    throw new ValidationError(
      `Unsupported video MIME type "${check.contentType}" — expected one of ${ALLOWED_VIDEO_MIME_TYPES.join(', ')}`,
    )
  }
  if (check.contentLength !== null && check.contentLength > MAX_VIDEO_BYTES) {
    throw new ValidationError(`Video exceeds the ${MAX_VIDEO_BYTES} byte limit`)
  }
}

export function validateCarouselItemCount(count: number): void {
  if (count < CAROUSEL_MIN_ITEMS || count > CAROUSEL_MAX_ITEMS) {
    throw new ValidationError(
      `Carousel posts need between ${CAROUSEL_MIN_ITEMS} and ${CAROUSEL_MAX_ITEMS} items (got ${count})`,
    )
  }
}
