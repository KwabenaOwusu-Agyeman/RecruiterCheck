# Refund copy — exact wording and placement (candidate, not yet applied)

Required exact meaning (as specified):

> "Packs are eligible for a refund within 7 days of purchase only if none of the
> included Recruiter Check credits or Keyword Scan credits have been used."

## 1. Pricing page — `src/pages/PricingPage.tsx`

Placed as a shared footnote beneath all three pack cards (identical rule for
every pack, not repeated per-card), same tier as the existing "Credits expire 90
days after purchase" line this page already needs:

```tsx
<p className='mt-4 text-center text-sm text-text-secondary'>
  Packs are eligible for a refund within 7 days of purchase only if none of the
  included Recruiter Check credits or Keyword Scan credits have been used.
</p>
```

## 2. Billing page — `src/pages/BillingPage.tsx`

Placed directly above the "Request refund" action, inside the existing
refund-eligibility UI block:

```tsx
<p className="mb-3 text-sm text-text-secondary">
  Packs are eligible for a refund within 7 days of purchase only if none of the included
  Recruiter Check credits or Keyword Scan credits have been used.
</p>
<Button onClick={handleRequestRefund} variant="secondary">
  Request refund
</Button>
```

The button's actual enabled/disabled state and the eligibility check itself
remain entirely server-driven — this text is informational only.
`reserve_refund` (§K in `01_production_migration.sql`) is the sole authority on
eligibility: it recomputes purchase age server-side, requires both credit types
fully unused, and rejects with a specific reason code (`already_used`,
`window_expired`, `active_reservation_exists`, `already_refund_pending`,
`already_refunded`) that the client displays but never decides.

## 3. Refund explanation surface

No standalone "refund policy" page exists in the current route list (confirmed
via the earlier full route audit). The two placements above are the only
user-facing surfaces describing this rule today. If a dedicated refund/guarantee
explainer is added later, the same sentence belongs there too.

## 4. Terms of Service — genuine conflict found, NOT resolved here

See `TOS_CONFLICT_REPORT.md` in this same directory. **I have not written or
proposed replacement Terms language.** The existing clause describes a
recurring-subscription billing model that no longer exists in the product and an
email-contact refund process that doesn't match the implemented self-service
flow — this is beyond a "straightforward consistency edit" and needs your
explicit direction on how far to update it, not an invented rewrite from me.
