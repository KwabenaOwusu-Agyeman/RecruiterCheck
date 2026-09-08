// Gathers candidate job postings for section one of the newsletter.
//
//   npx tsx scripts/newsletter/postings.ts            three per region
//   npx tsx scripts/newsletter/postings.ts --per 5    more to choose from
//   npx tsx scripts/newsletter/postings.ts --days 14  narrow the window
//
// WHY THESE SOURCES. Greenhouse, Lever and Ashby publish every customer's board
// as public JSON, meant to be read by anyone. That is not scraping and it does
// not breach anyone's terms. LinkedIn and Indeed both forbid scraping and block
// it; for a company selling to job seekers, an IP ban or a letter is a real cost
// and not a theoretical one. So the sources are per company, in sources.json,
// grouped into the five regions the newsletter covers.
//
// Choosing the companies is the point rather than a limitation. The section
// promises five roles worth a look, which is a curator's claim. A firehose
// produces search results, and the reader already has search results.
//
// NEVER source postings from the checks table. The employers our users applied
// to were never consented to publication: `product_feedback` has a consent flag
// and `checks` has no consent column at all. Public job boards are a different
// thing entirely. See memory/feedback_public_surfaces_consent_only.md.
//
// This prints a shortlist. It does not write the week's JSON, because picking
// the five is the editorial judgement and should stay a human one.

import { readFileSync } from 'node:fs'

export type Platform = 'greenhouse' | 'lever' | 'ashby'

export interface Board {
  slug: string
  platform: Platform
  name: string
}

export interface Candidate {
  region: string
  role: string
  company: string
  location: string
  url: string
  postedAt: number
}

const USER_AGENT = 'MyRecruiterCheck-newsletter/1.0 (+https://myrecruitercheck.com)'

/**
 * A role the newsletter is about. Deliberately two passes: a loose keyword
 * match alone returns "Account Executive, AI Native" and "Strategic Finance
 * Analyst", because `ai` and `analyst` appear in plenty of titles that are not
 * engineering roles. The exclusion pass is what makes the list credible.
 */
const ROLE = new RegExp(
  [
    '\\b(software|backend|back end|frontend|front end|full ?stack|mobile|ios|android)\\b',
    '\\bengineer',
    '\\bdeveloper\\b',
    '\\b(machine learning|deep learning|ml|nlp|llm)\\b',
    '\\b(data|research|applied|computer) scientist\\b',
    '\\bdata (engineer|analyst|platform)\\b',
    '\\b(devops|sre|site reliability|infrastructure|platform engineer)\\b',
    '\\b(security|cloud|solutions) engineer\\b',
    '\\b(ai|ml) (engineer|researcher|scientist|architect)\\b',
  ].join('|'),
  'i',
)

/** Titles the role pattern catches that are not the roles we mean. */
const NOT_A_ROLE = new RegExp(
  [
    '\\b(account executive|sales|business development|partnerships|customer success)\\b',
    '\\b(recruiter|recruiting|talent|people|hr)\\b',
    '\\b(marketing|content|brand|community|social)\\b',
    '\\b(finance|accounting|payroll|tax|audit|treasury)\\b',
    '\\b(legal|counsel|compliance officer)\\b',
    '\\b(intern|internship|apprentice|graduate scheme)\\b',
    '\\b(driver|warehouse|retail|stock controller|field agent|collections)\\b',
    // Field and solutions engineering are go to market functions, not the
    // engineering roles a reader of this section is looking for.
    '\\b(field engineering|sales engineer|solutions (engineer|architect)|pre ?sales)\\b',
  ].join('|'),
  'i',
)

export function isTechRole(title: string): boolean {
  return ROLE.test(title) && !NOT_A_ROLE.test(title)
}

/** Collapses whitespace and drops an empty location to a readable default. */
export function tidyLocation(value: string | null | undefined): string {
  const text = (value ?? '').replace(/\s+/g, ' ').trim()
  return text || 'Location not stated'
}

/**
 * Where a role actually is, from the posting's own location text.
 *
 * The company's list is NOT the answer. Moniepoint is an African company that
 * posts roles in Poland, Anthropic posts in Zürich, and Postman posts in
 * California. Labelling those Africa, USA and India because of whose board they
 * came from would make the regional promise false, which is the one thing a
 * regional section cannot be.
 *
 * The EU list matches Europe rather than the twenty seven member states.
 * Switzerland and Norway are not in the EU and a reader looking for European
 * roles does not care.
 */
const REGION_PATTERNS: [string, RegExp][] = [
  ['UK', /\b(united kingdom|u\.?k\.?|england|scotland|wales|northern ireland|london|manchester|edinburgh|cambridge|oxford|bristol|leeds|glasgow|belfast)\b/i],
  ['India', /\b(india|bengaluru|bangalore|mumbai|new delhi|delhi|gurgaon|gurugram|noida|hyderabad|chennai|pune|kolkata|ahmedabad|jaipur)\b/i],
  ['Africa', /\b(africa|nigeria|lagos|abuja|kenya|nairobi|johannesburg|cape town|pretoria|durban|ghana|accra|egypt|cairo|morocco|casablanca|tunisia|senegal|dakar|uganda|kampala|tanzania|rwanda|kigali|ethiopia|addis ababa|zambia|zimbabwe|abidjan|cameroon|mozambique|botswana|namibia)\b/i],
  ['EU', /\b(europe|emea|netherlands|amsterdam|utrecht|rotterdam|germany|berlin|munich|hamburg|cologne|france|paris|lyon|spain|madrid|barcelona|italy|milan|rome|poland|warsaw|krakow|sweden|stockholm|denmark|copenhagen|norway|oslo|finland|helsinki|ireland|dublin|belgium|brussels|portugal|lisbon|porto|austria|vienna|switzerland|zurich|z\u00fcrich|geneva|czech|prague|romania|bucharest|greece|athens|hungary|budapest|estonia|tallinn|lithuania|vilnius|latvia|riga|bulgaria|sofia|croatia|slovakia|slovenia|luxembourg)\b/i],
  ['USA', /\b(united states|u\.?s\.?a\.?|california|new york|nyc|san francisco|seattle|austin|boston|chicago|denver|atlanta|texas|washington|oregon|colorado|massachusetts|illinois|florida|arizona|utah|virginia|north carolina|cupertino|mountain view|palo alto|menlo park|san jose|los angeles)\b/i],
]

/** The region a posting's location names, or null if it names none of them. */
export function regionFor(location: string): string | null {
  for (const [region, pattern] of REGION_PATTERNS) {
    if (pattern.test(location)) return region
  }
  return null
}

/**
 * A location that names nowhere: "Remote", "Global", "Location not stated".
 *
 * The distinction matters. An unplaceable location can fall back to the board's
 * own region, because that is where the company is. A location naming a real
 * place outside the five regions must NOT: falling back put an OpenAI role in
 * Tokyo under USA, which is exactly the false regional promise this is here to
 * prevent. Those are dropped instead.
 */
export function isUnplaceable(location: string): boolean {
  const rest = location
    .toLowerCase()
    .replace(/\b(remote|hybrid|global|worldwide|anywhere|flexible|multiple locations|location not stated|various)\b/g, ' ')
    .replace(/[\s,;/()\-\u2013\u2014]+/g, '')
  return rest === ''
}

/** The region to file a posting under, or null to drop it. */
export function resolveRegion(location: string, boardRegion: string): string | null {
  const named = regionFor(location)
  if (named) return named
  return isUnplaceable(location) ? boardRegion : null
}

export function boardUrl(board: Board): string {
  switch (board.platform) {
    case 'greenhouse':
      return `https://boards-api.greenhouse.io/v1/boards/${board.slug}/jobs`
    case 'lever':
      return `https://api.lever.co/v0/postings/${board.slug}?mode=json`
    case 'ashby':
      return `https://api.ashbyhq.com/posting-api/job-board/${board.slug}`
  }
}

/**
 * One shape out of three different ones. Each platform names the same fields
 * differently, and only Greenhouse returns the company, so the rest comes from
 * sources.json.
 */
export function normalise(board: Board, region: string, raw: unknown): Candidate | null {
  if (!raw || typeof raw !== 'object') return null
  const job = raw as Record<string, unknown>
  const str = (v: unknown): string => (typeof v === 'string' ? v : '')
  const nested = (v: unknown, key: string): unknown =>
    v && typeof v === 'object' ? (v as Record<string, unknown>)[key] : undefined

  let role: string, location: string, url: string, postedAt: number
  switch (board.platform) {
    case 'greenhouse':
      role = str(job.title)
      location = tidyLocation(str(nested(job.location, 'name')))
      url = str(job.absolute_url)
      postedAt = Date.parse(str(job.first_published) || str(job.updated_at)) || 0
      break
    case 'lever':
      role = str(job.text)
      location = tidyLocation(str(nested(job.categories, 'location')))
      url = str(job.hostedUrl)
      postedAt = typeof job.createdAt === 'number' ? job.createdAt : 0
      break
    case 'ashby':
      role = str(job.title)
      location = tidyLocation(str(job.location))
      url = str(job.jobUrl)
      postedAt = Date.parse(str(job.publishedAt)) || 0
      break
  }

  role = role.replace(/\s+/g, ' ').trim()
  // https only, matching the rule issue.ts enforces on a rendered posting.
  if (!role || !url.startsWith('https://')) return null

  // The posting's own location decides the region; the board's list is only the
  // fallback for a location that names nowhere, such as a bare "Remote". A role
  // somewhere else entirely is dropped rather than mislabelled.
  const resolved = resolveRegion(location, region)
  if (!resolved) return null

  return { region: resolved, role, company: board.name, location, url, postedAt }
}

export function jobsFromPayload(platform: Platform, payload: unknown): unknown[] {
  if (platform === 'lever') return Array.isArray(payload) ? payload : []
  const jobs = (payload as { jobs?: unknown })?.jobs
  return Array.isArray(jobs) ? jobs : []
}

/** Newest first, and never the same role twice at the same company. */
export function shortlist(candidates: Candidate[], perRegion: number): Candidate[] {
  const seen = new Set<string>()
  const unique = candidates
    .slice()
    .sort((a, b) => b.postedAt - a.postedAt)
    .filter((c) => {
      const key = `${c.company}::${c.role}`.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

  const perCompany = new Map<string, number>()
  const taken: Candidate[] = []
  for (const c of unique) {
    if (taken.filter((t) => t.region === c.region).length >= perRegion) continue
    // One role per company, so a big board cannot fill a region on its own.
    const n = perCompany.get(c.company) ?? 0
    if (n >= 1) continue
    perCompany.set(c.company, n + 1)
    taken.push(c)
  }
  return taken
}

async function fetchBoard(board: Board, region: string, maxAgeMs: number): Promise<Candidate[]> {
  const cutoff = Date.now() - maxAgeMs
  try {
    const response = await fetch(boardUrl(board), {
      headers: { 'User-Agent': USER_AGENT, accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) {
      console.error(`  ${region}/${board.slug}: HTTP ${response.status}`)
      return []
    }
    const jobs = jobsFromPayload(board.platform, await response.json())
    return jobs
      .map((j) => normalise(board, region, j))
      .filter((c): c is Candidate => c !== null)
      .filter((c) => isTechRole(c.role) && c.postedAt >= cutoff)
  } catch (error) {
    console.error(`  ${region}/${board.slug}: ${(error as Error).message}`)
    return []
  }
}

async function main() {
  const argv = process.argv.slice(2)
  const arg = (name: string, fallback: number) => {
    const i = argv.indexOf(`--${name}`)
    return i === -1 ? fallback : Number(argv[i + 1]) || fallback
  }
  const perRegion = arg('per', 3)
  const days = arg('days', 21)

  const sources: Record<string, Board[]> = JSON.parse(
    readFileSync(new URL('./sources.json', import.meta.url), 'utf8'),
  )

  const tasks = Object.entries(sources).flatMap(([region, boards]) =>
    boards.map((board) => fetchBoard(board, region, days * 86_400_000)),
  )
  const found = (await Promise.all(tasks)).flat()
  const picked = shortlist(found, perRegion)

  console.log(`\n${found.length} tech roles posted in the last ${days} days. Shortlist:\n`)
  for (const region of Object.keys(sources)) {
    const rows = picked.filter((c) => c.region === region)
    console.log(`${region}`)
    if (rows.length === 0) console.log('  nothing in the window')
    for (const c of rows) {
      console.log(`  ${c.role}`)
      console.log(`    ${c.company}, ${c.location}`)
      console.log(`    ${c.url}`)
    }
    console.log()
  }

  console.log('Paste five of these into the week\'s postings array:\n')
  console.log(
    JSON.stringify(
      picked.map((c) => ({
        role: c.role,
        company: c.company,
        location: c.location,
        note: 'REPLACE ME',
        url: c.url,
      })),
      null,
      2,
    ),
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
