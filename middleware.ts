// Vercel Edge Middleware. Runs before the rewrites/static routing in
// vercel.json, so it can return a real HTTP 410 for URLs that used to exist
// but have been permanently discontinued (generic role pages outside the
// current tech/AI/ML/data audience), rather than a soft 404 or a redirect to
// an unrelated page.
//
// The matcher operates on the request pathname only — query strings are
// never part of it, so `?utm_source=...` on any of these paths still
// matches and still gets a 410. Vercel does not normalize trailing slashes
// for us (no `trailingSlash` setting in vercel.json), so the slash variant
// is listed explicitly for each path: this is a deliberate choice to give
// both forms the same 410, not an oversight.
export const config = {
  matcher: [
    '/registered-nurse-resume-checker',
    '/registered-nurse-resume-checker/',
    '/project-manager-resume-checker',
    '/project-manager-resume-checker/',
    '/sales-resume-checker',
    '/sales-resume-checker/',
    '/administrative-assistant-resume-checker',
    '/administrative-assistant-resume-checker/',
  ],
}

const body = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Page removed | MyRecruiterCheck</title>
    <meta name="robots" content="noindex, nofollow" />
  </head>
  <body>
    <h1>This page has been permanently removed</h1>
    <p>
      MyRecruiterCheck is now focused on tech, AI, machine learning and data roles, so this page
      no longer exists. See our
      <a href="https://myrecruitercheck.com/">homepage</a> or our
      <a href="https://myrecruitercheck.com/application-checker">Application Checker</a>.
    </p>
  </body>
</html>`

export default function middleware() {
  return new Response(body, {
    status: 410,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}
