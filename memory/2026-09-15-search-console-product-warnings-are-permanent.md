Date
2026-09-15

Incorrect assumption or mistake
Treating the four Search Console structured data warnings on this site as a
defect to fix. They are not. A future session that sees them will be tempted to
add the named fields, which would either reverse a founder instruction or
fabricate data.

The four fields, and why each stays absent
`shippingDetails` and `hasMerchantReturnPolicy` are reported under Merchant
listings, and come from the single `Product` on `/pricing`. The founder ruled
both out in the PR #67 follow up, verbatim: "Do not add `shippingDetails` or
`hasMerchantReturnPolicy`". Nothing ships, because check credits are digital, so
there is no honest value for the first. The second could now be transcribed
truthfully from the refund terms in `src/pages/TermsPage.tsx`, a full refund
within seven days on a fully unused most recent pack, but the founder declined
on 2026-09-15 and kept the original instruction standing.

`review` and `aggregateRating` are reported under Product snippets, and come
from the sitewide `SoftwareApplication` on all 37 built pages as well as the
pricing `Product`. There is no review corpus. Inventing one breaks the standing
"do not invent testimonials or results" rule and Google's own policy. The
founder has said "do not add aggregateRating" twice, first on the Week 1 F1
SoftwareApplication fix.

Verified correct rule
Leave all four absent. Google classifies every one of them as non critical in
the notification body: suggestions that "don't prevent the page or feature from
appearing on Google". They will never clear, because a valid non retail
`Product` is permanently measured against a retail specification.

Two facts that make the email volume look worse than it is. Search Console
notifies per property, and this site has both a Domain property
`myrecruitercheck.com` and a URL prefix property `https://myrecruitercheck.com/`,
so every finding arrives twice. And the two findings are unrelated to whatever
was last deployed: they are a standing evaluation, not a regression.

How to prevent recurrence
Do not propose adding these fields, and do not treat a fresh notification as new
information. The noise is handled outside the codebase, by unsubscribing from
the specific message types on the Search Console Email Preferences page, which
is account wide and needs no code change. Record any future change of mind here
rather than inferring it from the warnings reappearing.
