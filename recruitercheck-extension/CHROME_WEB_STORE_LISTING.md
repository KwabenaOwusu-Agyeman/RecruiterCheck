# Chrome Web Store listing — copy to paste into the Developer Dashboard

## Extension name
MyRecruiterCheck — Job Capture

## Summary (132 characters max)
Capture the job posting you're viewing in one click and send it to MyRecruiterCheck for a recruiter's-eye check.

## Category
Productivity

## Description (full)
See your job application the way a recruiter will before you send it.

MyRecruiterCheck — Job Capture does one thing: it gets the job posting you're
looking at into MyRecruiterCheck, without you copying and pasting a word.

HOW IT WORKS
1. Open a job posting on LinkedIn, Indeed, or almost any company careers page.
2. Click the MyRecruiterCheck icon and press "Capture this job."
3. Review the captured title, company, and description.
4. Press "Check this job" — it opens in MyRecruiterCheck with the job already
   filled in. Add your CV and run your Recruiter Check.

WHAT IT DOES
- Reads only the job posting on the page you're currently viewing, and only
  when you click Capture — never in the background, never continuously.
- Captures the job title, company name, job description, and the page URL.
- Requires its own one-time connection to your MyRecruiterCheck account (no
  password entry inside the extension).

WHAT IT DOESN'T DO
- Does not read your browsing history, cookies, or passwords.
- Does not touch your LinkedIn profile, connections, messages, or feed.
- Does not track jobs, autofill applications, or apply on your behalf.
- Does not run on any page until you explicitly click Capture.

A MyRecruiterCheck account is required (free tier available) — sign up at
https://myrecruitercheck.com.

Privacy policy: https://myrecruitercheck.com/privacy

## Single-purpose description (for the mandatory Chrome Web Store field)
Captures the job posting the user is currently viewing, on explicit click
only, and sends it to the user's own MyRecruiterCheck account to pre-fill a
new Recruiter Check.

## Permission justifications

**storage** — stores the extension's own MyRecruiterCheck session (separate
from the website's session) so the user doesn't have to reconnect every time.

**activeTab** — lets the extension read the job posting on the tab the user
is currently viewing, only after they click "Capture this job." No access to
any other tab.

**scripting** — used to run the on-click job-reading logic on the active tab
after the user presses Capture. Never injected automatically or in the
background.

**identity** — used only for the one-time "Connect MyRecruiterCheck" flow,
which opens a browser-controlled window for the user to authorize the
extension on their existing, already-signed-in MyRecruiterCheck account. No
password is ever entered inside the extension.

## Screenshots needed before submission (not yet captured)
Chrome Web Store requires at least one 1280x800 or 640x400 screenshot.
Recommended: (1) the "Capture this job" initial popup state, (2) the preview
state showing a captured job with "Check this job," (3) New Check pre-filled
after clicking through.
