// Regenerates scripts/static-lastmod.json from git history.
//
//   npm run sitemap:lastmod
//
// WHY A COMMITTED SNAPSHOT RATHER THAN READING GIT DURING THE BUILD
//
// The sitemap needs a lastmod for every hand built page. The honest source is
// the last commit that touched the page's component, and that is what this
// script reads. It does NOT run during the production build, because Vercel
// clones shallow: `git log -1 -- <file>` there can return nothing for a file
// that was not touched inside the fetched depth, and a sitemap generator that
// silently loses a date, or invents one, is worse than no automation at all.
//
// So the date is computed here, where the full history exists, committed, and
// read by the build. It is generated rather than typed, which is the property
// that matters: nobody maintains these dates by hand.
//
// Run it whenever a page component changes. scripts/build-sitemap.mjs fails
// the build if a route is missing from the snapshot, so a forgotten run is
// caught rather than shipped.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const outPath = path.join(rootDir, 'scripts', 'static-lastmod.json')

/**
 * Which files decide a route's last modification.
 *
 * The homepage is assembled from many components, so it takes the most recent
 * of all of them. Everything else is its own page component. A route missing
 * here is a build failure, not a guess.
 */
const SOURCES = {
  '/': ['src/pages/LandingPage.tsx', 'src/features/landing/'],
  '/about': ['src/pages/AboutPage.tsx'],
  '/faq': ['src/pages/FaqPage.tsx'],
  '/terms': ['src/pages/TermsPage.tsx'],
  '/privacy': ['src/pages/PrivacyPage.tsx'],
  '/cookies': ['src/pages/CookiePage.tsx'],
  '/disclaimer': ['src/pages/DisclaimerPage.tsx'],
  '/pricing': ['src/pages/PricingPage.tsx'],
  '/application-checker': ['src/pages/ApplicationCheckerPage.tsx'],
  '/free-cv-checker': ['src/pages/FreeCvCheckerPage.tsx'],
  '/ats-resume-checker': ['src/pages/AtsResumeCheckerPage.tsx'],
  '/tailor-cv-to-job-description': ['src/pages/TailorCvToJobPage.tsx'],
  '/cv-keyword-checker': ['src/pages/CvKeywordCheckerPage.tsx'],
  '/cover-letter-generator': ['src/pages/CoverLetterGeneratorPage.tsx'],
  '/recruiter-message-generator': ['src/pages/RecruiterMessageGeneratorPage.tsx'],
  '/resume-strengths-and-weaknesses': ['src/pages/ResumeStrengthsWeaknessesPage.tsx'],
  '/job-application-feedback': ['src/pages/JobApplicationFeedbackPage.tsx'],
  '/how-recruiters-evaluate-a-cv': ['src/pages/RecruiterEvaluationPage.tsx'],
  '/resume-job-description-match': ['src/pages/ResumeJobMatchPage.tsx'],
  '/interview-probability-score': ['src/pages/InterviewProbabilityPage.tsx'],
  '/how-interview-score-works': ['src/pages/HowInterviewScoreWorksPage.tsx'],
  '/software-engineer-resume-checker': ['src/pages/SoftwareEngineerResumeCheckerPage.tsx'],
  '/data-analyst-cv-checker': ['src/pages/DataAnalystCvCheckerPage.tsx'],
  '/data-scientist-cv-checker': ['src/pages/DataScientistCvCheckerPage.tsx'],
  '/machine-learning-engineer-cv-checker': ['src/pages/MachineLearningEngineerCvCheckerPage.tsx'],
  '/ai-engineer-cv-checker': ['src/pages/AiEngineerCvCheckerPage.tsx'],
  '/myrecruitercheck-vs-chatgpt': ['src/pages/MyRecruiterCheckVsChatGptPage.tsx'],
  '/myrecruitercheck-vs-jobscan': ['src/pages/MyRecruiterCheckVsJobscanPage.tsx'],
  '/myrecruitercheck-vs-resume-worded': ['src/pages/MyRecruiterCheckVsResumeWordedPage.tsx'],
  '/myrecruitercheck-vs-teal': ['src/pages/MyRecruiterCheckVsTealPage.tsx'],
  '/myrecruitercheck-vs-rezi': ['src/pages/MyRecruiterCheckVsReziPage.tsx'],
  '/myrecruitercheck-vs-kickresume': ['src/pages/MyRecruiterCheckVsKickresumePage.tsx'],
}

const lastmod = {}
const missing = []

for (const [route, paths] of Object.entries(SOURCES)) {
  const date = execFileSync(
    'git',
    ['log', '-1', '--format=%ad', '--date=short', '--', ...paths],
    { cwd: rootDir, encoding: 'utf-8' },
  ).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    missing.push(route)
    continue
  }
  lastmod[route] = date
}

if (missing.length > 0) {
  console.error(
    `\nCannot generate lastmod: git returned no date for ${missing.join(', ')}.\n` +
      'Run this with full git history, not a shallow clone.\n',
  )
  process.exit(1)
}

const sorted = Object.fromEntries(Object.keys(lastmod).sort().map((k) => [k, lastmod[k]]))
fs.writeFileSync(outPath, `${JSON.stringify({ lastmod: sorted }, null, 2)}\n`)
console.log(`wrote ${path.relative(rootDir, outPath)} for ${Object.keys(sorted).length} routes`)
