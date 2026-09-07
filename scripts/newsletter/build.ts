// Renders a newsletter issue JSON file to HTML for pasting into Brevo.
//
//   npx tsx scripts/newsletter/build.ts scripts/newsletter/issue.example.json
//
// Writes the HTML beside the JSON. Paste the result into Brevo as a campaign
// (Campaigns > Email > Design > Paste your code). Brevo does the sending; this
// only fixes the look so no one rebuilds the layout each week.
import { readFileSync, writeFileSync } from 'node:fs'
import { renderIssue, validateIssue, type Issue } from './issue.ts'

const input = process.argv[2]
if (!input) {
  console.error('Usage: npx tsx scripts/newsletter/build.ts <issue.json>')
  process.exit(1)
}

const issue = JSON.parse(readFileSync(input, 'utf8')) as Issue

const problems = validateIssue(issue)
if (problems.length > 0) {
  console.error(`\n${input} cannot be sent:\n`)
  for (const problem of problems) console.error(`  ${problem}`)
  console.error('')
  process.exit(1)
}

const output = input.replace(/\.json$/, '.html')
writeFileSync(output, renderIssue(issue))
console.log(`Wrote ${output}`)
console.log(`  week ${issue.week}, ${issue.articles.length} article(s)`)
console.log('  Paste into Brevo: Campaigns > Email > Design > Paste your code')
