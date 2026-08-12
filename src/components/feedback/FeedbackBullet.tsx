export function getVerdictColor(score: number): string {
  if (score >= 85) return 'text-success'
  if (score >= 50) return 'text-warning'
  return 'text-error'
}

/**
 * Strengths and areas to improve are written server side as a short
 * finding/action, then evidence, then (for some areas to improve) a
 * trailing " Example: ..." clause. This pulls the example out first, then
 * splits the remaining text on the first sentence boundary so the finding
 * can render bold, the evidence as normal text, and the example as its own
 * visually separated line (the Tell -> Show structure). Decimal points
 * (e.g. "7.2%") are protected first so a stat never gets mistaken for a
 * sentence break.
 */
export function splitFinding(text: string): { title: string; evidence: string; example: string } {
  const DECIMAL_MARK = '@@DECIMAL@@'
  const protectedText = text.replace(/(\d)\.(\d)/g, `$1${DECIMAL_MARK}$2`)
  const restore = (value: string) => value.split(DECIMAL_MARK).join('.')

  const exampleMatch = protectedText.match(/^([\s\S]*?)\s*Example:\s*([\s\S]*)$/)
  const mainText = exampleMatch ? exampleMatch[1] : protectedText
  const example = exampleMatch ? restore(exampleMatch[2].trim()) : ''

  const match = mainText.match(/^([^.!?]+[.!?])\s*([\s\S]*)$/)
  if (!match) return { title: restore(mainText.trim()), evidence: '', example }
  return { title: restore(match[1].trim()), evidence: restore(match[2].trim()), example }
}

export function FeedbackBullet({ text }: { text: string }) {
  const { title, evidence, example } = splitFinding(text)
  return (
    <li className="flex gap-2">
      <span className="text-blue" aria-hidden="true">
        •
      </span>
      <span className="text-sm leading-snug text-text-secondary">
        <span className="font-semibold text-text-primary">{title}</span>
        {evidence ? ` ${evidence}` : null}
        {example ? <span className="block mt-1 italic">Example: &quot;{example}&quot;</span> : null}
      </span>
    </li>
  )
}
