// Run with: npx tsx src/lib/feedbackText.test.ts
import assert from 'node:assert/strict'
import { FICTIONAL_SAMPLE_NOTICE, hasSampleWording, splitFinding } from './feedbackText'

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

test('splitFinding separates a new check into finding, evidence and sample wording', () => {
  const result = splitFinding(
    'Expand on open source contributions. The CV does not show any open source work, which this role asks for. Sample wording: Submitted 5 pull requests to an open source React and TypeScript dashboard, resolving WCAG 2.2 keyboard navigation issues across 12 reusable components.',
  )
  assert.equal(result.title, 'Expand on open source contributions.')
  assert.equal(result.evidence, 'The CV does not show any open source work, which this role asks for.')
  assert.equal(
    result.sampleWording,
    'Submitted 5 pull requests to an open source React and TypeScript dashboard, resolving WCAG 2.2 keyboard navigation issues across 12 reusable components.',
  )
  assert.equal(result.example, '')
})

test('splitFinding still renders a historical check with an Example clause', () => {
  const result = splitFinding(
    'Quantify your impact. You mention improving onboarding but do not show the result. Example: Consider adding the percentage increase in performance.',
  )
  assert.equal(result.title, 'Quantify your impact.')
  assert.equal(result.evidence, 'You mention improving onboarding but do not show the result.')
  assert.equal(result.example, 'Consider adding the percentage increase in performance.')
  assert.equal(result.sampleWording, '')
})

test('splitFinding handles a strength with no clause at all', () => {
  const result = splitFinding('Strong frontend development experience. Your React work aligns with the role.')
  assert.equal(result.title, 'Strong frontend development experience.')
  assert.equal(result.evidence, 'Your React work aligns with the role.')
  assert.equal(result.example, '')
  assert.equal(result.sampleWording, '')
})

test('splitFinding protects decimals inside the sample wording and the evidence', () => {
  const result = splitFinding(
    'Show model evaluation. The CV reports no metric. Sample wording: Raised offline AUC from 0.81 to 0.87 by adding 3 engineered features to a LightGBM churn model.',
  )
  assert.equal(result.title, 'Show model evaluation.')
  assert.equal(result.evidence, 'The CV reports no metric.')
  assert.match(result.sampleWording, /0\.81 to 0\.87/)
})

test('splitFinding drops quotes wrapped around stored sample wording rather than doubling them', () => {
  const result = splitFinding('Quantify results. No result is shown. Sample wording: “Cut build time from 14 minutes to 6 minutes by caching dependencies.”')
  assert.equal(result.sampleWording, 'Cut build time from 14 minutes to 6 minutes by caching dependencies.')
})

test('hasSampleWording distinguishes new checks from historical ones', () => {
  assert.ok(hasSampleWording('Finding. Evidence. Sample wording: Built a thing used by 40 people.'))
  assert.ok(!hasSampleWording('Finding. Evidence. Example: Consider adding numbers.'))
  assert.ok(!hasSampleWording('Finding. Evidence.'))
})

test('the fictional notice carries no dashes and names the action', () => {
  assert.ok(!/[-–—]/.test(FICTIONAL_SAMPLE_NOTICE))
  assert.match(FICTIONAL_SAMPLE_NOTICE, /fictional examples/i)
  assert.match(FICTIONAL_SAMPLE_NOTICE, /real experience/i)
})

console.log(`\n${passed} tests passed`)
