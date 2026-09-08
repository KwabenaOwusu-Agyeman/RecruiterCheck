// Run with: OPENAI_API_KEY=<key> npx tsx scripts/newsletter/dry-run.ts
//           npx tsx scripts/newsletter/dry-run.ts --no-model
//           npx tsx scripts/newsletter/dry-run.ts --offline
//
// Runs the whole weekly newsletter pipeline the way publish-weekly-newsletter
// runs it, and writes the resulting issue to .scratch/newsletter-dry-run.html
// for you to open.
//
// It exists because the edge function cannot be verified without deploying it,
// and deploying to verify is off limits. Every decision the function makes is
// in logic.ts, so this script drives that same code over the same live feeds
// with the same prompt and the same validator. What it cannot cover is the
// service-role auth check, the Supabase reads and writes, and the Brevo call.
//
// Local only. Talks to remotive.com, arbeitnow.com and api.openai.com, and
// nothing else: no Supabase, no database, no storage, no Brevo, no candidate
// data, and no email reaches anybody. The job feeds are public and keyless.
// The API key is read from this process's environment and is never printed.
// --no-model fetches the real feeds but skips the model, so you can see the
// week's actual roles and the real layout without a key and without spending
// anything. The prose is placeholder; everything else is what would be sent.
//
// --offline skips both the feeds and OpenAI, using invented postings and
// invented copy, so the assembly and rendering can be exercised with no key
// and no network at all. That is the form the repo's checks run.

import { mkdirSync, writeFileSync } from 'node:fs'
import { countIssueWords, renderIssue, validateIssue, type Issue } from '../../supabase/functions/_shared/newsletter/issue.ts'
import { loadPiece } from '../../supabase/functions/_shared/newsletter/piece.ts'
import {
  FEEDS,
  REQUIRED_POSTINGS,
  absolutise,
  angleForWeek,
  buildGenerationRequestBody,
  buildPieceSource,
  imagesForWeek,
  isoWeek,
  nextMondayNineAm,
  parseArbeitnow,
  parseGeneration,
  parseRemotive,
  periodLabel,
  parseBoard,
  selectPostings,
  toPostings,
  type FeedItem,
  type Generated,
} from '../../supabase/functions/publish-weekly-newsletter/logic.ts'
import { BOARDS, boardUrl, type Region } from '../../supabase/functions/publish-weekly-newsletter/boards.ts'

const offline = process.argv.includes('--offline')
/** Real feeds, placeholder prose. A preview that costs nothing. */
const noModel = process.argv.includes('--no-model')
// .scratch/ is already gitignored, so a preview never becomes an accidental
// commit and no .gitignore change is needed to keep it out.
const OUT = '.scratch/newsletter-dry-run.html'

const OFFLINE_ITEMS: FeedItem[] = [
  { role: 'Machine Learning Engineer', company: 'An employer', location: 'Amsterdam', url: 'https://example.com/1' },
  { role: 'Data Scientist', company: 'Another employer', location: 'Remote', url: 'https://example.com/2' },
  { role: 'LLM Engineer', company: 'A third', location: 'Rotterdam', url: 'https://example.com/3' },
  { role: 'Backend Engineer', company: 'A fourth', location: 'Utrecht', url: 'https://example.com/4' },
  { role: 'Platform Engineer', company: 'A fifth', location: 'Remote', url: 'https://example.com/5' },
]

const OFFLINE_COPY: Generated = {
  subject: 'Five roles, and the line that lost it',
  intro: 'Five roles worth a look, one reason applications die, and what changed in job descriptions.',
  postingNotes: ['Names its stack up front', 'Junior friendly', 'Small team, broad remit',
    'Pays above the band', 'No take home exercise'],
  rejection: {
    heading: 'You were rejected before anyone reached your second page',
    body: 'Your CV was open for eleven seconds. The reader was looking for one thing the posting asked for, and it was not in the top half of your first page.\n\nThey did not decide you could not do the job. They decided they could not tell.',
  },
  trends: {
    heading: 'Postings stopped asking for machine learning and started naming the stack',
    body: 'Descriptions now name the framework, the warehouse and the orchestration layer. A team naming its stack is describing a system that already exists, and telling you which evidence it will recognise.',
  },
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`${url} returned ${response.status}`)
  return response.json()
}

async function main() {
  const now = new Date()
  const { year, week } = isoWeek(now)
  const images = imagesForWeek(week)
  const angle = angleForWeek(week)

  console.log(`Week ${week} of ${year}`)
  console.log(`Angle: ${angle.slice(0, 70)}...`)

  // 1. Postings
  let items: FeedItem[]
  if (offline) {
    items = OFFLINE_ITEMS
    console.log('\nOffline: using invented postings.')
  } else {
    const [remotive, arbeitnow] = await Promise.all([
      getJson(FEEDS.remotive).then(parseRemotive).catch((e) => {
        console.warn(`  Remotive unavailable: ${e.message}`)
        return [] as FeedItem[]
      }),
      getJson(FEEDS.arbeitnow).then(parseArbeitnow).catch((e) => {
        console.warn(`  Arbeitnow unavailable: ${e.message}`)
        return [] as FeedItem[]
      }),
    ])
    // The company boards, in small batches. The open feeds return nothing for
    // Africa or India, so without these two of the five regions stay empty.
    const entries = Object.entries(BOARDS).flatMap(([region, boards]) =>
      boards.map((board) => ({ board, region: region as Region })),
    )
    const boardItems: FeedItem[] = []
    for (let i = 0; i < entries.length; i += 6) {
      const batch = await Promise.all(
        entries.slice(i, i + 6).map(({ board, region }) =>
          getJson(boardUrl(board))
            .then((payload) => parseBoard(board, region, payload))
            .catch(() => [] as FeedItem[]),
        ),
      )
      boardItems.push(...batch.flat())
    }

    console.log(
      `\nFeeds: ${remotive.length} from Remotive, ${arbeitnow.length} from Arbeitnow, ` +
        `${boardItems.length} from ${entries.length} company boards.`,
    )
    items = [...remotive, ...arbeitnow, ...boardItems]
  }

  const postings = selectPostings(items, [])
  if (postings.length < REQUIRED_POSTINGS) {
    console.error(`\nFAIL: only ${postings.length} usable postings, need ${REQUIRED_POSTINGS}.`)
    process.exit(1)
  }
  console.log(`\nRegions covered: ${postings.map((p) => p.region ?? 'unplaced').join(', ')}`)
  console.log('\nSelected:')
  for (const p of postings) console.log(`  ${p.role} at ${p.company}, ${p.location}`)

  // 2. Copy, with the same two attempt retry the function uses.
  let generated: Generated | null = null
  let issue: Issue | null = null
  let lastProblem: string | null = null

  for (let attempt = 0; attempt < 2 && !issue; attempt += 1) {
    if (offline || noModel) {
      // Placeholder prose, but the postings below are this week's real ones,
      // so the layout, the length and the roles are exactly what would send.
      generated = {
        ...OFFLINE_COPY,
        postingNotes: postings.map((_, i) => OFFLINE_COPY.postingNotes[i] ?? 'Worth a look'),
      }
    } else {
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) {
        console.error('\nOPENAI_API_KEY is not set. Use --offline to run without it.')
        process.exit(1)
      }
      if (attempt > 0) console.log(`\nRetrying: ${lastProblem}`)
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(buildGenerationRequestBody(postings, angle, [], lastProblem)),
      })
      if (!response.ok) {
        lastProblem = `OpenAI returned ${response.status}`
        continue
      }
      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
      try {
        generated = parseGeneration(JSON.parse(payload.choices?.[0]?.message?.content ?? 'null'), REQUIRED_POSTINGS)
      } catch (error) {
        lastProblem = error instanceof Error ? error.message : String(error)
        continue
      }
    }

    const rejection = loadPiece('rejection', buildPieceSource(generated.rejection.heading, images.rejection, generated.rejection.body))
    const trends = loadPiece('trends', buildPieceSource(generated.trends.heading, images.trends, generated.trends.body))
    if (!rejection.piece || !trends.piece) {
      lastProblem = [...rejection.problems, ...trends.problems].join(' ')
      continue
    }

    const candidate: Issue = {
      week,
      period: periodLabel(now),
      greeting: 'Hi {{ contact.FIRSTNAME }},',
      intro: generated.intro,
      postings: toPostings(postings, generated.postingNotes),
      rejection: { ...rejection.piece, image: rejection.piece.image && { ...rejection.piece.image, url: absolutise(rejection.piece.image.url) } },
      trends: { ...trends.piece, image: trends.piece.image && { ...trends.piece.image, url: absolutise(trends.piece.image.url) } },
      cta: {
        heading: 'Find out which line lost it',
        body: 'Run your CV against the job you want, before you send it.',
        label: 'Check',
        url: absolutise('/'),
      },
      signOff: { name: 'Kwabena', role: 'Founder of MyRecruiterCheck' },
    }

    const problems = validateIssue(candidate)
    if (problems.length > 0) {
      lastProblem = problems.join(' ')
      continue
    }
    issue = candidate
  }

  if (!issue || !generated) {
    console.error(`\nFAIL: copy did not pass validation. ${lastProblem}`)
    process.exit(1)
  }

  const html = renderIssue(issue)
  mkdirSync('.scratch', { recursive: true })
  writeFileSync(OUT, html)

  const words = countIssueWords(issue)
  console.log(`\nSubject: ${generated.subject}`)
  console.log(`Would schedule for: ${nextMondayNineAm(now).toISOString()}`)
  console.log(`Length: ${words} words, about ${(words / 200).toFixed(1)} min`)
  if (offline || noModel) {
    console.log('\nProse is placeholder. The roles, layout and length are real.')
  }
  console.log(`\nWrote ${OUT}. Nothing was sent and no campaign was created.`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
