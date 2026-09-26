// Run with: npx tsx supabase/functions/generate-documents/logic.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { answerOnlyFacts, repeatedAnswerFacts, citesStatistic, classifyGenerationError, containsName, containsPlaceholder, retryCorrection, FOLLOW_UP_BULLET_SCHEMA, FOLLOW_UP_DOCUMENT_ADDENDUM, FOLLOW_UP_SECTION_HEADING, FollowUpRepeatedError, followUpRepeatedCorrection, getDocumentEntitlement, isRetryableGenerationError, PACK_DISPLAY_NAMES, looksLikeEnglish, splitSentences, statedInAnswer, stripDashes, stripExampleClause, toPdfSafe, toPdfSafeText, validateDocuments, type RawDocuments } from './logic.ts'

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

// Some case-(C) improvements ask for a genuine attitude or framing
// statement (e.g. "express enjoyment of this kind of work"), not a missing
// fact — those have no natural bracketed placeholder and shouldn't need
// one. is_placeholder itself (cross-checked against the case-(C) count
// elsewhere) is the disclosure signal; the text isn't required to match any
// particular pattern. Confirmed live: requiring bracket/"X%" vocabulary on
// every flagged bullet made the model exhaust all retries and 500 whenever
// an improvement was attitudinal rather than factual.
test('validateDocuments accepts a bullet marked is_placeholder with no placeholder vocabulary at all', () => {
  const raw = baseRaw({ improvement_classifications: [{ case: 'B' }, { case: 'C' }] })
  raw.tailored_cv.experience[0].bullets.push({
    text: 'Finds genuine satisfaction in creating clean, welcoming spaces that guests can relax in.',
    is_placeholder: true,
  })
  const result = validateDocuments(raw)
  assert.equal(result.tailored_cv.experience[0].bullets.filter((bullet) => bullet.is_placeholder).length, 1)
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

// ---------------------------------------------------------------------------
// getDocumentEntitlement: score group x pack tier document eligibility.
// This IS the server side enforcement point (generate-documents/index.ts
// calls this exact function) — these tests are what proves a direct API
// call cannot bypass the restriction, not just that the UI hides a button.
// ---------------------------------------------------------------------------

test('DOC ENTITLEMENT: no pack at all blocks every document regardless of score', () => {
  for (const score of [0, 50, 70, 95, 100]) {
    const e = getDocumentEntitlement(null, score)
    assert.equal(e.cv, false)
    assert.equal(e.coverLetter, false)
    assert.equal(e.recruiterMessage, false)
    assert.ok(e.blockedReason)
  }
})

test('DOC ENTITLEMENT: Not a Fit (score <= 60) blocks every document on every pack', () => {
  for (const pack of ['small', 'medium', 'large'] as const) {
    for (const score of [0, 30, 60]) {
      const e = getDocumentEntitlement(pack, score)
      assert.equal(e.cv, false, `${pack}/${score} cv`)
      assert.equal(e.coverLetter, false, `${pack}/${score} coverLetter`)
      assert.equal(e.recruiterMessage, false, `${pack}/${score} recruiterMessage`)
      assert.ok(e.blockedReason)
    }
  }
})

test('DOC ENTITLEMENT: Needs Improvement (61-84) grants CV on any paid pack, cover letter/recruiter only on large', () => {
  for (const score of [61, 75, 84]) {
    const small = getDocumentEntitlement('small', score)
    assert.equal(small.cv, true)
    assert.equal(small.coverLetter, false)
    assert.equal(small.recruiterMessage, false)
    assert.equal(small.blockedReason, null)

    const medium = getDocumentEntitlement('medium', score)
    assert.equal(medium.cv, true)
    assert.equal(medium.coverLetter, false)
    assert.equal(medium.recruiterMessage, false)

    const large = getDocumentEntitlement('large', score)
    assert.equal(large.cv, true)
    assert.equal(large.coverLetter, true)
    assert.equal(large.recruiterMessage, true)
    assert.equal(large.blockedReason, null)
  }
})

test('DOC ENTITLEMENT: Likely Interview Candidate (85+) never grants a CV, on any pack', () => {
  for (const score of [85, 92, 100]) {
    for (const pack of ['small', 'medium', 'large'] as const) {
      const e = getDocumentEntitlement(pack, score)
      assert.equal(e.cv, false, `${pack}/${score} must never grant a CV`)
    }
  }
})

test('DOC ENTITLEMENT: Likely Interview Candidate on a large pack still gets cover letter and recruiter message', () => {
  const e = getDocumentEntitlement('large', 90)
  assert.equal(e.cv, false)
  assert.equal(e.coverLetter, true)
  assert.equal(e.recruiterMessage, true)
  assert.equal(e.blockedReason, null)
})

test('DOC ENTITLEMENT: Likely Interview Candidate on a small or medium pack has nothing available and is blocked', () => {
  for (const pack of ['small', 'medium'] as const) {
    const e = getDocumentEntitlement(pack, 90)
    assert.equal(e.cv, false)
    assert.equal(e.coverLetter, false)
    assert.equal(e.recruiterMessage, false)
    assert.ok(e.blockedReason)
  }
})

test('DOC ENTITLEMENT: exact score group boundaries have no gaps or overlaps', () => {
  assert.equal(getDocumentEntitlement('large', 60).cv, false) // Not a Fit
  assert.equal(getDocumentEntitlement('large', 61).cv, true) // Needs Improvement
  assert.equal(getDocumentEntitlement('large', 84).cv, true) // Needs Improvement
  assert.equal(getDocumentEntitlement('large', 85).cv, false) // Likely Interview Candidate
})

// ---------------------------------------------------------------------------
// Canonical pack naming (server side): small/medium/large are private
// internal identifiers only. Every user facing message this module
// produces must say Starter/Active/Power, never the internal id.
// ---------------------------------------------------------------------------

test('PACK NAMING: the canonical mapping is exactly Starter/Active/Power', () => {
  assert.deepEqual(PACK_DISPLAY_NAMES, { small: 'Starter', medium: 'Active', large: 'Power' })
})

test('PACK NAMING: no blockedReason ever contains a legacy internal identifier', () => {
  const allReasons = [
    getDocumentEntitlement(null, 70).blockedReason,
    getDocumentEntitlement('small', 30).blockedReason,
    getDocumentEntitlement('medium', 90).blockedReason,
    getDocumentEntitlement('large', 30).blockedReason,
  ].filter((r): r is string => r !== null)
  assert.ok(allReasons.length > 0)
  for (const reason of allReasons) {
    assert.ok(!/\bsmall\b/i.test(reason), reason)
    assert.ok(!/\bmedium\b/i.test(reason), reason)
    assert.ok(!/\blarge\b/i.test(reason), reason)
  }
  assert.ok(getDocumentEntitlement(null, 70).blockedReason!.includes('Power'))
})

// ---------------------------------------------------------------------------
// Existing rows using legacy internal identifiers: a check row stored with
// funding_pack_id 'small'/'medium'/'large' (the only values ever written by
// stripe-webhook/complete_check_analysis) must resolve correctly — this is
// exactly what every MATRIX/DOC ENTITLEMENT test above already exercises,
// since getDocumentEntitlement's whole input IS that stored legacy value.
// This test names that property explicitly.
// ---------------------------------------------------------------------------

test('LEGACY IDS: a check stored with the legacy internal pack id resolves to the correct entitlement and display name', () => {
  for (const [legacyId, displayName] of Object.entries(PACK_DISPLAY_NAMES) as ['small' | 'medium' | 'large', string][]) {
    const entitlement = getDocumentEntitlement(legacyId, 75) // Needs Improvement
    assert.equal(entitlement.cv, true, `${legacyId} (${displayName}) should be entitled to a CV at Needs Improvement`)
    assert.equal(PACK_DISPLAY_NAMES[legacyId], displayName)
  }
})

test('stripExampleClause drops sample wording so its fictional figures never reach a document', () => {
  assert.equal(
    stripExampleClause(
      'Expand on open source contributions. The CV does not show open source work. Sample wording: Submitted 5 pull requests to an open source React dashboard, fixing 12 components.',
    ),
    'Expand on open source contributions. The CV does not show open source work.',
  )
})

test('stripExampleClause still drops the historical Example clause', () => {
  assert.equal(
    stripExampleClause('Quantify your impact. No result is shown. Example: Improved X by Y% within Z months.'),
    'Quantify your impact. No result is shown.',
  )
})

test('stripExampleClause leaves an item with no clause untouched', () => {
  assert.equal(stripExampleClause('Strong sales performance. Your record supports the role.'), 'Strong sales performance. Your record supports the role.')
})

// ---------------------------------------------------------------------------
// Validation scope: only delivered documents can fail a generation
// ---------------------------------------------------------------------------

test('SCOPE: a CV only request is not failed by a broken cover letter or recruiter message', () => {
  const raw = baseRaw({
    cover_letter: { ...baseRaw().cover_letter, body_paragraphs: baseRaw().cover_letter.body_paragraphs.slice(0, 2) },
    recruiter_message: { ...baseRaw().recruiter_message, body: 'Jamie Rivera scored 90 percent on 3 projects.' },
  })
  assert.throws(() => validateDocuments(raw), /exactly 3 body paragraphs/)
  const result = validateDocuments(raw, { coverLetter: false, recruiterMessage: false })
  assert.equal(result.tailored_cv.full_name, 'Jamie Rivera')
})

test('SCOPE: the recruiter message is still checked when it will be delivered', () => {
  const raw = baseRaw({ recruiter_message: { ...baseRaw().recruiter_message, body: 'I improved latency by 40 percent across our payment services last year.' } })
  assert.throws(() => validateDocuments(raw, { coverLetter: true, recruiterMessage: true }), /statistic/)
  assert.doesNotThrow(() => validateDocuments(raw, { coverLetter: true, recruiterMessage: false }))
})

test('SCOPE: the CV itself and invented claims are always checked, whatever the scope', () => {
  const noScope = { coverLetter: false, recruiterMessage: false }
  assert.throws(() => validateDocuments(baseRaw({ new_claims_introduced: ['Led a team of 40'] }), noScope), /unverified claims/)
  const raw = baseRaw()
  assert.throws(() => validateDocuments({ ...raw, tailored_cv: { ...raw.tailored_cv, full_name: '' } }, noScope), /missing a name/)
})

// ---------------------------------------------------------------------------
// PDF text safety: the standard font only encodes Windows-1252
// ---------------------------------------------------------------------------

function assertWinAnsi(text: string) {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    const ok = char === '\n' || (code >= 0x20 && code <= 0x7e) || (code >= 0xa1 && code <= 0xff) || '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.includes(char)
    assert.ok(ok, `not encodable: ${JSON.stringify(char)} in ${JSON.stringify(text)}`)
  }
}

test('PDF: names outside Windows-1252 keep their letters without their accents', () => {
  assert.equal(toPdfSafeText('Łukasz Wąsik'), 'Lukasz Wasik')
  assert.equal(toPdfSafeText('Şebnem Yıldız'), 'Sebnem Yildiz')
  assert.equal(toPdfSafeText('Tomáš Dvořák'), 'Tomáš Dvorák')
  assert.equal(toPdfSafeText('Nguyễn Thị Hương'), 'Nguyen Thi Huong')
})

test('PDF: text Windows-1252 already covers is unchanged', () => {
  const text = 'José Müller, Zoë Brontë, Œuvre “quoted” – €40 • ß'
  assert.equal(toPdfSafeText(text), text)
})

test('PDF: symbols get plain equivalents and undrawable characters are dropped', () => {
  assert.equal(toPdfSafeText('Python → Spark ≥ 3 years'), 'Python -> Spark >= 3 years')
  assert.equal(toPdfSafeText('Great team 🚀 player 数据'), 'Great team  player ')
  assertWinAnsi(toPdfSafeText('Łódź → Kraków, 日本 😀 İstanbul ǅ'))
})

test('PDF: toPdfSafe cleans every string in the documents and keeps their shape', () => {
  const raw = baseRaw()
  const docs = toPdfSafe({ ...raw, tailored_cv: { ...raw.tailored_cv, full_name: 'Łukasz Nowak', languages: ['Polski → native'] } })
  assert.equal(docs.tailored_cv.full_name, 'Lukasz Nowak')
  assert.deepEqual(docs.tailored_cv.languages, ['Polski -> native'])
  assert.equal(docs.tailored_cv.experience[0].bullets[0].is_placeholder, false)
  assert.equal(docs.cover_letter.body_paragraphs.length, 3)
})

// ---------------------------------------------------------------------------
// Failure reasons: logs never carry model or CV text
// ---------------------------------------------------------------------------

test('LOGS: failure reasons are fixed codes and never echo the message', () => {
  const claims = 'Model reported unverified claims not present in the original CV: ["Led Jamie Rivera\'s team at Acme"]'
  assert.equal(classifyGenerationError(claims), 'unverified_claims')
  assert.equal(classifyGenerationError('OpenAI API error: 401'), 'openai_http_401')
  assert.equal(classifyGenerationError('OpenAI request timed out after 45000ms'), 'timeout')
  assert.equal(classifyGenerationError('Unexpected token < in JSON at position 0'), 'invalid_json')
  assert.equal(classifyGenerationError('Cover letter is written in third person instead of first person'), 'cover_letter_third_person')
  assert.equal(classifyGenerationError('WinAnsi cannot encode "Ł" (0x0141)'), 'pdf_encoding')
  assert.equal(classifyGenerationError('something about Jamie Rivera'), 'other')
})

test('RETRY: only failures that can succeed on a second attempt are retried', () => {
  for (const reason of ['timeout', 'invalid_json', 'unverified_claims', 'openai_http_429', 'openai_http_500', 'openai_http_503']) {
    assert.equal(isRetryableGenerationError(reason), true, reason)
  }
  for (const reason of ['openai_http_400', 'openai_http_401', 'openai_http_403', 'openai_http_404']) {
    assert.equal(isRetryableGenerationError(reason), false, reason)
  }
})

// ---------------------------------------------------------------------------
// FOLLOW UP: a credited answer becomes one dedicated CV line
// ---------------------------------------------------------------------------

const FOLLOW_UP_SCOPE = { coverLetter: true, recruiterMessage: true, followUpBullet: true }
const ANSWER_BULLET = 'Cut trial setup to 2 screens at Brightwell, lifting trial conversion by 30% in one quarter.'

function withFollowUpBullet(bullet: string | undefined): RawDocuments {
  const raw = baseRaw()
  return { ...raw, tailored_cv: { ...raw.tailored_cv, follow_up_bullet: bullet } }
}

test('FOLLOW UP: a credited answer\'s bullet is kept, with its own figures', () => {
  const result = validateDocuments(withFollowUpBullet(ANSWER_BULLET), FOLLOW_UP_SCOPE)
  assert.equal(result.tailored_cv.follow_up_bullet, ANSWER_BULLET)
})

test('FOLLOW UP: a missing bullet fails validation so the generation is retried', () => {
  for (const bullet of [undefined, '', '   ']) {
    assert.throws(() => validateDocuments(withFollowUpBullet(bullet), FOLLOW_UP_SCOPE), /missing the follow up bullet/)
  }
  assert.equal(classifyGenerationError('Tailored CV is missing the follow up bullet'), 'cv_missing_follow_up_bullet')
})

test('FOLLOW UP: a placeholder in the bullet fails validation, since the answer is real', () => {
  assert.throws(
    () => validateDocuments(withFollowUpBullet('Cut trial setup at Brightwell, lifting conversion by [X%].'), FOLLOW_UP_SCOPE),
    /placeholder/,
  )
})

test('FOLLOW UP: without a credited answer, a bullet the model wrote anyway is never printed', () => {
  const result = validateDocuments(withFollowUpBullet(ANSWER_BULLET))
  assert.equal(result.tailored_cv.follow_up_bullet, '')
  assert.equal(validateDocuments(baseRaw()).tailored_cv.follow_up_bullet, '')
})

test('FOLLOW UP: the bullet is never cut, however full the experience entries are', () => {
  const raw = withFollowUpBullet(ANSWER_BULLET)
  const fullBullets = Array.from({ length: 6 }, (_, i) => ({ text: `Shipped release ${i + 1} of the reporting service on schedule.`, is_placeholder: false }))
  raw.tailored_cv.experience = [{ ...raw.tailored_cv.experience[0], bullets: fullBullets }]
  const result = validateDocuments(raw, FOLLOW_UP_SCOPE)
  assert.equal(result.tailored_cv.experience[0].bullets.length, 4, 'experience is still capped')
  assert.equal(result.tailored_cv.follow_up_bullet, ANSWER_BULLET, 'the follow up line is separate and survives')
})

test('FOLLOW UP: dashes are removed like every other CV line', () => {
  const result = validateDocuments(withFollowUpBullet('Rebuilt the self-serve signup flow, lifting completion by 16%.'), FOLLOW_UP_SCOPE)
  assert.doesNotMatch(result.tailored_cv.follow_up_bullet ?? '', /[-–—]/)
})

test('FOLLOW UP: the prompt asks for one bullet from the answer only, and for no repetition elsewhere', () => {
  for (const rule of [
    /exactly one CV bullet in tailored_cv\.follow_up_bullet/,
    /using only the facts the answer states/,
    /never add a number, date, employer, tool or outcome it does not state/,
    /never use brackets or placeholders/,
    /Never mention a follow up question, that the answer is self reported, or MyRecruiterCheck/,
    /That bullet is the only place the answer may appear/,
    /write the professional summary, every experience entry, cover_letter and recruiter_message exactly as you would without the section/,
    /classify it as case \(A\) and add no placeholder bullet for it, but do not surface the answer in cover_letter, recruiter_message or anywhere else in tailored_cv/,
  ]) {
    assert.match(FOLLOW_UP_DOCUMENT_ADDENDUM, rule)
  }
  assert.equal(FOLLOW_UP_BULLET_SCHEMA.type, 'string')
  assert.equal(FOLLOW_UP_SECTION_HEADING, 'Additional Relevant Experience')
  assert.doesNotMatch(FOLLOW_UP_SECTION_HEADING + FOLLOW_UP_DOCUMENT_ADDENDUM, /[–—]/)
})

test('FOLLOW UP: the request only changes when a credited answer is sent, and only for an entitled CV', () => {
  const source = readFileSync('supabase/functions/generate-documents/index.ts', 'utf8')
  assert.match(source, /\.\.\.\(context\.hasFollowUpEvidence \? \{ follow_up_bullet: FOLLOW_UP_BULLET_SCHEMA \} : \{\}\)/)
  assert.match(source, /\.\.\.\(context\.hasFollowUpEvidence \? \['follow_up_bullet'\] : \[\]\)/)
  assert.match(source, /\$\{context\.hasFollowUpEvidence \? FOLLOW_UP_DOCUMENT_ADDENDUM : ''\}/)
  assert.match(source, /const cvFollowUp = entitlement\.cv \? followUpEvidence : null/)
  assert.match(source, /followUpBullet: cvFollowUp !== null/)
  assert.match(source, /if \(cv\.follow_up_bullet\) \{\s*addLeft\(FOLLOW_UP_SECTION_HEADING/)
})

// ---------------------------------------------------------------------------
// FOLLOW UP: the answer's own facts appear in its line and nowhere else
// ---------------------------------------------------------------------------

// Invented, modelled on the first live run: the answer added Docker, Cloud Run
// and 1,500 requests a day; FastAPI was already on the CV.
const ANSWER = 'In a personal project, I built and deployed a FastAPI service using Docker and Cloud Run. It handled around 1,500 requests per day for three months.'
const ORIGINAL_CV = 'Jamie Rivera, Amsterdam. Senior Backend Engineer, Acme, January 2021 to Present: built REST APIs in Python and FastAPI; led a sales team to exceed annual revenue targets by 15 percent.'
const LINE = 'Built and deployed a FastAPI service using Docker and Cloud Run, handling around 1,500 requests per day for three months.'
const SOURCE_SCOPE = { ...FOLLOW_UP_SCOPE, followUpSource: { answer: ANSWER, cvText: ORIGINAL_CV } }

function credited(edit: (raw: RawDocuments) => void = () => {}): RawDocuments {
  const raw = withFollowUpBullet(LINE)
  edit(raw)
  return raw
}

function repeatedIn(raw: RawDocuments, scope = SOURCE_SCOPE): string[] {
  try {
    validateDocuments(raw, scope)
    return []
  } catch (error) {
    assert.ok(error instanceof FollowUpRepeatedError, String(error))
    return error.repeated
  }
}

test('FOLLOW UP: the answer\'s own facts are its figures and names that the CV does not show', () => {
  assert.deepEqual(answerOnlyFacts(ANSWER, ORIGINAL_CV), { figures: ['1500'], names: ['Docker', 'Cloud Run'] })
})

test('FOLLOW UP: sentence openers, pronouns and single digits are never counted as the answer\'s facts', () => {
  assert.deepEqual(answerOnlyFacts('It went well. I shipped it with Terraform. Then we grew.', ''), { figures: [], names: ['Terraform'] })
  assert.deepEqual(answerOnlyFacts('FastAPI was new to me, and I cut setup to 3 screens.', '').names, ['FastAPI'])
  assert.deepEqual(answerOnlyFacts('I cut it to 3 screens in 2 weeks, lifting completion from 62% to 78%.', '').figures, ['62', '78'])
})

test('FOLLOW UP: a draft with the answer in its own line only passes, and the CV\'s own facts may appear anywhere', () => {
  const raw = credited((draft) => {
    draft.cover_letter.body_paragraphs[0] = 'I built REST APIs in Python and FastAPI, and led a sales team past its targets by 15 percent.'
  })
  assert.deepEqual(repeatedIn(raw), [])
  assert.equal(validateDocuments(raw, SOURCE_SCOPE).tailored_cv.follow_up_bullet, LINE)
})

test('FOLLOW UP: the cover letter repeating the answer, as on the live run, fails and is retried', () => {
  const raw = credited((draft) => {
    draft.cover_letter.body_paragraphs[1] = 'I built and deployed a FastAPI service that handled around 1,500 requests per day, demonstrating my ability to manage production scale.'
  })
  assert.deepEqual(repeatedIn(raw), ['1500'])
  const message = new FollowUpRepeatedError(['1500']).message
  assert.equal(classifyGenerationError(message), 'follow_up_repeated')
  assert.equal(isRetryableGenerationError('follow_up_repeated'), true)
})

test('FOLLOW UP: the summary or the recruiter message naming the answer\'s tool fails, "Google" or not', () => {
  const summary = credited((draft) => {
    draft.tailored_cv.professional_summary = 'Backend engineer. Proficient in deploying services using Google Cloud Run, Python, and FastAPI.'
  })
  assert.deepEqual(repeatedIn(summary), ['Cloud Run'])
  const message = credited((draft) => {
    draft.recruiter_message.body = 'I have applied for the Backend Engineer role. With strong experience in Python and deployment on Google Cloud Run, I would be glad to talk.'
  })
  assert.deepEqual(repeatedIn(message), ['Cloud Run'])
  assert.deepEqual(repeatedIn(message, { ...SOURCE_SCOPE, recruiterMessage: false }), [], 'a message nobody receives is not checked')
})

test('FOLLOW UP: an experience bullet repeating the answer fails, unless it is cut from the printed CV', () => {
  const inPrint = credited((draft) => {
    draft.tailored_cv.experience[0].bullets.push({ text: 'Containerised services with Docker for faster releases.', is_placeholder: false })
  })
  assert.deepEqual(repeatedIn(inPrint), ['Docker'])
  const cut = credited((draft) => {
    const filler = Array.from({ length: 4 }, (_, i) => ({ text: `Shipped release ${i + 1} of the reporting service on schedule.`, is_placeholder: false }))
    draft.tailored_cv.experience[0].bullets = [...filler, { text: 'Containerised services with Docker for faster releases.', is_placeholder: false }]
  })
  assert.deepEqual(repeatedIn(cut), [])
})

test('FOLLOW UP: a self reported claim the answer itself states is excused, anything added to it is not', () => {
  const stated = credited((draft) => {
    draft.new_claims_introduced = ['1,500 requests per day', 'Docker', 'Cloud Run', 'three months', 'FastAPI services']
  })
  assert.equal(validateDocuments(stated, SOURCE_SCOPE).tailored_cv.follow_up_bullet, LINE)
  const added = credited((draft) => {
    draft.new_claims_introduced = ['Google Cloud Run']
  })
  assert.throws(() => validateDocuments(added, SOURCE_SCOPE), /unverified claims/)
  assert.equal(statedInAnswer('Google Cloud Run', ANSWER), false)
  // Without a credited answer every self reported claim still fails, as before.
  assert.throws(() => validateDocuments(stated, FOLLOW_UP_SCOPE), /unverified claims/)
  assert.throws(() => validateDocuments({ ...baseRaw(), new_claims_introduced: ['Docker'] }), /unverified claims/)
})

test('FOLLOW UP: the retry is told which facts to keep in the line, and the log only ever gets the reason code', () => {
  const note = followUpRepeatedCorrection(['1500', 'Cloud Run'])
  assert.match(note, /only in follow_up_bullet/)
  assert.match(note, /"1500", "Cloud Run"/)
  const long = followUpRepeatedCorrection(Array.from({ length: 30 }, (_, i) => `Fact ${i} ${'x'.repeat(100)}`))
  assert.equal(long.match(/"Fact/g)?.length, 10, 'at most ten facts, each cut short')
  assert.doesNotMatch(long, /x{61}/)
  assert.equal(classifyGenerationError(new FollowUpRepeatedError(['JSON', 'timed out']).message), 'follow_up_repeated')
  const source = readFileSync('supabase/functions/generate-documents/index.ts', 'utf8')
  assert.match(source, /answer: cvFollowUp\.answer,\s*cvText,\s*jobTitle: check\.job_title,\s*companyName: check\.company_name,\s*jobDescription: check\.job_description,/)
  assert.match(source, /callOpenAI\(apiKey, cvText, jobDescription, context, correction\)/)
  assert.match(source, /if \(raw\) rejectedDrafts\.push\(raw\)\s*correction = raw \? retryCorrection\(error\) : null/)
  assert.equal(retryCorrection(new FollowUpRepeatedError(['1500', 'Cloud Run'])), followUpRepeatedCorrection(['1500', 'Cloud Run']))
  assert.match(source, /\.\.\.\(correction \? \[\{ role: 'user', content: correction \}\] : \[\]\)/)
})

// ---------------------------------------------------------------------------
// FOLLOW UP: what the security review of the first version found
// ---------------------------------------------------------------------------

test('FOLLOW UP: the role and employer applied to, and the job ad\'s own figures, are never the answer\'s facts', () => {
  const job = { jobTitle: 'Senior Data Analyst', companyName: 'Stripe', jobDescription: 'Join our 24/7 support analytics team.' }
  const answer = 'As a Data Analyst at Stripe I built Looker dashboards for 24/7 support, used by 300 agents.'
  assert.deepEqual(answerOnlyFacts(answer, 'A CV with none of those words.', job), { figures: ['300'], names: ['Looker'] })
  const raw = credited((draft) => {
    draft.cover_letter.intro_paragraph = 'I am excited to apply for the Senior Data Analyst role at Stripe, supporting a 24/7 team.'
  })
  const scope = { ...FOLLOW_UP_SCOPE, followUpSource: { answer, cvText: 'A CV with none of those words.', ...job } }
  assert.deepEqual(repeatedIn(raw, scope), [])
})

test('FOLLOW UP: a name repeats only with its capitals, so ordinary words never count', () => {
  const facts = answerOnlyFacts('I used Excel and Microsoft Teams to track 40 orders a day.', 'A CV without either tool.')
  assert.deepEqual(facts.names, ['Excel', 'Microsoft Teams'])
  assert.deepEqual(repeatedAnswerFacts('I excel at working across teams and react quickly.', facts), [])
  assert.deepEqual(repeatedAnswerFacts('Built weekly reports in Excel.', facts), ['Excel'])
})

test('FOLLOW UP: list markers open a sentence, "I" splits a run, and very short names are ignored', () => {
  assert.deepEqual(answerOnlyFacts('- Reduced churn by 12% using Mixpanel - Managed a team of 4', '').names, ['Mixpanel'])
  assert.deepEqual(answerOnlyFacts('• Reduced churn using Mixpanel\n• Managed the rollout', '').names, ['Mixpanel'])
  assert.deepEqual(answerOnlyFacts('Using Docker I built the pipeline.', '').names, ['Docker'])
  assert.deepEqual(answerOnlyFacts('At Acme I led the move.', 'Acme, Amsterdam').names, [])
  assert.deepEqual(answerOnlyFacts('I write Go and R daily, and stored files in S3.', '').names, ['S3'])
})

test('FOLLOW UP: a dash in a printed line cannot hide a repeat, since dashes are removed before printing', () => {
  const raw = credited((draft) => {
    draft.tailored_cv.experience[0].bullets.push({ text: 'Deployed internal tools on Cloud-Run.', is_placeholder: false })
  })
  assert.deepEqual(repeatedIn(raw), ['Cloud Run'])
})

test('FOLLOW UP: a claim with no readable words is never excused', () => {
  for (const claim of ['€', 'Москва', '   ']) assert.equal(statedInAnswer(claim, ANSWER), false, claim)
})

// ---------------------------------------------------------------------------
// FOLLOW UP: the last draft has repeats removed rather than failing
// ---------------------------------------------------------------------------

const REMOVE_SCOPE = { ...SOURCE_SCOPE, followUpRepeats: 'remove' as const }

// Invented, shaped like the live run's leaks: the summary, one cover letter
// paragraph and the recruiter message each repeat the answer.
function leakyDraft(): RawDocuments {
  return credited((draft) => {
    draft.tailored_cv.professional_summary =
      'Backend engineer with 6 years of experience in distributed systems. Proficient in deploying services using Google Cloud Run and FastAPI. Delivers reliable services.'
    draft.cover_letter.body_paragraphs[1] =
      'Additionally, I have hands on experience deploying applications using Google Cloud Run. I built a FastAPI service that handled around 1,500 requests per day.'
    draft.recruiter_message.body =
      'I have applied for the Senior Backend Engineer role. With strong experience in Python and deployment on Google Cloud Run, I would be glad to talk. My background in distributed systems fits this role.'
  })
}

test('FOLLOW UP: removal takes out exactly the sentences that repeat the answer, and keeps its own line', () => {
  assert.ok(repeatedIn(leakyDraft()).length > 0, 'rejected when retries are still possible')
  const result = validateDocuments(leakyDraft(), REMOVE_SCOPE)
  const facts = answerOnlyFacts(ANSWER, ORIGINAL_CV)
  const printed = [
    result.tailored_cv.professional_summary,
    ...result.tailored_cv.experience.flatMap((entry) => entry.bullets.map((bullet) => bullet.text)),
    result.cover_letter.intro_paragraph,
    ...result.cover_letter.body_paragraphs,
    result.cover_letter.conclusion_paragraph,
    result.recruiter_message.body,
  ].join('\n')
  assert.deepEqual(repeatedAnswerFacts(printed, facts), [])
  assert.equal(result.tailored_cv.professional_summary, 'Backend engineer with 6 years of experience in distributed systems. Delivers reliable services.')
  assert.equal(result.cover_letter.body_paragraphs.length, 2, 'the paragraph made only of the answer is dropped')
  assert.match(result.recruiter_message.body, /My background in distributed systems fits this role\.$/)
  assert.equal(result.tailored_cv.follow_up_bullet, LINE)
})

test('FOLLOW UP: removal drops a repeating bullet but keeps a placeholder bullet, which is already flagged for review', () => {
  const raw = credited((draft) => {
    draft.tailored_cv.experience[0].bullets.push(
      { text: 'Containerised services with Docker for faster releases.', is_placeholder: false },
      { text: 'Deployed a service on Cloud Run handling [X] requests.', is_placeholder: true },
    )
    draft.improvement_classifications = [{ case: 'C' }]
  })
  const bullets = validateDocuments(raw, REMOVE_SCOPE).tailored_cv.experience[0].bullets.map((bullet) => bullet.text)
  assert.ok(!bullets.some((text) => text.includes('Docker')))
  assert.ok(bullets.some((text) => text.includes('[X]')))
})

test('FOLLOW UP: removal still fails a summary made of nothing but the answer, the one case it cannot fix', () => {
  const raw = credited((draft) => {
    draft.tailored_cv.professional_summary = 'Deployed services using Google Cloud Run at 1,500 requests per day.'
  })
  assert.throws(() => validateDocuments(raw, REMOVE_SCOPE), FollowUpRepeatedError)
})

test('FOLLOW UP: without a credited answer, removal mode changes nothing', () => {
  const plain = validateDocuments(baseRaw(), { coverLetter: true, recruiterMessage: true, followUpRepeats: 'remove' })
  assert.deepEqual(plain, validateDocuments(baseRaw()))
})

// ---------------------------------------------------------------------------
// LAST DRAFT: a check the model fails on every attempt does not fail the
// generation. Invented names, roles and employers throughout; each case below
// failed every retry before, since its cause was in the input, not the draft.
// ---------------------------------------------------------------------------

const REPAIR = { coverLetter: true, recruiterMessage: true, repair: true }

function withMessage(body: string): RawDocuments {
  const raw = baseRaw()
  raw.recruiter_message.body = body
  return raw
}

function named(fullName: string, edit: (raw: RawDocuments) => void = () => {}): RawDocuments {
  const raw = baseRaw()
  raw.tailored_cv.full_name = fullName
  edit(raw)
  return raw
}

function fiveBullets(last: { text: string; is_placeholder: boolean }) {
  const filler = Array.from({ length: 4 }, (_, i) => ({ text: `Shipped release ${i + 1} of the reporting service on schedule.`, is_placeholder: false }))
  return [...filler, last]
}

test('STATISTIC: digits in the role or employer applied to, or in a name like HTML5, are not a statistic', () => {
  const scope = { coverLetter: true, recruiterMessage: true, job: { jobTitle: 'Level 2 Support Engineer', companyName: '1Password' } }
  for (const body of [
    'I have applied for the Level 2 Support Engineer role. I admire how 1Password treats privacy. My help desk background fits this team well.',
    'I have applied for the support role. I am excited by your product. My experience building accessible HTML5 interfaces on S3 fits this role.',
  ]) {
    assert.doesNotThrow(() => validateDocuments(withMessage(body), scope), body)
  }
  for (const body of [
    'I have applied for the support role. I cut the ticket backlog by 15 percent in my last role.',
    'I have applied for the support role. I resolved tickets 3x faster than my team.',
    'I have applied for the support role. I administered Microsoft 365 for a growing office.',
  ]) {
    assert.throws(() => validateDocuments(withMessage(body), scope), /statistic/, body)
  }
  assert.equal(citesStatistic('I have applied for the Level 2 Support Engineer role.'), true, 'only the role applied to is exempt')
  assert.equal(citesStatistic('I have applied for the Tier 2 Analyst role.', { jobTitle: 'Tier-2 Analyst' }), false, 'dashes are removed before printing')
  assert.equal(citesStatistic('I resolved tickets x3 faster.'), true, 'a multiplier is a figure')
})

test('STATISTIC: on the last draft the sentence with a figure is removed whole, never reworded', () => {
  const raw = withMessage('I have applied for the Senior Backend Engineer role. I am excited to join Acme. I cut latency by 40 percent last year.')
  assert.throws(() => validateDocuments(raw), /statistic/)
  const repairs: string[] = []
  const result = validateDocuments(raw, REPAIR, repairs)
  assert.equal(result.recruiter_message.body, 'I have applied for the Senior Backend Engineer role. I am excited to join Acme.')
  assert.deepEqual(repairs, ['statistic_sentence_removed'])
  assert.throws(() => validateDocuments(withMessage('I cut latency by 40 percent.'), REPAIR), /too short/, 'nothing left worth sending still fails')
})

test('THIRD PERSON: a name that is also a word, a tool or the employer does not fail every draft', () => {
  const scope = {
    coverLetter: true,
    recruiterMessage: true,
    job: { jobTitle: 'Backend Engineer', companyName: 'JPMorgan Chase', jobDescription: 'You will build services in Ruby on Rails.' },
  }
  const drafts = [
    named('Will Carter', (raw) => {
      raw.cover_letter.conclusion_paragraph = 'I will bring the same care to your team and would welcome a conversation.'
    }),
    named('Can Yilmaz'), // the base letter says "how I can contribute"
    named('Mei Chase', (raw) => {
      raw.cover_letter.intro_paragraph = 'I am excited to apply for the Backend Engineer role at JPMorgan Chase.'
    }),
    named('Ruby Okafor', (raw) => {
      raw.cover_letter.body_paragraphs[0] = 'I built three internal tools in Ruby on Rails for the support team.'
    }),
  ]
  for (const raw of drafts) assert.doesNotThrow(() => validateDocuments(raw, scope), raw.tailored_cv.full_name)
  assert.equal(containsName('I will bring care.', 'Will Carter'), false)
})

test('THIRD PERSON: the candidate named as the subject still fails, however the CV writes the name', () => {
  const scope = { coverLetter: true, recruiterMessage: true, job: { jobTitle: 'Backend Engineer', companyName: 'JPMorgan Chase', jobDescription: 'You will build services.' } }
  const drafts = [
    named('Will Carter', (raw) => {
      raw.cover_letter.intro_paragraph = 'Will is excited to apply for the Backend Engineer role.'
    }),
    named('jamie rivera', (raw) => {
      raw.cover_letter.intro_paragraph = 'Jamie is excited to apply for the Backend Engineer role.'
    }),
    named('Jean-Luc Moreau', (raw) => {
      raw.recruiter_message.body = 'I have applied for the role. Jean-Luc brings strong backend experience to any team.'
    }),
    // The full name counts even when the employer shares a part of it.
    named('Mei Chase', (raw) => {
      raw.cover_letter.intro_paragraph = 'Mei Chase is excited to apply for the Backend Engineer role.'
    }),
  ]
  for (const raw of drafts) assert.throws(() => validateDocuments(raw, scope), /third person/, raw.tailored_cv.full_name)
})

test('PLACEHOLDER: a bullet the CV never prints cannot fail the generation', () => {
  const raw = baseRaw()
  raw.tailored_cv.experience[0].bullets = fiveBullets({ text: 'Supported the [internal billing] migration.', is_placeholder: false })
  const bullets = validateDocuments(raw).tailored_cv.experience[0].bullets
  assert.equal(bullets.length, 4)
  assert.ok(!bullets.some((bullet) => bullet.text.includes('[')))
})

test('PLACEHOLDER: on the last draft an unflagged bullet with a placeholder is dropped whole', () => {
  const raw = baseRaw()
  raw.tailored_cv.experience[0].bullets.push({ text: 'Raised retention by [X%] across the region.', is_placeholder: false })
  assert.throws(() => validateDocuments(raw), /without being marked as one/)
  const repairs: string[] = []
  const bullets = validateDocuments(raw, REPAIR, repairs).tailored_cv.experience[0].bullets.map((bullet) => bullet.text)
  assert.deepEqual(bullets, baseRaw().tailored_cv.experience[0].bullets.map((bullet) => bullet.text))
  assert.deepEqual(repairs, ['placeholder_bullet_removed'])
})

test('PLACEHOLDER: on the last draft a sentence with a placeholder is removed from the summary, letter and message', () => {
  const raw = baseRaw()
  raw.tailored_cv.professional_summary =
    'Backend engineer with 6 years of experience in distributed systems. Improved uptime by [X%] across services. Delivers reliable services.'
  raw.cover_letter.body_paragraphs[2] = 'I grew the [relevant community] programme.'
  raw.recruiter_message.body = `${baseRaw().recruiter_message.body} I bring [X years] of leadership.`
  assert.throws(() => validateDocuments(raw), /placeholder/)
  const repairs: string[] = []
  const result = validateDocuments(raw, REPAIR, repairs)
  assert.equal(result.tailored_cv.professional_summary, 'Backend engineer with 6 years of experience in distributed systems. Delivers reliable services.')
  assert.equal(result.cover_letter.body_paragraphs.length, 2, 'a paragraph made only of the placeholder is dropped, and still counts')
  assert.equal(result.recruiter_message.body, baseRaw().recruiter_message.body)
  assert.deepEqual(repairs, ['placeholder_sentence_removed'])
  const onlyPlaceholder = baseRaw()
  onlyPlaceholder.tailored_cv.professional_summary = 'Improved uptime by [X%] across services.'
  assert.throws(() => validateDocuments(onlyPlaceholder, REPAIR), /placeholder/, 'a summary with nothing else in it still fails')
})

test('CASE C: the placeholder bullet is printed even when its entry already has four bullets', () => {
  const raw = baseRaw({ improvement_classifications: [{ case: 'C' }] })
  raw.tailored_cv.experience[0].bullets = fiveBullets({ text: 'Completed a [relevant cloud certification] to strengthen deployment skills.', is_placeholder: true })
  const bullets = validateDocuments(raw).tailored_cv.experience[0].bullets
  assert.equal(bullets.length, 4)
  assert.equal(bullets[3].is_placeholder, true, 'the last real bullet is cut instead')
  assert.equal(bullets[2].text, 'Shipped release 3 of the reporting service on schedule.')
})

test('CASE C: a blank or unprinted placeholder bullet no longer counts toward the case C areas', () => {
  const blank = baseRaw({ improvement_classifications: [{ case: 'C' }] })
  blank.tailored_cv.experience[0].bullets.push({ text: '   ', is_placeholder: true })
  assert.throws(() => validateDocuments(blank), /case C/)
  const fifthEntry = baseRaw({ improvement_classifications: [{ case: 'C' }] })
  const entry = fifthEntry.tailored_cv.experience[0]
  fifthEntry.tailored_cv.experience = [entry, entry, entry, entry, { ...entry, bullets: [{ text: 'Completed a [relevant course].', is_placeholder: true }] }]
  assert.throws(() => validateDocuments(fifthEntry), /case C/)
})

test('CASE C: on the last draft a shortfall ships, with no bullet written or flagged in code, and is recorded', () => {
  const raw = baseRaw({ improvement_classifications: [{ case: 'B' }, { case: 'C' }] })
  assert.throws(() => validateDocuments(raw), /case C/)
  const repairs: string[] = []
  const result = validateDocuments(raw, REPAIR, repairs)
  assert.deepEqual(result.tailored_cv.experience, validateDocuments(baseRaw()).tailored_cv.experience)
  assert.deepEqual(repairs, ['case_c_shortfall_accepted'])
})

test('PARAGRAPHS: three paragraphs in one string count as three, and the last draft may have two', () => {
  const joined = baseRaw()
  joined.cover_letter.body_paragraphs = [joined.cover_letter.body_paragraphs.join('\n\n')]
  assert.equal(validateDocuments(joined).cover_letter.body_paragraphs.length, 3)
  const two = baseRaw()
  two.cover_letter.body_paragraphs = two.cover_letter.body_paragraphs.slice(0, 2)
  assert.throws(() => validateDocuments(two), /exactly 3 body paragraphs/)
  const repairs: string[] = []
  assert.equal(validateDocuments(two, REPAIR, repairs).cover_letter.body_paragraphs.length, 2)
  assert.deepEqual(repairs, ['two_body_paragraphs_accepted'])
  for (const count of [1, 4]) {
    const raw = baseRaw()
    raw.cover_letter.body_paragraphs = Array.from({ length: count }, (_, i) => `I delivered project ${i + 1} for the operations team on time.`)
    assert.throws(() => validateDocuments(raw, REPAIR), /exactly 3 body paragraphs/, `${count} paragraphs`)
  }
})

test('FIXED LINES: an empty or placeholder salutation, greeting, thank you or closing line gets the prompt\'s own example', () => {
  const raw = baseRaw()
  raw.cover_letter.salutation = 'Dear [Hiring Manager Name],'
  raw.cover_letter.thank_you_line = ''
  raw.recruiter_message.greeting = "Hi [Recruiter's Name],"
  raw.recruiter_message.closing_line = '   '
  const result = validateDocuments(raw)
  const lines = [result.cover_letter.salutation, result.cover_letter.thank_you_line, result.recruiter_message.greeting, result.recruiter_message.closing_line]
  assert.deepEqual(lines, ['Dear Hiring Team,', 'Thank you for considering my application.', 'Hi,', 'I look forward to hearing from you.'])
  assert.doesNotMatch(lines.join(' '), /[-–—]/)
  const own = baseRaw()
  own.cover_letter.salutation = 'Dear Acme Hiring Team,'
  assert.equal(validateDocuments(own).cover_letter.salutation, 'Dear Acme Hiring Team,', 'a real line is kept')
})

test('LAST DRAFT: a clean draft is unchanged, and claims, a missing name or role, or another language are never repaired', () => {
  assert.deepEqual(validateDocuments(baseRaw(), REPAIR), validateDocuments(baseRaw()))
  assert.throws(() => validateDocuments(baseRaw({ new_claims_introduced: ['Led a team of 40'] }), REPAIR), /unverified claims/)
  assert.throws(() => validateDocuments(named(''), REPAIR), /missing a name/)
  const noExperience = baseRaw()
  noExperience.tailored_cv.experience = []
  assert.throws(() => validateDocuments(noExperience, REPAIR), /missing experience/)
  const dutch = baseRaw()
  dutch.tailored_cv.professional_summary = 'Ervaren backend ontwikkelaar. Levert betrouwbare diensten. Werkt graag in teams.'
  dutch.cover_letter.intro_paragraph = 'Ik solliciteer graag naar deze functie.'
  dutch.cover_letter.body_paragraphs = ['Ik bouwde diensten voor betalingen.', 'Daarnaast leidde ik een klein team.', 'Tot slot past uw cultuur goed bij mij.']
  dutch.cover_letter.conclusion_paragraph = 'Ik hoor graag van u.'
  dutch.recruiter_message.body = 'Ik heb gesolliciteerd naar de functie. Ik ben enthousiast over uw bedrijf.'
  assert.throws(() => validateDocuments(dutch, REPAIR), /English/)
})

test('LOGS: every document check has its own reason code', () => {
  const codes = [
    'Tailored CV is missing a name',
    'Tailored CV is missing a professional summary',
    'Tailored CV is missing experience',
    'Tailored CV is missing the follow up bullet',
    "Follow up bullet contains a placeholder instead of the candidate's own facts",
    'Cover letter is missing an introduction',
    'Cover letter must have exactly 3 body paragraphs',
    'Cover letter is written in third person instead of first person',
    'Recruiter message output is too short',
    'Recruiter message is written in third person instead of first person',
    'Recruiter message contains a statistic instead of a qualitative reason',
    'CV bullet contains an unfilled example placeholder (e.g. "X%") without being marked as one',
    'Model classified 2 area(s) to improve as case C but only produced 1 placeholder bullet(s)',
    'Document contains an unfilled example placeholder (e.g. "X%") instead of real or omitted content',
    'Document content did not look like English',
  ].map(classifyGenerationError)
  assert.equal(new Set(codes).size, codes.length, codes.join(', '))
  assert.ok(!codes.includes('other'))
})

test('CORRECTIONS: each failed check tells the retry its rule, never the draft\'s own words', () => {
  const note = retryCorrection(new Error('Model reported unverified claims not present in the original CV: ["Led Jamie Rivera\'s team at Acme"]'))
  assert.match(note ?? '', /only facts the original CV states/)
  assert.doesNotMatch(note ?? '', /Jamie|Acme/)
  for (const [message, rule] of [
    ['Recruiter message contains a statistic instead of a qualitative reason', /no number/],
    ['Cover letter is written in third person instead of first person', /first person/],
    ['Cover letter must have exactly 3 body paragraphs', /exactly 3 paragraphs/],
    ['Document content did not look like English', /entirely in English/],
    ['Model classified 1 area(s) to improve as case C but only produced 0 placeholder bullet(s)', /one such bullet for each case \(C\) area/],
  ] as const) {
    assert.match(retryCorrection(new Error(message)) ?? '', rule, message)
  }
  // Nothing to tell the model, or nothing it may be pressed for: an invented name or role is worse than a retry.
  for (const message of ['Tailored CV is missing a name', 'Tailored CV is missing experience', 'OpenAI API error: 500', 'OpenAI request timed out after 45000ms']) {
    assert.equal(retryCorrection(new Error(message)), null, message)
  }
})

test('LAST DRAFT: the generator repairs its rejected drafts newest first, and logs only codes', () => {
  const source = readFileSync('supabase/functions/generate-documents/index.ts', 'utf8')
  assert.match(source, /const lastDraftScope: ValidationScope = \{ \.\.\.scope, followUpRepeats: 'remove', repair: true \}/)
  assert.match(source, /for \(const draft of \[\.\.\.rejectedDrafts\]\.reverse\(\)\)/)
  assert.match(source, /console\.log\('generate-documents: last draft repaired', \{ reasons: attemptReasons, repairs \}\)/)
  assert.match(source, /job: \{\s*jobTitle: check\.job_title,\s*companyName: check\.company_name,\s*jobDescription: check\.job_description,\s*\}/)
})

console.log(`\n${passed} tests passed`)
