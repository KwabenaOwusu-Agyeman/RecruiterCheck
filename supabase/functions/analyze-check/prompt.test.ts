// Run with: npx tsx supabase/functions/analyze-check/prompt.test.ts
//
// Pins the parts of the analyze-check prompt and response schema that the
// sample wording rules depend on, so a later prompt edit cannot quietly drop
// them and reintroduce placeholder style "Consider adding..." examples.
import assert from 'node:assert/strict'
import {
  ANALYSIS_MODEL,
  ANALYSIS_RESPONSE_FORMAT,
  buildAnalysisRequestBody,
  buildSystemPrompt,
  buildUserPrompt,
  SAMPLE_WORDING_CALIBRATION_EXAMPLES,
} from './prompt.ts'
import { normalizeSampleWording, validateSampleWording } from './logic.ts'

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

const prompt = buildSystemPrompt({ jobTitle: 'Frontend Developer', companyName: null })

test('the system prompt carries a SAMPLE WORDING section with the mandatory rules', () => {
  assert.match(prompt, /== SAMPLE WORDING \(improvement_N_example and requirements\[\]\.sample_wording\) ==/)
  assert.match(prompt, /Write exactly 1 complete, usable CV bullet/)
  assert.match(prompt, /past tense/)
  assert.match(prompt, /"Consider", "Include", "Mention", "Provide", "Add"/)
  assert.match(prompt, /any second person "you" or "your"/)
  assert.match(prompt, /terminology from the job description/)
  assert.match(prompt, /ATS keywords naturally/)
  assert.match(prompt, /Never stuff keywords/)
  assert.match(prompt, /specific action, the technical implementation, and the outcome/)
  assert.match(prompt, /Write every number as a digit: "5", not "five"; "2 days", not "two days"/)
  assert.match(prompt, /Never use a placeholder such as "X%", "\[X%\]", "\[project\]", "\[technology\]"/)
  assert.match(prompt, /fictional but believable project details, metrics and outcomes/)
  assert.match(prompt, /never claim they came from the CV/)
  assert.match(prompt, /Vary the sentence structure, verbs, and metrics/)
  assert.match(prompt, /Avoid impossible, exaggerated, or technically inaccurate claims/)
  assert.match(prompt, /Never include a BSN, passport number, permit number/)
})

test('the system prompt no longer asks for placeholder style examples', () => {
  assert.doesNotMatch(prompt, /generic placeholders such as X%/)
  assert.doesNotMatch(prompt, /never an invented number/)
})

test('the system prompt asks for all three improvement slots and makes sample wording mandatory for each', () => {
  assert.match(prompt, /Fill all three slots with three distinct improvements/)
  assert.match(prompt, /The example field is sample wording and must follow the SAMPLE WORDING rules below without exception/)
})

test('the system prompt exempts sample wording from the invented claims self check', () => {
  assert.match(prompt, /never list anything from a sample wording field in new_claims_introduced/)
  assert.match(prompt, /Sample wording fields \(improvement_N_example and requirements\[\]\.sample_wording\) are fictional illustrations by design/)
})

test('the three calibration examples are in the prompt and each passes the validator', () => {
  assert.equal(SAMPLE_WORDING_CALIBRATION_EXAMPLES.length, 3)
  for (const example of SAMPLE_WORDING_CALIBRATION_EXAMPLES) {
    assert.ok(prompt.includes(example), `missing calibration example: ${example}`)
    assert.equal(validateSampleWording(normalizeSampleWording(example)), null, example)
    assert.match(example, /\d/)
    assert.ok(!/[-–—]/.test(example), `dash in calibration example: ${example}`)
  }
})

test('the response schema requires sample_wording on every requirement and an example on every improvement slot', () => {
  const schema = ANALYSIS_RESPONSE_FORMAT.json_schema.schema
  const requirementItem = schema.properties.requirements.items
  assert.ok('sample_wording' in requirementItem.properties)
  assert.ok((requirementItem.required as readonly string[]).includes('sample_wording'))
  for (const slot of [1, 2, 3]) {
    const key = `improvement_${slot}_example`
    assert.ok((schema.required as readonly string[]).includes(key))
    assert.match((schema.properties as Record<string, { description?: string }>)[key].description ?? '', /Sample wording/)
  }
  assert.match(schema.properties.new_claims_introduced.description, /Sample wording fields are fictional by design/)
  assert.equal(ANALYSIS_RESPONSE_FORMAT.json_schema.strict, true)
})

test('buildAnalysisRequestBody is the exact production request: model, temperature 0, strict schema, inputs in the user turn', () => {
  const body = buildAnalysisRequestBody('CV TEXT HERE', 'JOB TEXT HERE', { jobTitle: 'Data Analyst', companyName: 'Quillon' })
  assert.equal(body.model, ANALYSIS_MODEL)
  assert.equal(body.model, 'gpt-4o-mini')
  assert.equal(body.temperature, 0)
  assert.equal(body.messages.length, 2)
  assert.equal(body.messages[0].role, 'system')
  assert.equal(body.messages[1].role, 'user')
  assert.equal(body.messages[1].content, buildUserPrompt('CV TEXT HERE', 'JOB TEXT HERE', { jobTitle: 'Data Analyst', companyName: 'Quillon' }))
  assert.match(body.messages[1].content, /Job title: Data Analyst/)
  assert.match(body.messages[1].content, /CV:\nCV TEXT HERE/)
  assert.equal(body.response_format, ANALYSIS_RESPONSE_FORMAT)
})

test('buildAnalysisRequestBody appends the correction turn only on a retry', () => {
  const retry = buildAnalysisRequestBody('cv', 'jd', { jobTitle: null, companyName: null }, 'improvement_2_example reads as an instruction')
  assert.equal(retry.messages.length, 3)
  assert.match(retry.messages[2].content, /rejected by validation for this reason: improvement_2_example reads as an instruction/)
  assert.match(retry.messages[2].content, /Using the same job description and CV above/)
})

test('a known job title is echoed back through the prompt instead of re extracted', () => {
  assert.match(prompt, /job_title: Frontend Developer, company_name: unknown/)
  const blind = buildSystemPrompt({ jobTitle: null, companyName: null })
  assert.match(blind, /extract both directly from the job description text/)
})

console.log(`\n${passed} tests passed`)
