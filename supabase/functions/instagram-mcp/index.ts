// Remote MCP server exposing narrowly-scoped Instagram publishing/reading
// tools to Claude over the Streamable HTTP transport (single POST endpoint,
// JSON-RPC 2.0 body — see protocol.ts). Authenticated with a bearer token
// (MCP_SERVER_TOKEN) distinct from the Instagram access token itself, so
// this endpoint's own exposure is a separate secret from the Instagram
// connection it wraps.
//
// verify_jwt is OFF for this function in supabase/config.toml — Claude's
// remote MCP connector sends its own bearer token, not a Supabase JWT, so
// Supabase's built-in JWT gate would reject every legitimate call. Auth is
// enforced explicitly below instead.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { handleBody, type JsonRpcResponse } from './protocol.ts'
import type { AuditEntry, ToolContext } from './logic.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok')
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const mcpServerToken = Deno.env.get('MCP_SERVER_TOKEN')
  const graphApiVersion = Deno.env.get('GRAPH_API_VERSION')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  // Defaults to true on purpose: a missing/misconfigured env var must fail
  // safe into "cannot publish", never silently start publishing for real.
  const testMode = Deno.env.get('INSTAGRAM_TEST_MODE') !== 'false'

  if (!mcpServerToken || !graphApiVersion || !supabaseUrl || !serviceRoleKey) {
    console.error('instagram-mcp: missing required environment variables')
    return jsonResponse(500, { error: 'Server not configured' })
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const expected = `Bearer ${mcpServerToken}`
  if (!timingSafeEqual(authHeader, expected)) {
    return jsonResponse(401, { error: 'Unauthorized' })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse(400, {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Invalid JSON body' },
    })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const { data: connection, error: connectionError } = await adminClient
    .from('instagram_connection')
    .select('ig_user_id, access_token')
    .eq('id', true)
    .maybeSingle()

  if (connectionError) {
    console.error('instagram-mcp: failed to load connection', connectionError)
    return jsonResponse(500, { error: 'Failed to load Instagram connection' })
  }

  if (!connection) {
    return jsonResponse(200, rpcErrorForMissingConnection(body))
  }

  const logAudit = async (entry: AuditEntry) => {
    const { error } = await adminClient.from('instagram_audit_log').insert({
      tool_name: entry.toolName,
      test_mode: entry.testMode,
      request_summary: entry.requestSummary,
      result_summary: entry.resultSummary ?? null,
      status: entry.status,
      error_message: entry.errorMessage ?? null,
    })
    if (error) console.error('instagram-mcp: failed to write audit log', error)
  }

  const ctx: ToolContext = {
    graphConfig: { accessToken: connection.access_token, igUserId: connection.ig_user_id, graphApiVersion },
    testMode,
    fetchFn: fetch,
    logAudit,
  }

  const response = await handleBody(body, ctx)
  if (response === null) {
    // Pure notification(s) — Streamable HTTP transport expects 202 Accepted
    // with no body in this case.
    return new Response(null, { status: 202 })
  }

  return jsonResponse(200, response)
})

function rpcErrorForMissingConnection(body: unknown): JsonRpcResponse | JsonRpcResponse[] {
  const id = typeof body === 'object' && body !== null && 'id' in body ? (body as { id: unknown }).id : null
  const error = {
    jsonrpc: '2.0' as const,
    id: (id ?? null) as string | number | null,
    error: { code: -32000, message: 'No Instagram account is connected yet. Complete instagram-oauth-start first.' },
  }
  return error
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
