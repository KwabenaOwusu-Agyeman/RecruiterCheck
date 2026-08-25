// Tool definitions and dispatch logic for the Instagram remote MCP server.
// Deliberately free of Deno.* globals and the MCP SDK: it takes an
// injected GraphConfig/fetch/audit-logger so it can run under `npx tsx` in
// tests, and hand-rolls the small slice of JSON-RPC 2.0 this server needs
// rather than depending on an SDK whose npm-in-Deno-edge-runtime behavior
// hasn't been verified here.
import {
  checkRemoteMedia,
  createMediaContainer,
  getAccountInfo,
  getContainerStatus,
  getMediaInsights,
  getPublishingLimit,
  InstagramApiRequestError,
  listRecentMedia,
  publishMediaContainer,
  validateCaption,
  validateCarouselItemCount,
  validateImageMedia,
  validateMediaUrl,
  validateVideoMedia,
  ValidationError,
  type FetchFn,
  type GraphConfig,
  type MediaType,
} from '../_shared/instagram-client.ts'

export interface ToolContext {
  graphConfig: GraphConfig
  testMode: boolean
  fetchFn: FetchFn
  logAudit: (entry: AuditEntry) => Promise<void>
}

export interface AuditEntry {
  toolName: string
  testMode: boolean
  requestSummary: Record<string, unknown>
  resultSummary?: Record<string, unknown>
  status: 'success' | 'error' | 'rejected'
  errorMessage?: string
}

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

const CONFIRM_NOTE =
  'Before calling this tool with confirm: true, show the user the exact caption and media that will be posted and get their explicit go-ahead. Never set confirm: true on your own initiative.'

const CAPTION_SCHEMA = { type: 'string', description: "Post caption, max 2200 characters. Omit for no caption." }
const CONFIRM_SCHEMA = {
  type: 'boolean',
  description: 'Must be explicitly true to actually publish. Omitting or setting false only validates the request.',
}

export const TOOLS: ToolDefinition[] = [
  {
    name: 'instagram_get_account',
    description: 'Return the connected Instagram Professional account\'s id, username, account type, and media count.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'instagram_get_publishing_limit',
    description:
      "Check the account's current Instagram content-publishing quota (posts used vs. capacity in the current rolling window). Always call this before publishing to confirm there is quota remaining.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'instagram_list_recent_posts',
    description: 'List recently published Instagram posts with captions, media type, permalink, and basic like/comment counts.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 25, description: 'Number of posts to return (default 10).' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'instagram_get_post_insights',
    description: 'Read performance metrics (reach, likes, comments, saved, shares, etc.) for one published Instagram post.',
    inputSchema: {
      type: 'object',
      properties: {
        media_id: { type: 'string', description: 'The Instagram media ID (from instagram_list_recent_posts).' },
        metrics: {
          type: 'array',
          items: { type: 'string' },
          description: "Metric names to fetch. Defaults to ['reach','likes','comments','saved','shares'] if omitted.",
        },
      },
      required: ['media_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'instagram_get_publish_status',
    description: 'Check the processing/publish status of a media container by its container id (returned by the create_* tools).',
    inputSchema: {
      type: 'object',
      properties: { container_id: { type: 'string' } },
      required: ['container_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'instagram_create_image_post',
    description: `Publish a single-image feed post. ${CONFIRM_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: {
        image_url: { type: 'string', description: 'Publicly reachable HTTPS URL of a JPEG/PNG image.' },
        caption: CAPTION_SCHEMA,
        confirm: CONFIRM_SCHEMA,
      },
      required: ['image_url', 'confirm'],
      additionalProperties: false,
    },
  },
  {
    name: 'instagram_create_carousel',
    description: `Publish a carousel post of 2-10 images/videos. ${CONFIRM_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          minItems: 2,
          maxItems: 10,
          items: {
            type: 'object',
            properties: {
              image_url: { type: 'string' },
              video_url: { type: 'string' },
            },
            additionalProperties: false,
          },
          description: 'Each item must set exactly one of image_url or video_url.',
        },
        caption: CAPTION_SCHEMA,
        confirm: CONFIRM_SCHEMA,
      },
      required: ['items', 'confirm'],
      additionalProperties: false,
    },
  },
  {
    name: 'instagram_create_reel',
    description: `Publish a Reel. ${CONFIRM_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: {
        video_url: { type: 'string', description: 'Publicly reachable HTTPS URL of an MP4/MOV video.' },
        cover_url: { type: 'string', description: 'Optional cover image URL.' },
        caption: CAPTION_SCHEMA,
        share_to_feed: { type: 'boolean', description: 'Also show the Reel on the main feed (default true).' },
        confirm: CONFIRM_SCHEMA,
      },
      required: ['video_url', 'confirm'],
      additionalProperties: false,
    },
  },
  {
    name: 'instagram_create_story',
    description: `Publish a Story (image or video), if supported by the connected account. ${CONFIRM_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: {
        image_url: { type: 'string' },
        video_url: { type: 'string' },
        confirm: CONFIRM_SCHEMA,
      },
      required: ['confirm'],
      additionalProperties: false,
    },
  },
]

function textResult(text: string, isError?: boolean): ToolResult {
  return isError ? { content: [{ type: 'text', text }], isError: true } : { content: [{ type: 'text', text }] }
}

function jsonResult(data: unknown): ToolResult {
  return textResult(JSON.stringify(data, null, 2))
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new ValidationError('Tool arguments must be an object')
  }
  return value as Record<string, unknown>
}

function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError(`"${key}" is required and must be a non-empty string`)
  }
  return value
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string') {
    throw new ValidationError(`"${key}" must be a string`)
  }
  return value
}

const DEFAULT_INSIGHT_METRICS = ['reach', 'likes', 'comments', 'saved', 'shares']
const CONTAINER_POLL_ATTEMPTS = 10
const CONTAINER_POLL_DELAY_MS = 2000

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForContainerFinished(
  config: GraphConfig,
  containerId: string,
  fetchFn: FetchFn,
  attempts = CONTAINER_POLL_ATTEMPTS,
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    const { statusCode, status } = await getContainerStatus(config, containerId, fetchFn)
    if (statusCode === 'FINISHED') return
    if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
      throw new ValidationError(`Media container ${containerId} failed processing: ${status ?? statusCode}`)
    }
    await sleep(CONTAINER_POLL_DELAY_MS)
  }
  throw new ValidationError(`Media container ${containerId} did not finish processing in time`)
}

async function assertQuotaAvailable(config: GraphConfig, fetchFn: FetchFn): Promise<void> {
  const limit = await getPublishingLimit(config, fetchFn)
  if (limit.quotaUsage >= limit.configCapacity) {
    throw new ValidationError(
      `Instagram publishing quota exhausted (${limit.quotaUsage}/${limit.configCapacity} in the current ${limit.configDurationSeconds / 3600}h window). Try again later.`,
    )
  }
}

function describeApiError(error: unknown): string {
  if (error instanceof InstagramApiRequestError) {
    if (error.code === 4 || error.code === 32 || error.code === 613 || error.status === 429) {
      return `Instagram API rate limit reached: ${error.message}. Wait before retrying.`
    }
    return `Instagram API error (code ${error.code ?? 'unknown'}): ${error.message}`
  }
  if (error instanceof ValidationError) return error.message
  return error instanceof Error ? error.message : String(error)
}

async function withAudit(
  ctx: ToolContext,
  toolName: string,
  requestSummary: Record<string, unknown>,
  run: () => Promise<ToolResult>,
): Promise<ToolResult> {
  try {
    const result = await run()
    await ctx.logAudit({
      toolName,
      testMode: ctx.testMode,
      requestSummary,
      resultSummary: result.isError ? undefined : { content: result.content[0]?.text?.slice(0, 2000) },
      status: result.isError ? 'error' : 'success',
      errorMessage: result.isError ? result.content[0]?.text : undefined,
    })
    return result
  } catch (error) {
    const message = describeApiError(error)
    const status: AuditEntry['status'] = error instanceof ValidationError && message.startsWith('Confirmation required')
      ? 'rejected'
      : 'error'
    await ctx.logAudit({ toolName, testMode: ctx.testMode, requestSummary, status, errorMessage: message })
    return textResult(message, true)
  }
}

function requireConfirmation(args: Record<string, unknown>): void {
  if (args.confirm !== true) {
    throw new ValidationError(
      'Confirmation required: this call did not set confirm: true. Show the user the exact content first and only resend with confirm: true after they explicitly approve it.',
    )
  }
}

async function readAndValidateImage(url: string, fetchFn: FetchFn, fieldName: string): Promise<void> {
  validateMediaUrl(url, fieldName)
  const check = await checkRemoteMedia(url, fetchFn)
  validateImageMedia(check)
}

async function readAndValidateVideo(url: string, fetchFn: FetchFn, fieldName: string): Promise<void> {
  validateMediaUrl(url, fieldName)
  const check = await checkRemoteMedia(url, fetchFn)
  validateVideoMedia(check)
}

async function publishContainer(
  ctx: ToolContext,
  params: { mediaType: MediaType; caption?: string; imageUrl?: string; videoUrl?: string; coverUrl?: string; children?: string[]; shareToFeed?: boolean },
): Promise<{ containerId: string; mediaId?: string }> {
  const { containerId } = await createMediaContainer(ctx.graphConfig, {
    mediaType: params.mediaType,
    caption: params.caption,
    imageUrl: params.imageUrl,
    videoUrl: params.videoUrl,
    coverUrl: params.coverUrl,
    children: params.children,
    shareToFeed: params.shareToFeed,
  }, ctx.fetchFn)

  if (ctx.testMode) {
    return { containerId }
  }

  await waitForContainerFinished(ctx.graphConfig, containerId, ctx.fetchFn)
  const { mediaId } = await publishMediaContainer(ctx.graphConfig, containerId, ctx.fetchFn)
  return { containerId, mediaId }
}

export async function callTool(name: string, rawArgs: unknown, ctx: ToolContext): Promise<ToolResult> {
  try {
    return await dispatchTool(name, rawArgs, ctx)
  } catch (error) {
    // Anything thrown while parsing/validating arguments, before a
    // per-tool withAudit() wrapper was even entered (e.g. a malformed
    // caption or carousel item count), still needs to be logged and
    // returned as a normal tool error rather than crashing the JSON-RPC
    // handler.
    const message = describeApiError(error)
    const status: AuditEntry['status'] = message.startsWith('Confirmation required') ? 'rejected' : 'error'
    await ctx.logAudit({ toolName: name, testMode: ctx.testMode, requestSummary: safeSummary(rawArgs), status, errorMessage: message })
    return textResult(message, true)
  }
}

function safeSummary(rawArgs: unknown): Record<string, unknown> {
  if (typeof rawArgs !== 'object' || rawArgs === null) return {}
  const rest = { ...(rawArgs as Record<string, unknown>) }
  delete rest.confirm
  return rest
}

async function dispatchTool(name: string, rawArgs: unknown, ctx: ToolContext): Promise<ToolResult> {
  const args = asRecord(rawArgs ?? {})

  switch (name) {
    case 'instagram_get_account':
      return withAudit(ctx, name, {}, async () => jsonResult(await getAccountInfo(ctx.graphConfig, ctx.fetchFn)))

    case 'instagram_get_publishing_limit':
      return withAudit(ctx, name, {}, async () => jsonResult(await getPublishingLimit(ctx.graphConfig, ctx.fetchFn)))

    case 'instagram_list_recent_posts': {
      const limit = typeof args.limit === 'number' ? args.limit : 10
      return withAudit(ctx, name, { limit }, async () =>
        jsonResult(await listRecentMedia(ctx.graphConfig, limit, ctx.fetchFn)),
      )
    }

    case 'instagram_get_post_insights': {
      const mediaId = requireString(args, 'media_id')
      const metrics = Array.isArray(args.metrics) && args.metrics.every((m) => typeof m === 'string')
        ? (args.metrics as string[])
        : DEFAULT_INSIGHT_METRICS
      return withAudit(ctx, name, { media_id: mediaId, metrics }, async () =>
        jsonResult(await getMediaInsights(ctx.graphConfig, mediaId, metrics, ctx.fetchFn)),
      )
    }

    case 'instagram_get_publish_status': {
      const containerId = requireString(args, 'container_id')
      return withAudit(ctx, name, { container_id: containerId }, async () =>
        jsonResult(await getContainerStatus(ctx.graphConfig, containerId, ctx.fetchFn)),
      )
    }

    case 'instagram_create_image_post': {
      const imageUrl = requireString(args, 'image_url')
      const caption = validateCaption(optionalString(args, 'caption'))
      const summary = { image_url: imageUrl, caption }
      return withAudit(ctx, name, summary, async () => {
        requireConfirmation(args)
        await readAndValidateImage(imageUrl, ctx.fetchFn, 'image_url')
        await assertQuotaAvailable(ctx.graphConfig, ctx.fetchFn)
        const result = await publishContainer(ctx, { mediaType: 'IMAGE', caption, imageUrl })
        return jsonResult({ testMode: ctx.testMode, ...result })
      })
    }

    case 'instagram_create_carousel': {
      const items = Array.isArray(args.items) ? args.items : []
      validateCarouselItemCount(items.length)
      const caption = validateCaption(optionalString(args, 'caption'))
      const summary = { item_count: items.length, caption }
      return withAudit(ctx, name, summary, async () => {
        requireConfirmation(args)
        await assertQuotaAvailable(ctx.graphConfig, ctx.fetchFn)

        const childIds: string[] = []
        for (const rawItem of items) {
          const item = asRecord(rawItem)
          const imageUrl = optionalString(item, 'image_url')
          const videoUrl = optionalString(item, 'video_url')
          if (!imageUrl && !videoUrl) {
            throw new ValidationError('Each carousel item needs image_url or video_url')
          }
          if (imageUrl && videoUrl) {
            throw new ValidationError('Each carousel item must set only one of image_url or video_url')
          }
          if (imageUrl) await readAndValidateImage(imageUrl, ctx.fetchFn, 'image_url')
          if (videoUrl) await readAndValidateVideo(videoUrl, ctx.fetchFn, 'video_url')

          if (ctx.testMode) {
            childIds.push(`test-child-${childIds.length + 1}`)
            continue
          }

          const { containerId } = await createMediaContainer(
            ctx.graphConfig,
            { mediaType: imageUrl ? 'IMAGE' : 'REELS', imageUrl, videoUrl, isCarouselItem: true },
            ctx.fetchFn,
          )
          await waitForContainerFinished(ctx.graphConfig, containerId, ctx.fetchFn)
          childIds.push(containerId)
        }

        const result = await publishContainer(ctx, { mediaType: 'CAROUSEL', caption, children: childIds })
        return jsonResult({ testMode: ctx.testMode, ...result })
      })
    }

    case 'instagram_create_reel': {
      const videoUrl = requireString(args, 'video_url')
      const coverUrl = optionalString(args, 'cover_url')
      const caption = validateCaption(optionalString(args, 'caption'))
      const shareToFeed = typeof args.share_to_feed === 'boolean' ? args.share_to_feed : undefined
      const summary = { video_url: videoUrl, caption }
      return withAudit(ctx, name, summary, async () => {
        requireConfirmation(args)
        await readAndValidateVideo(videoUrl, ctx.fetchFn, 'video_url')
        if (coverUrl) validateMediaUrl(coverUrl, 'cover_url')
        await assertQuotaAvailable(ctx.graphConfig, ctx.fetchFn)
        const result = await publishContainer(ctx, { mediaType: 'REELS', caption, videoUrl, coverUrl, shareToFeed })
        return jsonResult({ testMode: ctx.testMode, ...result })
      })
    }

    case 'instagram_create_story': {
      const imageUrl = optionalString(args, 'image_url')
      const videoUrl = optionalString(args, 'video_url')
      if (!imageUrl && !videoUrl) {
        throw new ValidationError('instagram_create_story requires image_url or video_url')
      }
      if (imageUrl && videoUrl) {
        throw new ValidationError('instagram_create_story accepts only one of image_url or video_url')
      }
      const summary = { image_url: imageUrl, video_url: videoUrl }
      return withAudit(ctx, name, summary, async () => {
        requireConfirmation(args)
        if (imageUrl) await readAndValidateImage(imageUrl, ctx.fetchFn, 'image_url')
        if (videoUrl) await readAndValidateVideo(videoUrl, ctx.fetchFn, 'video_url')
        await assertQuotaAvailable(ctx.graphConfig, ctx.fetchFn)
        const result = await publishContainer(ctx, { mediaType: 'STORIES', imageUrl, videoUrl })
        return jsonResult({ testMode: ctx.testMode, ...result })
      })
    }

    default:
      return textResult(`Unknown tool: ${name}`, true)
  }
}
