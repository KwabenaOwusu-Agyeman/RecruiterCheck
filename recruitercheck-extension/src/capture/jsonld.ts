import { cleanText } from '@/capture/detect'

export interface JobPostingJsonLd {
  title: string | null
  companyName: string | null
  description: string | null
}

// Strips HTML from a JSON-LD `description` field (often HTML per schema.org
// convention) via regex only — never innerHTML/DOMParser on untrusted
// content, so there is no code-execution surface regardless of what the
// page embeds.
function stripHtml(html: string): string {
  return cleanText(
    html
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|li|div)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"'),
  )
}

function findJobPosting(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJobPosting(item)
      if (found) return found
    }
    return null
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const type = obj['@type']
    const typeMatches =
      (typeof type === 'string' && type.toLowerCase() === 'jobposting') ||
      (Array.isArray(type) && type.some((t) => typeof t === 'string' && t.toLowerCase() === 'jobposting'))
    if (typeMatches) return obj
    if ('@graph' in obj) return findJobPosting(obj['@graph'])
  }
  return null
}

export function extractJobPostingJsonLd(doc: Document): JobPostingJsonLd | null {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]')

  for (const script of Array.from(scripts)) {
    let parsed: unknown
    try {
      parsed = JSON.parse(script.textContent ?? '')
    } catch {
      continue
    }

    const posting = findJobPosting(parsed)
    if (!posting) continue

    const title = typeof posting.title === 'string' ? cleanText(posting.title) : null

    let companyName: string | null = null
    const org = posting.hiringOrganization
    if (org && typeof org === 'object' && typeof (org as Record<string, unknown>).name === 'string') {
      companyName = cleanText((org as Record<string, unknown>).name as string)
    }

    const description =
      typeof posting.description === 'string' ? stripHtml(posting.description) : null

    if (!description) continue

    return { title, companyName, description }
  }

  return null
}
