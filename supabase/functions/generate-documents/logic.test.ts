// Run with: npx tsx supabase/functions/generate-documents/logic.test.ts
import assert from 'node:assert/strict'
import { classifyGenerationError, containsName, containsPlaceholder, getDocumentEntitlement, isRetryableGenerationError, PACK_DISPLAY_NAMES, looksLikeEnglish, splitSentences, stripDashes, stripExampleClause, toPdfSafe, toPdfSafeText, validateDocuments, type RawDocuments } from './logic.ts'

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

console.log(`\n${passed} tests passed`)
