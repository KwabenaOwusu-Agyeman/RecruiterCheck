# Terms of Service — refund clause conflict report

Read directly from `src/pages/TermsPage.tsx` (lines 88–107, section "8.
Subscriptions, Fees & Payment") during this review. Exact current text:

> "Paid plans are billed in advance on a recurring basis (weekly or monthly, as
> selected at checkout) via our payment processor, Stripe. Subscriptions renew
> automatically at the end of each billing period until cancelled. Prices are
> shown in EUR and may include applicable taxes.
>
> If you are not satisfied with your first paid check, you may request a full
> refund within 7 days of that payment by contacting support@recruitercheck.app.
> Beyond this guarantee, MyRecruiterCheck does not offer refunds or credits for
> partial billing periods, unused checks, or dissatisfaction with generated
> results, except where required by mandatory law. You can cancel at any time
> from the billing portal to stop future renewals; your plan remains active
> until the end of the current billing period."

## Three genuine conflicts, none of which I have silently rewritten

1. **The entire section describes the retired weekly/monthly subscription
   model** — "billed in advance on a recurring basis," "Subscriptions renew
   automatically," "cancel... billing portal," "current billing period." The
   product's actual current model (confirmed earlier in this engagement via
   `remove_subscription_system` migration and the current `credit_batches`/pack
   system) is one-time credit packs, not recurring billing. This entire section
   is stale relative to the shipped product, independent of anything in this
   Part A change.

2. **The refund mechanism described (email `support@recruitercheck.app`) doesn't
   match the implemented self-service flow.** The actual system
   (`request-refund` edge function, `reserve_refund`/`finalize_refund` RPCs) is
   fully self-service through the Billing page — no email contact is required or
   expected by the code.

3. **The eligibility condition is silent on Keyword Scans and doesn't state the
   two-credit-type rule.** It only mentions "your first paid check" and "unused
   checks" — it predates Keyword Scans existing as a product feature at all, and
   doesn't say a pack becomes ineligible if _either_ credit type has been used.

## What I am flagging, not deciding

This is not a one-line copy-paste fix — it requires a genuine decision about how
the company wants to describe its current billing and refund mechanics in a
legal document, and whether the ToS should keep an email-based refund channel as
a fallback alongside (or instead of) the self-service flow. **I have not drafted
replacement legal wording.** I need your direction on:

- Should the ToS be updated to describe the one-time-pack model accurately
  (dropping the recurring-subscription language entirely), or is a lighter touch
  preferred?
- Should the email-contact refund path be removed, kept as a fallback, or
  repurposed for cases the self-service flow can't handle (e.g. a dispute after
  the 7-day window)?
- Should the exact "neither credit type used" condition be stated explicitly in
  the ToS itself, or is it sufficient for the ToS to state the 7-day guarantee
  generally while Pricing/Billing carry the precise mechanical rule?

Once you decide, I can draft the exact proposed ToS diff for your separate
review — not included in this package.
