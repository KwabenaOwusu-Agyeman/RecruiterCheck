// Run with: OPENAI_API_KEY=<key> npx tsx scripts/live-sample-wording.ts
//           npx tsx scripts/live-sample-wording.ts --dry-run
//
// Sends the three synthetic roles in fixtures/synthetic/sample-wording-roles.ts
// (Frontend Developer, Machine Learning Engineer, Data Analyst) through the
// production analyze-check request (buildAnalysisRequestBody, the exact body
// index.ts sends) and the real normalizeAnalysis, with the same two attempt
// retry, then holds every stored area to improve to the sample wording rules:
//
//   - labelled "Sample wording:"
//   - passes validateSampleWording (no instruction, no "you", no placeholder)
//   - contains a digit
//   - uses at least one term from that role's job description vocabulary
//   - is not a verbatim copy of a calibration example
//   - is distinct from the other samples in the same check
//
// Prints the full feedback for review and exits non zero on any failure.
//
// Local only. Talks to api.openai.com and nothing else: no Supabase, no
// database, no storage, no candidate data. Every CV and job description it
// sends is invented (SAFE TEST DATA, see fixtures/synthetic/README.md). The
// API key is read from this process's environment and is never printed.
// --dry-run builds the requests and runs the checks against nothing, so the
// script itself can be exercised without a key or a network call.

import { buildAnalysisRequestBody, SAMPLE_WORDING_CALIBRATION_EXAMPLES } from '../supabase/functions/analyze-check/prompt.ts'
import {
  normalizeAnalysis,
  validateSampleWording,
  withRetry,
  type AnalysisResult,
  type RawAnalysis,
} from '../supabase/functions/analyze-check/logic.ts'
import { getScoreLabel } from '../src/lib/scoring.ts'
import { SAMPLE_WORDING_ROLES, type SampleWordingRole } from '../fixtures/synthetic/sample-wording-roles.ts'

const MAX_ATTEMPTS = 2
const OPENAI_TIMEOUT_MS = 60000
const dryRun = process.argv.includes('--dry-run')

function storedSampleWording(item: string): string {
  const match = item.match(/Sample wording:\s*([\s\S]*)$/)
  return match ? match[1].trim() : ''
}

interface CheckOutcome {
  role: string
  score: number
  label: string
  improvements: string[]
  failures: string[]
}

function checkImprovements(role: SampleWordingRole, analysis: AnalysisResult): CheckOutcome {
  const failures: string[] = []
  const samples = analysis.improvements.map(storedSampleWording)
  analysis.improvements.forEach((item, index) => {
    const sample = samples[index]
    const where = `${role.id} improvement ${index + 1}`
    if (!sample) {
      failures.push(`${where}: no "Sample wording:" clause`)
      return
    }
    const problem = validateSampleWording(sample)
    if (problem) failures.push(`${where}: sample ${problem}`)
    if (!/\d/.test(sample)) failures.push(`${where}: sample has no digit`)
    if (!role.roleTerms.some((term) => sample.toLowerCase().includes(term.toLowerCase()))) {
      failures.push(`${where}: sample uses none of the role's job description terms`)
    }
    if (SAMPLE_WORDING_CALIBRATION_EXAMPLES.some((example) => example.toLowerCase() === sample.toLowerCase())) {
      failures.push(`${where}: sample is a verbatim calibration example`)
    }
    if (samples.some((other, otherIndex) => otherIndex !== index && other.toLowerCase() === sample.toLowerCase())) {
      failures.push(`${where}: sample duplicates another sample in the same check`)
    }
    if (/[-–—]/.test(item)) failures.push(`${where}: contains a dash`)
  })
  return {
    role: role.id,
    score: analysis.interview_probability_score,
    label: getScoreLabel(analysis.interview_probability_score),
    improvements: analysis.improvements,
    failures,
  }
}

async function callModel(apiKey: string, role: SampleWordingRole, correctionNote: string | null) {
  const body = buildAnalysisRequestBody(role.cv, role.jobDescription, { jobTitle: role.jobTitle, companyName: null }, correctionNote)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS)
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`)
    const payload = (await response.json()) as { model?: string; choices?: Array<{ message?: { content?: string } }> }
    const rawText = payload.choices?.[0]?.message?.content
    if (!rawText) throw new Error('Empty response from analysis service')
    return { raw: JSON.parse(rawText) as RawAnalysis, model: payload.model ?? null }
  } finally {
    clearTimeout(timeout)
  }
}

async function runRole(apiKey: string, role: SampleWordingRole): Promise<CheckOutcome> {
  let attempts = 0
  const analysis = await withRetry(async (previousError) => {
    attempts += 1
    if (previousError) console.log(`  retry ${attempts} after validation failure: ${previousError.slice(0, 160)}`)
    const { raw, model } = await callModel(apiKey, role, previousError)
    return normalizeAnalysis(raw, role.cv, { model })
  }, MAX_ATTEMPTS)
  return checkImprovements(role, analysis)
}

function printOutcome(outcome: CheckOutcome) {
  console.log(`\n=== ${outcome.role}: ${outcome.score}% (${outcome.label}) ===`)
  outcome.improvements.forEach((item, index) => console.log(`  ${index + 1}. ${item}`))
  if (outcome.failures.length === 0) console.log('  PASS: every area to improve carries rule compliant sample wording')
  else outcome.failures.forEach((failure) => console.log(`  FAIL: ${failure}`))
}

async function main() {
  if (dryRun) {
    for (const role of SAMPLE_WORDING_ROLES) {
      const body = buildAnalysisRequestBody(role.cv, role.jobDescription, { jobTitle: role.jobTitle, companyName: null })
      console.log(
        `${role.id}: ${body.messages.length} messages, system prompt ${body.messages[0].content.length} chars, user prompt ${body.messages[1].content.length} chars, model ${body.model}, temperature ${body.temperature}`,
      )
    }
    console.log('\nDry run only: no request was sent. Set OPENAI_API_KEY to run the live check.')
    return
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('OPENAI_API_KEY is not set in this process environment. Run:')
    console.error('  OPENAI_API_KEY=<key> npx tsx scripts/live-sample-wording.ts')
    console.error('The key is read by this script only and never printed.')
    process.exit(2)
  }

  const outcomes: CheckOutcome[] = []
  for (const role of SAMPLE_WORDING_ROLES) {
    console.log(`\nRunning ${role.jobTitle} (${role.id})...`)
    try {
      const outcome = await runRole(apiKey, role)
      outcomes.push(outcome)
      printOutcome(outcome)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      outcomes.push({ role: role.id, score: -1, label: 'failed', improvements: [], failures: [`both attempts failed: ${message.slice(0, 400)}`] })
      printOutcome(outcomes[outcomes.length - 1])
    }
  }

  const failed = outcomes.filter((outcome) => outcome.failures.length > 0)
  console.log(`\n${'-'.repeat(64)}`)
  console.log(`  ${outcomes.length - failed.length}/${outcomes.length} roles passed`)
  process.exit(failed.length > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
