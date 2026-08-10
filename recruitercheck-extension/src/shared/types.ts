// Shared across capture/, background/, and popup/. Kept dependency-free
// (no chrome.* types, no DOM-only APIs beyond what capture/ already needs)
// so this file is portable to any WebExtension-compatible browser.

export type SourceDomain = 'linkedin' | 'indeed' | 'other'

export interface JobCapture {
  jobTitle: string | null
  companyName: string | null
  jobDescription: string
  jobUrl: string
  sourceDomain: SourceDomain
  confidence: number
}

export interface CaptureFailure {
  reason: 'low_confidence' | 'no_description'
}

export type CaptureResult = { ok: true; capture: JobCapture } | { ok: false; failure: CaptureFailure }

export interface StoredSession {
  accessToken: string
  refreshToken: string
  expiresAt: number
  email: string
}
