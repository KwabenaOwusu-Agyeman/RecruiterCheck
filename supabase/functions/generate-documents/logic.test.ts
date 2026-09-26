// Run with: npx tsx supabase/functions/generate-documents/logic.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { answerOnlyFacts, repeatedAnswerFacts, withoutRepeatedFacts, classifyGenerationError, containsName, containsPlaceholder, FOLLOW_UP_BULLET_SCHEMA, FOLLOW_UP_DOCUMENT_ADDENDUM, FOLLOW_UP_SECTION_HEADING, FollowUpRepeatedError, followUpRepeatedCorrection, getDocumentEntitlement, isRetryableGenerationError, PACK_DISPLAY_NAMES, looksLikeEnglish, splitSentences, statedInAnswer, stripDashes, stripExampleClause, toPdfSafe, toPdfSafeText, validateDocuments, type RawDocuments } from './logic.ts'

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
  assert.equal(classifyGenerationError('Cover letter is written in third person instead of first person'), 'cover_letter_invalid')
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
  assert.equal(classifyGenerationError('Tailored CV is missing the follow up bullet'), 'cv_incomplete')
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

test('FOLLOW UP: a self reported claim the answer itself states is excused', () => {
  const stated = credited((draft) => {
    draft.new_claims_introduced = ['1,500 requests per day', 'Docker', 'Cloud Run', 'three months', 'FastAPI services']
  })
  assert.equal(validateDocuments(stated, SOURCE_SCOPE).tailored_cv.follow_up_bullet, LINE)
  // Without a credited answer every self reported claim still fails, as before.
  assert.throws(() => validateDocuments(stated, FOLLOW_UP_SCOPE), /unverified claims/)
  assert.throws(() => validateDocuments({ ...baseRaw(), new_claims_introduced: ['Docker'] }), /unverified claims/)
})

test('FOLLOW UP: a claim about the answer\'s own facts is excused even reworded, one adding a figure or about anything else is not', () => {
  // The model tends to list the follow up line itself, reworded: statedInAnswer
  // alone rejected these, failing every attempt, as on the live runs.
  const reworded = credited((draft) => {
    draft.new_claims_introduced = [
      'Built and deployed a FastAPI service using Docker and Cloud Run, handling around 1,500 requests per day for three months.',
      'Google Cloud Run',
      'deployment on cloud run',
    ]
  })
  assert.equal(statedInAnswer('Google Cloud Run', ANSWER), false)
  assert.equal(validateDocuments(reworded, SOURCE_SCOPE).tailored_cv.follow_up_bullet, LINE)
  for (const claim of ['Led a team of 12 engineers on the Cloud Run migration', 'AWS Solutions Architect certification', 'Kubernetes']) {
    const added = credited((draft) => {
      draft.new_claims_introduced = [claim]
    })
    assert.throws(() => validateDocuments(added, SOURCE_SCOPE), /unverified claims/, claim)
  }
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
  assert.match(source, /repeatingDraft = raw\s*correction = followUpRepeatedCorrection\(error\.repeated\)/)
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

test('FOLLOW UP: removal drops every bullet that repeats the answer, a placeholder too, and the case C count still holds', () => {
  const raw = credited((draft) => {
    draft.tailored_cv.experience[0].bullets.push(
      { text: 'Containerised services with Docker for faster releases.', is_placeholder: false },
      { text: 'Deployed a service on Cloud Run handling [X] requests.', is_placeholder: true },
    )
    draft.improvement_classifications = [{ case: 'C' }]
  })
  const bullets = validateDocuments(raw, REMOVE_SCOPE).tailored_cv.experience[0].bullets.map((bullet) => bullet.text)
  assert.ok(!bullets.some((text) => text.includes('Docker') || text.includes('Cloud Run')), bullets.join(' | '))
  assert.equal(bullets.length, 2, 'the two original bullets stay')
})

test('FOLLOW UP: every printed field is checked, and a repeat removal cannot reach still fails', () => {
  const inTitle = credited((draft) => {
    draft.tailored_cv.experience[0].title = 'Cloud Run Platform Engineer'
  })
  assert.deepEqual(repeatedIn(inTitle), ['Cloud Run'])
  assert.throws(() => validateDocuments(inTitle, REMOVE_SCOPE), FollowUpRepeatedError)
  const elsewhere: Array<(draft: RawDocuments) => void> = [
    (draft) => { draft.tailored_cv.experience[0].company_location = 'Docker, Amsterdam' },
    (draft) => { draft.tailored_cv.experience[0].dates = '1500 to Present' },
    (draft) => { draft.tailored_cv.education[0].degree = 'Certificate in Docker' },
    (draft) => { draft.tailored_cv.languages = ['English', 'Cloud Run'] },
  ]
  for (const edit of elsewhere) assert.equal(repeatedIn(credited(edit)).length, 1)
})

test('FOLLOW UP: the letter\'s salutation and address line name the employer, so they are never checked', () => {
  const raw = credited((draft) => {
    draft.cover_letter.salutation = 'Dear Docker Hiring Team,'
    draft.cover_letter.company_location = 'Cloud Run Offices, Amsterdam'
  })
  assert.deepEqual(repeatedIn(raw), [])
})

test('FOLLOW UP: removal fails rather than print a cover letter with no body paragraph left', () => {
  const raw = credited((draft) => {
    draft.cover_letter.body_paragraphs = [
      'I deployed services on Cloud Run.',
      'I handled around 1,500 requests per day.',
      'I containerised them with Docker.',
    ]
  })
  assert.throws(() => validateDocuments(raw, REMOVE_SCOPE), FollowUpRepeatedError)
})

test('FOLLOW UP: removal takes whole sentences, past abbreviations and closing quotes, leaving no fragment', () => {
  const facts = answerOnlyFacts(ANSWER, ORIGINAL_CV)
  assert.equal(withoutRepeatedFacts('I used tools, e.g. Docker, daily. I write tests.', facts), 'I write tests.')
  assert.equal(withoutRepeatedFacts('My lead said "It ran on Cloud Run." Then I moved teams.', facts), 'Then I moved teams.')
  assert.equal(withoutRepeatedFacts('I write tests. No stop at the end', facts), 'I write tests. No stop at the end')
  assert.equal(withoutRepeatedFacts('I joined Acme Inc. and shipped Docker tooling. I write tests.', facts), 'I write tests.')
  assert.equal(withoutRepeatedFacts('I grew the U.S. market with Docker images. I write tests.', facts), 'I write tests.')
})

// Invented: a language gap answered from a call centre job the CV does not show.
const SPANISH = { ...FOLLOW_UP_SCOPE, followUpSource: { answer: 'At a Madrid call centre I handled Spanish calls, around 60 a day, for 18 months.', cvText: ORIGINAL_CV } }

test('FOLLOW UP: removal drops a language, an education entry or a whole job built from the answer', () => {
  const draft = credited((raw) => {
    raw.tailored_cv.languages = ['English', 'Spanish (fluent)']
    raw.tailored_cv.education.push({ degree: 'Spanish Language Certificate', institution: 'Instituto Cervantes', dates: '2024' })
    raw.tailored_cv.experience.push({
      title: 'Spanish Support Agent',
      company_location: 'Call centre, Madrid',
      dates: '2023 to 2024',
      bullets: [{ text: 'Handled customer calls every day.', is_placeholder: false }],
    })
  })
  assert.ok(repeatedIn(draft, SPANISH).includes('Spanish'), 'rejected while retries remain')
  const result = validateDocuments(draft, { ...SPANISH, followUpRepeats: 'remove' })
  assert.deepEqual(result.tailored_cv.languages, ['English'])
  assert.deepEqual(result.tailored_cv.education.map((entry) => entry.degree), ['BSc Computer Science'])
  assert.deepEqual(result.tailored_cv.experience.map((entry) => entry.title), ['Senior Backend Engineer'])
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

console.log(`\n${passed} tests passed`)
