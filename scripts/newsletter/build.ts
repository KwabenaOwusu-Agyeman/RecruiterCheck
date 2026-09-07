// Builds one weekly issue and writes Brevo ready HTML beside the input.
//
//   npx tsx scripts/newsletter/build.ts scripts/newsletter/week37.json
//
// Then paste the HTML into Brevo: Campaigns > Email > Design > Paste your code.
//
// The weekly JSON holds the postings, which are a list of links and belong in
// JSON, and names the two prose pieces, which live in
// content/newsletter/pieces as markdown because nobody should write two hundred
// words inside a JSON string.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadPiece } from './piece.ts'
import {
  WORDS_PER_MINUTE,
  WORD_BUDGET,
  countIssueWords,
  renderIssue,
  validateIssue,
  type Issue,
  type JobPosting,
} from './issue.ts'

/** Where /newsletter/ images are served from, so an inbox can load them. */
const SITE_URL = 'https://myrecruitercheck.com'

interface Frame {
  week: number
  period: string
  greeting: string
  intro: string
  postings: JobPosting[]
  /** Filenames under content/newsletter/pieces, without the extension. */
  rejection: string
  trends: string
  cta: Issue['cta']
  signOff: Issue['signOff']
}

const input = process.argv[2]
if (!input) {
  console.error('Usage: npx tsx scripts/newsletter/build.ts <issue.json>')
  process.exit(1)
}

const frame = JSON.parse(readFileSync(input, 'utf8')) as Frame
const problems: string[] = []

/** An email client has no origin, so a repo path has to be made absolute. */
function absolute(image?: { url: string; alt: string }) {
  if (!image) return undefined
  return { alt: image.alt, url: /^https:\/\//.test(image.url) ? image.url : `${SITE_URL}${image.url}` }
}

function piece(name: string, label: string) {
  let source: string
  try {
    source = readFileSync(join('content/newsletter/pieces', `${name}.md`), 'utf8')
  } catch {
    problems.push(`${label}: content/newsletter/pieces/${name}.md not found.`)
    return null
  }
  const result = loadPiece(name, source)
  problems.push(...result.problems)
  if (!result.piece) return null
  return { ...result.piece, image: absolute(result.piece.image) }
}

const rejection = piece(frame.rejection, 'rejection')
const trends = piece(frame.trends, 'trends')

const issue: Issue | null =
  rejection && trends
    ? {
        week: frame.week,
        period: frame.period,
        greeting: frame.greeting,
        intro: frame.intro,
        postings: frame.postings ?? [],
        rejection,
        trends,
        cta: frame.cta,
        signOff: frame.signOff,
      }
    : null

if (issue) problems.push(...validateIssue(issue))

if (problems.length > 0 || !issue) {
  console.error(`\n${input} cannot be sent:\n`)
  for (const problem of problems) console.error(`  ${problem}`)
  console.error('')
  process.exit(1)
}

const output = input.replace(/\.json$/, '.html')
writeFileSync(output, renderIssue(issue))

console.log(`Wrote ${output}`)
const total = countIssueWords(issue)
console.log(
  `  week ${issue.week}: ${issue.postings.length} postings, rejection ${rejection.wordCount} words, trends ${trends.wordCount} words`,
)
console.log(
  `  whole issue: ${total} words, about ${(total / WORDS_PER_MINUTE).toFixed(1)} min (budget ${WORD_BUDGET})`,
)
// Warnings do not stop a build. A piece slightly under length is still
// publishable, and blocking on a word count would put the format ahead of the
// writing.
console.log('  Paste into Brevo: Campaigns > Email > Design > Paste your code')
