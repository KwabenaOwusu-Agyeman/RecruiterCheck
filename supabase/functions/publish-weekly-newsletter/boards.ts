// The five regional job sources, and the rule for deciding where a role is.
//
// WHY COMPANY BOARDS RATHER THAN A SCRAPER. Greenhouse, Lever and Ashby publish
// every customer's board as public JSON, meant to be read by anyone. That is
// not scraping and breaches nobody's terms. LinkedIn and Indeed both forbid
// scraping and block it, and for a company selling to job seekers an IP ban or
// a letter is a real cost rather than a theoretical one.
//
// WHY THESE ARE NEEDED AT ALL. The two open feeds this function already reads
// cannot fill the format. Measured on 2026-09-08, Remotive and Arbeitnow
// carried 267 postings between them: EU 117, UK 64, USA 3, Africa 0, India 0.
// A section promising five regions cannot be built from feeds that return
// nothing for two of them.
//
// Choosing the companies is the point, not a limitation. The section promises
// five roles worth a look, which is a curator's claim; a firehose returns
// search results, and the reader already has search results.
//
// NEVER source postings from the checks table. The employers our users applied
// to were never consented to publication: `product_feedback` carries a consent
// flag and `checks` has no consent column at all. Public job adverts are a
// different thing entirely.

export type Platform = 'greenhouse' | 'lever' | 'ashby'

export interface Board {
  slug: string
  platform: Platform
  /** Lever and Ashby do not return the employer, so it comes from here. */
  name: string
}

/**
 * The five regions, in the order slots are filled. One role per region is the
 * whole format: five postings, five regions.
 */
export const REGIONS = ['EU', 'UK', 'USA', 'Africa', 'India'] as const
export type Region = (typeof REGIONS)[number]

/**
 * Every slug here was probed against the live API before being written down.
 * A slug that stops resolving costs its own board and nothing else, so a dead
 * entry degrades the issue rather than failing the week.
 */
export const BOARDS: Record<Region, Board[]> = {
  EU: [
    { slug: 'adyen', platform: 'greenhouse', name: 'Adyen' },
    { slug: 'alan', platform: 'ashby', name: 'Alan' },
    { slug: 'bird', platform: 'greenhouse', name: 'Bird' },
    { slug: 'deepl', platform: 'ashby', name: 'DeepL' },
    { slug: 'miro', platform: 'ashby', name: 'Miro' },
    { slug: 'mollie', platform: 'ashby', name: 'Mollie' },
    { slug: 'n8n', platform: 'ashby', name: 'n8n' },
    { slug: 'qonto', platform: 'lever', name: 'Qonto' },
    { slug: 'spotify', platform: 'lever', name: 'Spotify' },
  ],
  UK: [
    { slug: 'cleo', platform: 'greenhouse', name: 'Cleo' },
    { slug: 'elevenlabs', platform: 'ashby', name: 'ElevenLabs' },
    { slug: 'faculty', platform: 'ashby', name: 'Faculty' },
    { slug: 'gocardless', platform: 'greenhouse', name: 'GoCardless' },
    { slug: 'improbable', platform: 'ashby', name: 'Improbable' },
    { slug: 'monzo', platform: 'greenhouse', name: 'Monzo' },
    { slug: 'multiverse', platform: 'ashby', name: 'Multiverse' },
    { slug: 'polyai', platform: 'greenhouse', name: 'PolyAI' },
    { slug: 'synthesia', platform: 'ashby', name: 'Synthesia' },
    { slug: 'tractable', platform: 'ashby', name: 'Tractable' },
    { slug: 'wise', platform: 'greenhouse', name: 'Wise' },
  ],
  USA: [
    { slug: 'anthropic', platform: 'greenhouse', name: 'Anthropic' },
    { slug: 'databricks', platform: 'greenhouse', name: 'Databricks' },
    { slug: 'datadog', platform: 'greenhouse', name: 'Datadog' },
    { slug: 'figma', platform: 'greenhouse', name: 'Figma' },
    { slug: 'notion', platform: 'ashby', name: 'Notion' },
    { slug: 'openai', platform: 'ashby', name: 'OpenAI' },
    { slug: 'ramp', platform: 'ashby', name: 'Ramp' },
    { slug: 'scaleai', platform: 'greenhouse', name: 'Scale AI' },
    { slug: 'stripe', platform: 'greenhouse', name: 'Stripe' },
    { slug: 'vercel', platform: 'greenhouse', name: 'Vercel' },
  ],
  Africa: [
    { slug: 'andela', platform: 'ashby', name: 'Andela' },
    { slug: 'apolloagriculture', platform: 'lever', name: 'Apollo Agriculture' },
    { slug: 'copia', platform: 'lever', name: 'Copia Global' },
    { slug: 'jumia', platform: 'greenhouse', name: 'Jumia' },
    { slug: 'luno', platform: 'greenhouse', name: 'Luno' },
    { slug: 'm-kopa', platform: 'ashby', name: 'M KOPA' },
    { slug: 'moniepoint', platform: 'greenhouse', name: 'Moniepoint' },
    { slug: 'oneacrefund', platform: 'greenhouse', name: 'One Acre Fund' },
    { slug: 'ozow', platform: 'greenhouse', name: 'Ozow' },
    { slug: 'tala', platform: 'lever', name: 'Tala' },
  ],
  India: [
    { slug: 'cred', platform: 'lever', name: 'CRED' },
    { slug: 'groww', platform: 'greenhouse', name: 'Groww' },
    { slug: 'meesho', platform: 'lever', name: 'Meesho' },
    { slug: 'navi', platform: 'ashby', name: 'Navi' },
    { slug: 'postman', platform: 'greenhouse', name: 'Postman' },
    { slug: 'sarvam', platform: 'ashby', name: 'Sarvam AI' },
    { slug: 'zeta', platform: 'lever', name: 'Zeta' },
  ],
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
 * Where a role is, read from the posting's own location text.
 *
 * The company's list is NOT the answer, and using it was the first version's
 * bug. Moniepoint is an African company posting roles in Poland, Anthropic
 * posts in Zürich and Postman posts in California. Labelling those Africa, USA
 * and India because of whose board they came from makes the regional promise
 * false, which is the one thing a regional section cannot afford.
 *
 * UK is tested before EU because London would otherwise match Europe. The EU
 * list means Europe rather than the twenty seven member states: Switzerland and
 * Norway are not in the EU, and a reader looking for European roles does not
 * care.
 */
const REGION_PATTERNS: [Region, RegExp][] = [
  ['UK', /\b(united kingdom|u\.?k\.?|england|scotland|wales|northern ireland|london|manchester|edinburgh|cambridge|oxford|bristol|leeds|glasgow|belfast)\b/i],
  ['India', /\b(india|bengaluru|bangalore|mumbai|new delhi|delhi|gurgaon|gurugram|noida|hyderabad|chennai|pune|kolkata|ahmedabad|jaipur)\b/i],
  ['Africa', /\b(africa|nigeria|lagos|abuja|kenya|nairobi|johannesburg|cape town|pretoria|durban|ghana|accra|egypt|cairo|morocco|casablanca|tunisia|senegal|dakar|uganda|kampala|tanzania|rwanda|kigali|ethiopia|addis ababa|zambia|zimbabwe|abidjan|cameroon|mozambique|botswana|namibia)\b/i],
  ['EU', /\b(europe|emea|netherlands|amsterdam|utrecht|rotterdam|germany|berlin|munich|hamburg|cologne|france|paris|lyon|spain|madrid|barcelona|italy|milan|rome|poland|warsaw|krakow|sweden|stockholm|denmark|copenhagen|norway|oslo|finland|helsinki|ireland|dublin|belgium|brussels|portugal|lisbon|porto|austria|vienna|switzerland|zurich|zürich|geneva|czech|prague|romania|bucharest|greece|athens|hungary|budapest|estonia|tallinn|lithuania|vilnius|latvia|riga|bulgaria|sofia|croatia|slovakia|slovenia|luxembourg)\b/i],
  ['USA', /\b(united states|u\.?s\.?a\.?|california|new york|nyc|san francisco|seattle|austin|boston|chicago|denver|atlanta|texas|washington|oregon|colorado|massachusetts|illinois|florida|arizona|utah|virginia|north carolina|cupertino|mountain view|palo alto|menlo park|san jose|los angeles)\b/i],
]

/** The region a location names, or null if it names none of the five. */
export function regionFor(location: string): Region | null {
  for (const [region, pattern] of REGION_PATTERNS) {
    if (pattern.test(location)) return region
  }
  return null
}

/**
 * A location naming nowhere: "Remote", "Global", "Anywhere".
 *
 * The distinction is load bearing. A location naming nowhere can fall back to
 * the board's own region, because that is where the company is. A location
 * naming a real place outside the five must not: falling back put an OpenAI
 * role in Tokyo under USA, which is the false regional promise this whole file
 * exists to avoid.
 */
export function isUnplaceable(location: string): boolean {
  return location
    .toLowerCase()
    .replace(/\b(remote|hybrid|onsite|on site|global|worldwide|anywhere|flexible|multiple locations|various|location not stated)\b/g, ' ')
    .replace(/[\s,;/()\-–—]+/g, '') === ''
}

/** The region to file a posting under, or null to drop it. */
export function resolveRegion(location: string, boardRegion: Region | null): Region | null {
  const named = regionFor(location)
  if (named) return named
  return isUnplaceable(location) ? boardRegion : null
}
