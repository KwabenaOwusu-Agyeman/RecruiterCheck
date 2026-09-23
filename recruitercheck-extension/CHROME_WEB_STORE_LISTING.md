# Chrome Web Store listing — copy to paste into the Developer Dashboard

## Extension name
MyRecruiterCheck: Job Capture

## Summary (132 characters max)
Capture the job posting you're viewing in one click and send it to MyRecruiterCheck for a check the way a recruiter sees it.

## Category
Productivity

## Description (full)
See your job application the way a recruiter will before you send it.

MyRecruiterCheck: Job Capture does one thing: it gets the job posting you're
looking at into MyRecruiterCheck, without you copying and pasting a word.

HOW IT WORKS
1. Open a job posting on LinkedIn, Indeed, or almost any company careers page.
2. Click the MyRecruiterCheck icon and press "Capture this job."
3. Review the captured title, company, and description.
4. Press "Check this job." It opens in MyRecruiterCheck with the job already
   filled in. Add your CV and run your Recruiter Check.

WHAT IT DOES
- Reads only the job posting on the page you're currently viewing, and only
  when you click Capture. Never in the background, never continuously.
- Captures the job title, company name, job description, and the page URL.
- Requires its own one-time connection to your MyRecruiterCheck account (no
  password entry inside the extension).

WHAT IT DOESN'T DO
- Does not read your browsing history, cookies, or passwords.
- Does not touch your LinkedIn profile, connections, messages, or feed.
- Does not track jobs, autofill applications, or apply on your behalf.

A MyRecruiterCheck account is required (first check free, no card required). Sign up at
https://myrecruitercheck.com.

Privacy policy: https://myrecruitercheck.com/privacy

## Single-purpose description (for the mandatory Chrome Web Store field)
Captures the job posting the user is currently viewing, on explicit click
only, and sends it to the user's own MyRecruiterCheck account to pre-fill a
new Recruiter Check.

## Permission justifications

**storage**: stores the extension's own MyRecruiterCheck session (separate
from the website's session) so the user doesn't have to reconnect every time.

**activeTab**: lets the extension read the job posting on the tab the user
is currently viewing, only after they click "Capture this job." No access to
any other tab.

**scripting**: used to run the on-click job-reading logic on the active tab
after the user presses Capture. Never injected automatically or in the
background.

**identity**: used only for the one-time "Connect MyRecruiterCheck" flow,
which opens a browser-controlled window for the user to authorize the
extension on their existing, already-signed-in MyRecruiterCheck account. No
password is ever entered inside the extension.

## Privacy practices (Developer Dashboard "Privacy" tab)

Data categories collected, per the audit report's verified data-handling
findings:

- **Website content**: the job title, company name, job description, and
  page URL of the posting the user explicitly captures. Nothing else on the
  page.
- **Authentication information**: the extension's own MyRecruiterCheck
  session, established through a single-use, short-lived, server-issued code,
  not a password. It never reads the web app's cookies or the user's
  password.

Everything else (personally identifiable information beyond the account
connection, health, financial, location, web history, user activity,
personal communications) does not apply. Not collected.

Certifications (all true, matching the audit's findings):
- Does not sell or transfer user data to third parties outside approved use.
- Does not use or transfer user data for purposes unrelated to the single
  purpose above.
- Does not use or transfer user data to determine creditworthiness or for
  lending.

Privacy policy URL: https://myrecruitercheck.com/privacy (Section 14,
"Browser Extension").

## Screenshots

Captured 2026-09-23 against real postings, live end to end: (1) the
"Capture this job" initial popup state, (2) the preview state showing a
captured job with "Check this job," (3) New Check pre-filled after clicking
through. Held locally by the founder, ready to upload to the Developer
Dashboard.
