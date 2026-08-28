# `src/pages/TermsPage.tsx` — candidate diff (review-only, not applied)

Founder-authorized replacement of lines 88–107 (Section "8. Subscriptions, Fees
& Payment").

## Before (current, lines 88–107)

```tsx
<Section title='8. Subscriptions, Fees & Payment'>
  <p>
    Paid plans are billed in advance on a recurring basis (weekly or monthly, as
    selected at checkout) via our payment processor, Stripe. Subscriptions renew
    automatically at the end of each billing period until cancelled. Prices are
    shown in EUR and may include applicable taxes.
  </p>
  <p>
    If you are not satisfied with your first paid check, you may request a full
    refund within 7 days of that payment by contacting{' '}
    <a
      href='mailto:support@recruitercheck.app'
      className='font-medium text-blue hover:underline'
    >
      support@recruitercheck.app
    </a>
    . Beyond this guarantee, MyRecruiterCheck does not offer refunds or credits
    for partial billing periods, unused checks, or dissatisfaction with
    generated results, except where required by mandatory law. You can cancel at
    any time from the billing portal to stop future renewals; your plan remains
    active until the end of the current billing period.
  </p>
</Section>
```

## After (candidate)

```tsx
<Section title='8. Pricing, Payment & Refunds'>
  <p>
    MyRecruiterCheck packs are one-time purchases, not subscriptions. There is
    no recurring billing and nothing to cancel. Each pack grants a fixed number
    of Recruiter Check credits and Keyword Scan credits:
  </p>
  <ul className='list-disc space-y-1 pl-6'>
    <li>Starter: 5 Recruiter Checks and 5 Keyword Scans for €10</li>
    <li>Active: 15 Recruiter Checks and 15 Keyword Scans for €20</li>
    <li>Power: 40 Recruiter Checks and 40 Keyword Scans for €40</li>
  </ul>
  <p>
    Prices are shown in EUR and may include applicable taxes. Payments are
    processed by Stripe. Both Recruiter Check credits and Keyword Scan credits
    from a pack expire 90 days after purchase.
  </p>
  <p>
    A pack is eligible for a refund within 7 days of purchase only if none of
    its included Recruiter Check credits or Keyword Scan credits have been used.
    A credit that is currently reserved for an in-progress task makes the pack
    temporarily ineligible for a refund until that task completes or is safely
    released; a valid release following a failed task can restore eligibility.
    Refund requests are made through your account's Billing page. Eligibility is
    determined by our systems based on your account's actual usage record, not
    by any information supplied through your browser. Nothing in these Terms or
    our refund policy affects any statutory rights you may have.
  </p>
</Section>
```

## Notes on this diff

- The `mailto:support@recruitercheck.app` refund path is **removed**, matching
  the actual self-service `request-refund` flow. Support email likely still
  exists elsewhere in this document for general contact — not touched here, only
  the refund-specific reference.
- "Recurring basis," "Subscriptions renew automatically," "billing portal,"
  "current billing period" are all removed — none apply to the current product.
- The reserved-credit and released-eligibility clauses translate
  `reserve_refund`'s `active_reservation_exists` outcome and the
  release-restores-eligibility behavior into plain-language terms, without
  over-specifying implementation detail.
- V4.1 correction: the closing sentence is now exactly "Nothing in these Terms
  or our refund policy affects any statutory rights you may have." — per your
  explicit instruction, replacing an earlier draft that characterized specific
  statutory withdrawal rights (a 14-day EU digital-services right) and implied
  this 7-day commercial refund policy supplements or interacts with it in a
  particular way. This version makes no claim about which statutory rights
  exist, in which jurisdiction, or how they relate to the pack-refund guarantee
  — it is a pure non-waiver, not a characterization, so it carries no
  legal-accuracy risk for me to have introduced.
