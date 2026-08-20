// Run with: npx tsx supabase/functions/generate-documents/logic.test.ts
import assert from 'node:assert/strict'
import { containsName, containsPlaceholder, looksLikeEnglish, splitSentences, stripDashes, validateDocuments, type RawDocuments } from './logic.ts'

let passed = 0
function test(name: string, fn: () => void) {
  try {
    fn()
    passed += 1
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`FAIL - ${name}`)
    throw error
  }
}

function baseRaw(overrides: Partial<RawDocuments> = {}): RawDocuments {
  return {
    new_claims_introduced: [],
    improvement_classifications: [{ case: 'B' }],
    tailored_cv: {
      full_name: 'Jamie Rivera',
      contact_line: 'Amsterdam, Netherlands',
      section_labels: { summary: 'Professional Summary', experience: 'Work Experience', education: 'Education', languages: 'Languages' },
      professional_summary: 'Backend engineer with 6 years of experience in distributed systems. Known for shipping reliable services under pressure. Delivers measurable performance gains for engineering teams.',
      experience: [
        {
          title: 'Senior Backend Engineer',
          company_location: 'Acme, Amsterdam',
          dates: 'January 2021 to Present',
          bullets: [
            { text: 'Led a sales team to exceed annual revenue targets by 15 percent.', is_placeholder: false },
            {
              text: 'Designed and implemented a new onboarding workflow to improve operational efficiency.',
              is_placeholder: false,
            },
          ],
        },
      ],
      education: [{ degree: 'BSc Computer Science', institution: 'UvA', dates: '2014 to 2018' }],
      languages: ['English', 'Dutch'],
    },
    cover_letter: {
      company_location: 'Amsterdam, Netherlands',
      salutation: 'Dear Hiring Team,',
      intro_paragraph: 'I am excited to apply for the Senior Backend Engineer role.',
      body_paragraphs: [
        'I led a sales team to exceed annual revenue targets by 15 percent, directly relevant to this role.',
        'In addition, I designed and implemented a new onboarding workflow to improve operational efficiency.',
        'I collaborate well in a team while also working independently, and consistently deliver ahead of schedule.',
      ],
      conclusion_paragraph: 'I would welcome the chance to discuss how I can contribute to your team.',
      thank_you_line: 'Thank you for considering my application.',
      closing_phrase: 'Yours sincerely,',
    },
    recruiter_message: {
      greeting: 'Hi,',
      body: 'I have applied for the Senior Backend Engineer role. I am genuinely excited about the opportunity to join Acme. My background in distributed systems aligns closely with what this role needs.',
      closing_line: 'I look forward to hearing from you.',
      sign_off: 'Kind regards,',
    },
    ...overrides,
  }
}

// TEST 1 — existing metric is preserved through validation.
test('validateDocuments preserves a real metric already present in the CV bullet', () => {
  const result = validateDocuments(baseRaw())
  assert.ok(result.tailored_cv.experience[0].bullets[0].text.includes('15 percent'))
  assert.equal(result.tailored_cv.experience[0].bullets[0].is_placeholder, false)
})

// TEST 2 / safeguard — the model self reporting an invented fact fails validation.
test('validateDocuments rejects output that self reports a fabricated claim', () => {
  assert.throws(
    () => validateDocuments(baseRaw({ new_claims_introduced: ['Increased revenue by 25%'] })),
    /unverified claims/,
  )
})

// Placeholder safeguard — an "X%" style placeholder leaking into a final
// document (e.g. carried over from a feedback example) must fail validation
// rather than ship to the candidate, unless it's an explicitly disclosed
// case-(C) bullet (see the tests below for that sanctioned path).
test('validateDocuments rejects a placeholder like "X%" in a CV bullet not marked is_placeholder', () => {
  const raw = baseRaw()
  raw.tailored_cv.experience[0].bullets[0] = { text: 'Increased retention by X% within X months.', is_placeholder: false }
  assert.throws(() => validateDocuments(raw), /placeholder/)
})

test('validateDocuments accepts a CV bullet explicitly marked is_placeholder with placeholder vocabulary', () => {
  const raw = baseRaw()
  raw.tailored_cv.experience[0].bullets.push({
    text: 'Implemented a new onboarding system that led to a X% increase in efficiency in X months.',
    is_placeholder: true,
  })
  const result = validateDocuments(raw)
  const placeholderBullet = result.tailored_cv.experience[0].bullets.find((bullet) => bullet.is_placeholder)
  assert.ok(placeholderBullet)
  assert.ok(placeholderBullet!.text.includes('X%'))
})

// Not every area to improve is metric shaped (e.g. a missing language
// course or certification has no natural "X%" figure) — a bracketed
// description of the missing qualitative detail must also be accepted,
// not just the numeric "X%"/"X months" tokens.
test('validateDocuments accepts a qualitative bracketed placeholder (no metric) marked is_placeholder', () => {
  const raw = baseRaw({ improvement_classifications: [{ case: 'B' }, { case: 'C' }] })
  raw.tailored_cv.experience[0].bullets.push({
    text: 'Completed a [relevant hospitality or language training course] to strengthen guest communication skills.',
    is_placeholder: true,
  })
  const result = validateDocuments(raw)
  const placeholderBullet = result.tailored_cv.experience[0].bullets.find((bullet) => bullet.is_placeholder)
  assert.ok(placeholderBullet)
  assert.ok(placeholderBullet!.text.includes('[relevant hospitality or language training course]'))
})

test('validateDocuments rejects a bullet marked is_placeholder that has no placeholder vocabulary', () => {
  const raw = baseRaw()
  raw.tailored_cv.experience[0].bullets.push({
    text: 'Led the migration of core services to a new cloud provider.',
    is_placeholder: true,
  })
  assert.throws(() => validateDocuments(raw), /placeholder/)
})

test('validateDocuments still rejects a placeholder in the professional summary', () => {
  const raw = baseRaw()
  raw.tailored_cv.professional_summary = 'Backend engineer who increased retention by X% within X months.'
  assert.throws(() => validateDocuments(raw), /placeholder/)
})

// Reproduces the real bug: the model classified an area to improve as case C
// (no CV evidence) but silently produced no placeholder bullet for it — that
// used to pass validation since nothing invalid was written, it was just
// omitted. improvement_classifications makes that omission checkable.
test('validateDocuments rejects a case C classification with no matching placeholder bullet', () => {
  const raw = baseRaw({ improvement_classifications: [{ case: 'B' }, { case: 'C' }] })
  assert.throws(() => validateDocuments(raw), /case C/)
})

test('validateDocuments accepts a case C classification backed by a placeholder bullet', () => {
  const raw = baseRaw({ improvement_classifications: [{ case: 'B' }, { case: 'C' }] })
  raw.tailored_cv.experience[0].bullets.push({
    text: 'Completed training that led to a X% improvement in guest satisfaction over X months.',
    is_placeholder: true,
  })
  const result = validateDocuments(raw)
  assert.equal(result.tailored_cv.experience[0].bullets.filter((bullet) => bullet.is_placeholder).length, 1)
})

test('validateDocuments does not force a placeholder bullet for case D (not CV relevant) areas', () => {
  const raw = baseRaw({ improvement_classifications: [{ case: 'D' }, { case: 'D' }] })
  const result = validateDocuments(raw)
  assert.equal(result.tailored_cv.experience[0].bullets.filter((bullet) => bullet.is_placeholder).length, 0)
})

test('validateDocuments rejects a placeholder in the cover letter body', () => {
  const raw = baseRaw()
  raw.cover_letter.body_paragraphs[0] = 'I improved onboarding, increasing retention by X% within X months.'
  assert.throws(() => validateDocuments(raw), /placeholder/)
})

test('containsPlaceholder recognizes common example placeholder shapes', () => {
  assert.ok(containsPlaceholder('increased revenue by X%'))
  assert.ok(containsPlaceholder('within X months of launch'))
  assert.ok(containsPlaceholder('grew the team to [team size]'))
  assert.ok(!containsPlaceholder('increased revenue by 15 percent'))
})

test('validateDocuments rejects a recruiter message that cites a statistic', () => {
  const raw = baseRaw()
  raw.recruiter_message.body = 'I increased revenue by 15 percent in my last role and would love to discuss this.'
  assert.throws(() => validateDocuments(raw), /statistic/)
})

test('validateDocuments rejects a cover letter written in third person', () => {
  const raw = baseRaw()
  raw.cover_letter.intro_paragraph = 'Jamie Rivera is excited to apply for the Senior Backend Engineer role.'
  assert.throws(() => validateDocuments(raw), /third person/)
})

test('validateDocuments requires exactly 3 cover letter body paragraphs', () => {
  const raw = baseRaw()
  raw.cover_letter.body_paragraphs = ['Only one paragraph.']
  assert.throws(() => validateDocuments(raw), /3 body paragraphs/)
})

test('containsName matches whole name parts only', () => {
  assert.ok(containsName('I worked closely with Jamie on this project.', 'Jamie Rivera'))
  assert.ok(!containsName('I am a keen and hardworking candidate.', 'Jamie Rivera'))
})

test('stripDashes turns date ranges and compounds into plain words', () => {
  assert.equal(stripDashes('2020-2023, self-motivated'), '2020 to 2023, self motivated')
})

test('looksLikeEnglish flags non English content', () => {
  assert.ok(!looksLikeEnglish('Ik ben zeer geinteresseerd in deze functie bij uw bedrijf.'))
})

test('splitSentences keeps a mid-word period (e.g. "Node.js") from swallowing the text before it', () => {
  const result = splitSentences(
    'Backend engineer with 6 years of experience using Node.js and Python for high traffic products. Mentors junior engineers on system design.',
  )
  assert.equal(result.length, 2)
  assert.equal(
    result[0],
    'Backend engineer with 6 years of experience using Node.js and Python for high traffic products.',
  )
  assert.equal(result[1], 'Mentors junior engineers on system design.')
})

test('splitSentences still protects decimal numbers like "7.2%"', () => {
  const result = splitSentences('Improved throughput by 7.2 percent. Reduced latency across the board.')
  assert.equal(result.length, 2)
  assert.match(result[0], /7\.2 percent\.$/)
})

console.log(`\n${passed} tests passed`)
