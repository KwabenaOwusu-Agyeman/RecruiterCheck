import { WEB_APP_URL } from '@/config'
import type { CaptureResult, JobCapture } from '@/shared/types'

type SessionInfo = { connected: boolean; email: string | null }
type CaptureTabResponse = { ok: true; result: CaptureResult } | { ok: false; error: string }
type SubmitResponse = { ok: true; url: string } | { ok: false; error: string }
type ConnectResponse = { ok: true } | { ok: false; error: string }

type ViewState =
  | { kind: 'loading' }
  | { kind: 'not_connected' }
  | { kind: 'connecting' }
  | { kind: 'connect_error'; message: string }
  | { kind: 'ready' }
  | { kind: 'capturing' }
  | { kind: 'preview'; capture: JobCapture }
  | { kind: 'capture_failed' }
  | { kind: 'submitting' }
  | { kind: 'submit_error'; message: string; reconnect: boolean }
  | { kind: 'submitted' }

const root = document.getElementById('root')!

function sendMessage<T>(message: Record<string, unknown>): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>
}

function render(state: ViewState): void {
  root.innerHTML = ''

  switch (state.kind) {
    case 'loading':
      root.appendChild(textNode('Loading…'))
      break

    case 'not_connected':
      root.appendChild(
        buildScreen({
          tagline: "See your application from a recruiter's perspective.",
          primaryLabel: 'Connect MyRecruiterCheck',
          onPrimary: onConnect,
        }),
      )
      break

    case 'connecting':
      root.appendChild(textNode('Connecting…'))
      break

    case 'connect_error':
      root.appendChild(
        buildScreen({
          errorMessage: state.message,
          primaryLabel: 'Connect MyRecruiterCheck',
          onPrimary: onConnect,
        }),
      )
      break

    case 'ready':
      root.appendChild(
        buildScreen({
          tagline: "See your application from a recruiter's perspective.",
          primaryLabel: 'Capture this job',
          onPrimary: onCapture,
        }),
      )
      break

    case 'capturing':
      root.appendChild(textNode('Reading this job…'))
      break

    case 'preview': {
      const { capture } = state
      const wrap = document.createElement('div')

      if (capture.jobTitle) {
        const label = document.createElement('p')
        label.className = 'field-label'
        label.textContent = 'Job title'
        wrap.appendChild(label)

        const title = document.createElement('p')
        title.className = 'job-title'
        title.textContent = capture.jobTitle
        wrap.appendChild(title)
      }

      if (capture.companyName) {
        const company = document.createElement('p')
        company.className = 'job-company'
        company.textContent = capture.companyName
        wrap.appendChild(company)
      }

      const status = document.createElement('p')
      status.className = 'status-line'
      status.textContent = 'Job description captured ✓'
      wrap.appendChild(status)

      const primary = document.createElement('button')
      primary.className = 'btn btn-primary'
      primary.textContent = 'Check this job'
      primary.addEventListener('click', () => void onSubmit(capture))
      wrap.appendChild(primary)

      root.appendChild(wrap)
      break
    }

    case 'capture_failed':
      root.appendChild(
        buildScreen({
          tagline: "We couldn't confidently read this job.",
          primaryLabel: 'Open MyRecruiterCheck',
          onPrimary: onOpenNewCheck,
        }),
      )
      break

    case 'submitting':
      root.appendChild(textNode('Sending to MyRecruiterCheck…'))
      break

    case 'submit_error':
      root.appendChild(
        buildScreen({
          errorMessage: state.message,
          primaryLabel: state.reconnect ? 'Reconnect MyRecruiterCheck' : 'Try again',
          onPrimary: state.reconnect ? onConnect : onCapture,
        }),
      )
      break

    case 'submitted':
      root.appendChild(textNode('Opened in MyRecruiterCheck. You can close this popup.'))
      break
  }
}

function textNode(text: string): HTMLElement {
  const p = document.createElement('p')
  p.className = 'center-text'
  p.textContent = text
  return p
}

function buildScreen(opts: {
  tagline?: string
  errorMessage?: string
  primaryLabel: string
  onPrimary: () => void
}): HTMLElement {
  const wrap = document.createElement('div')

  if (opts.tagline) {
    const p = document.createElement('p')
    p.className = 'tagline'
    p.textContent = opts.tagline
    wrap.appendChild(p)
  }

  if (opts.errorMessage) {
    const box = document.createElement('div')
    box.className = 'error-box'
    box.textContent = opts.errorMessage
    wrap.appendChild(box)
  }

  const button = document.createElement('button')
  button.className = 'btn btn-primary'
  button.textContent = opts.primaryLabel
  button.addEventListener('click', opts.onPrimary)
  wrap.appendChild(button)

  return wrap
}

async function onConnect(): Promise<void> {
  render({ kind: 'connecting' })
  const response = await sendMessage<ConnectResponse>({ type: 'CONNECT' })
  if (response.ok) {
    render({ kind: 'ready' })
  } else {
    render({ kind: 'connect_error', message: response.error })
  }
}

async function onCapture(): Promise<void> {
  render({ kind: 'capturing' })
  const response = await sendMessage<CaptureTabResponse>({ type: 'CAPTURE_ACTIVE_TAB' })

  if (!response.ok) {
    render({ kind: 'capture_failed' })
    return
  }

  if (response.result.ok) {
    render({ kind: 'preview', capture: response.result.capture })
  } else {
    render({ kind: 'capture_failed' })
  }
}

async function onSubmit(capture: JobCapture): Promise<void> {
  render({ kind: 'submitting' })
  const response = await sendMessage<SubmitResponse>({ type: 'SUBMIT_CAPTURE', capture })

  if (response.ok) {
    render({ kind: 'submitted' })
    return
  }

  const reconnect = response.error === 'Unauthorized'
  render({
    kind: 'submit_error',
    message: reconnect
      ? 'Your MyRecruiterCheck connection expired.'
      : response.error,
    reconnect,
  })
}

function onOpenNewCheck(): void {
  chrome.tabs.create({ url: `${WEB_APP_URL}/checks/new` })
}

async function init(): Promise<void> {
  render({ kind: 'loading' })
  const session = await sendMessage<SessionInfo>({ type: 'GET_SESSION' })
  render(session.connected ? { kind: 'ready' } : { kind: 'not_connected' })
}

void init()
