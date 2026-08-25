// Minimal MCP (Model Context Protocol) JSON-RPC 2.0 handling: just enough
// of the spec for a tools-only remote server (initialize, tools/list,
// tools/call, ping) reached over the Streamable HTTP transport's single
// POST endpoint. No SSE/session-id machinery: every request gets exactly
// one JSON response, which the spec allows for servers that never need to
// push unsolicited messages to the client.
import { callTool, TOOLS, type ToolContext } from './logic.ts'

export const MCP_PROTOCOL_VERSION = '2025-06-18'

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: unknown
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

const INVALID_REQUEST = -32600
const METHOD_NOT_FOUND = -32601
const INVALID_PARAMS = -32602
const INTERNAL_ERROR = -32603

function errorResponse(id: string | number | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

function resultResponse(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result }
}

// Returns null for JSON-RPC notifications (no `id`), which per spec get no
// response at all.
export async function handleRequest(request: unknown, ctx: ToolContext): Promise<JsonRpcResponse | null> {
  if (typeof request !== 'object' || request === null || Array.isArray(request)) {
    return errorResponse(null, INVALID_REQUEST, 'Request must be a JSON-RPC 2.0 object')
  }

  const { jsonrpc, id, method, params } = request as Partial<JsonRpcRequest>
  const responseId = id === undefined ? null : id

  if (jsonrpc !== '2.0' || typeof method !== 'string') {
    return errorResponse(responseId, INVALID_REQUEST, 'Request must set jsonrpc: "2.0" and a string method')
  }

  const isNotification = id === undefined

  try {
    switch (method) {
      case 'initialize':
        if (isNotification) return null
        return resultResponse(responseId, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: 'myrecruitercheck-instagram-mcp', version: '1.0.0' },
        })

      case 'notifications/initialized':
      case 'notifications/cancelled':
        return null

      case 'ping':
        if (isNotification) return null
        return resultResponse(responseId, {})

      case 'tools/list':
        if (isNotification) return null
        return resultResponse(responseId, { tools: TOOLS })

      case 'tools/call': {
        if (isNotification) return null
        const callParams = params as { name?: string; arguments?: unknown } | undefined
        if (!callParams || typeof callParams.name !== 'string') {
          return errorResponse(responseId, INVALID_PARAMS, 'params.name (tool name) is required')
        }
        if (!TOOLS.some((tool) => tool.name === callParams.name)) {
          return errorResponse(responseId, INVALID_PARAMS, `Unknown tool: ${callParams.name}`)
        }
        const result = await callTool(callParams.name, callParams.arguments, ctx)
        return resultResponse(responseId, result)
      }

      default:
        if (isNotification) return null
        return errorResponse(responseId, METHOD_NOT_FOUND, `Unknown method: ${method}`)
    }
  } catch (error) {
    if (isNotification) return null
    const message = error instanceof Error ? error.message : String(error)
    return errorResponse(responseId, INTERNAL_ERROR, message)
  }
}

// The Streamable HTTP transport allows a single POST body to be either one
// request or a batch (array) of requests/notifications.
export async function handleBody(body: unknown, ctx: ToolContext): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
  if (Array.isArray(body)) {
    const responses = (await Promise.all(body.map((item) => handleRequest(item, ctx)))).filter(
      (response): response is JsonRpcResponse => response !== null,
    )
    return responses.length > 0 ? responses : null
  }
  return handleRequest(body, ctx)
}
