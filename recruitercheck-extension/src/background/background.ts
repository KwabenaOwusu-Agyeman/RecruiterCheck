import { WEB_APP_URL } from '@/config'
import { connect, disconnect, getSessionInfo } from '@/background/auth'
import { submitJobCapture } from '@/background/api'
import { trackEvent } from '@/background/analytics'
import type { CaptureResult, JobCapture } from '@/shared/types'

type Message =
  | { type: 'GET_SESSION' }
  | { type: 'CONNECT' }
  | { type: 'DISCONNECT' }
  | { type: 'CAPTURE_ACTIVE_TAB' }
  | { type: 'SUBMIT_CAPTURE'; capture: JobCapture }

// The only entry points into the extension's session/capture logic — the
// popup never talks to chrome.identity, chrome.scripting, or Supabase
// directly, so every privileged action is funneled through this one
// message router and stays out of the UI layer.
chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  void handleMessage(message).then(sendResponse)
  return true
})

async function handleMessage(message: Message): Promise<unknown> {
  switch (message.type) {
    case 'GET_SESSION':
      return getSessionInfo()

    case 'CONNECT':
      try {
        await connect()
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Could not connect.' }
      }

    case 'DISCONNECT':
      await disconnect()
      return { ok: true }

    case 'CAPTURE_ACTIVE_TAB':
      return captureActiveTab()

    case 'SUBMIT_CAPTURE':
      return submitCapture(message.capture)

    default:
      return { ok: false, error: 'Unknown message' }
  }
}

async function captureActiveTab(): Promise<
  { ok: true; result: CaptureResult } | { ok: false; error: string }
> {
  trackEvent('extension_capture_started')

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || !tab.url || !/^https?:\/\//.test(tab.url)) {
    trackEvent('extension_capture_failed')
    return { ok: false, error: "We couldn't confidently read this job." }
  }

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['contentScript.js'] })
    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => (window as unknown as { __recruiterCheckCapture: CaptureResult }).__recruiterCheckCapture,
    })
    const capture = injectionResults[0]?.result
    if (!capture) {
      trackEvent('extension_capture_failed')
      return { ok: false, error: "We couldn't confidently read this job." }
    }
    trackEvent(capture.ok ? 'extension_capture_success' : 'extension_capture_failed')
    return { ok: true, result: capture }
  } catch {
    trackEvent('extension_capture_failed')
    return { ok: false, error: "We couldn't confidently read this job." }
  }
}

async function submitCapture(
  capture: JobCapture,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const captureId = await submitJobCapture(capture)
    trackEvent('extension_capture_confirmed', capture.sourceDomain)
    const url = `${WEB_APP_URL}/checks/new?capture=${encodeURIComponent(captureId)}`
    await chrome.tabs.create({ url })
    return { ok: true, url }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "We couldn't send this job to RecruiterCheck. Try again.",
    }
  }
}
