/**
 * Every route defined by a hand built React component, in sitemap order.
 *
 * This list exists because these pages ARE code: a landing page is a component,
 * not a content file, so nothing can discover it from a directory. It is the
 * one list that still has to be edited by hand, and it stops growing the moment
 * editorial content moves to the publishing pipeline, which discovers its own
 * routes.
 *
 * It replaces two copies of the same knowledge: the literal array that used to
 * live in scripts/prerender.mjs and the hand maintained public/sitemap.xml.
 * Both now derive from here, so they cannot disagree.
 *
 * lastmod is deliberately NOT here. A date typed by hand goes stale silently,
 * which is exactly what happened to the static sitemap. See
 * scripts/static-lastmod.json, generated from git by npm run sitemap:lastmod.
 */
export interface StaticRoute {
  path: string
  changefreq: string
  priority: string
}

export const STATIC_ROUTES: StaticRoute[] = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/pricing', changefreq: 'weekly', priority: '0.9' },
  { path: '/about', changefreq: 'monthly', priority: '0.5' },
  { path: '/faq', changefreq: 'monthly', priority: '0.6' },
  { path: '/privacy', changefreq: 'yearly', priority: '0.3' },
  { path: '/terms', changefreq: 'yearly', priority: '0.3' },
  { path: '/disclaimer', changefreq: 'yearly', priority: '0.3' },
  { path: '/cookies', changefreq: 'yearly', priority: '0.3' },
  { path: '/application-checker', changefreq: 'weekly', priority: '0.9' },
  { path: '/resume-job-description-match', changefreq: 'weekly', priority: '0.9' },
  { path: '/interview-probability-score', changefreq: 'weekly', priority: '0.9' },
  { path: '/free-cv-checker', changefreq: 'weekly', priority: '0.9' },
  { path: '/ats-resume-checker', changefreq: 'weekly', priority: '0.9' },
  { path: '/tailor-cv-to-job-description', changefreq: 'weekly', priority: '0.8' },
  { path: '/cv-keyword-checker', changefreq: 'weekly', priority: '0.8' },
  { path: '/cover-letter-generator', changefreq: 'weekly', priority: '0.8' },
  { path: '/recruiter-message-generator', changefreq: 'weekly', priority: '0.8' },
  { path: '/resume-strengths-and-weaknesses', changefreq: 'weekly', priority: '0.8' },
  { path: '/job-application-feedback', changefreq: 'weekly', priority: '0.8' },
  { path: '/how-recruiters-evaluate-a-cv', changefreq: 'weekly', priority: '0.8' },
  { path: '/how-interview-score-works', changefreq: 'weekly', priority: '0.8' },
  { path: '/software-engineer-resume-checker', changefreq: 'weekly', priority: '0.7' },
  { path: '/data-analyst-cv-checker', changefreq: 'weekly', priority: '0.7' },
  { path: '/data-scientist-cv-checker', changefreq: 'weekly', priority: '0.7' },
  { path: '/machine-learning-engineer-cv-checker', changefreq: 'weekly', priority: '0.7' },
  { path: '/ai-engineer-cv-checker', changefreq: 'weekly', priority: '0.7' },
  { path: '/myrecruitercheck-vs-chatgpt', changefreq: 'monthly', priority: '0.7' },
  { path: '/myrecruitercheck-vs-jobscan', changefreq: 'monthly', priority: '0.6' },
  { path: '/myrecruitercheck-vs-resume-worded', changefreq: 'monthly', priority: '0.6' },
  { path: '/myrecruitercheck-vs-teal', changefreq: 'monthly', priority: '0.6' },
  { path: '/myrecruitercheck-vs-rezi', changefreq: 'monthly', priority: '0.6' },
  { path: '/myrecruitercheck-vs-kickresume', changefreq: 'monthly', priority: '0.6' },
]

export function staticRoutePaths(): string[] {
  return STATIC_ROUTES.map((route) => route.path)
}
