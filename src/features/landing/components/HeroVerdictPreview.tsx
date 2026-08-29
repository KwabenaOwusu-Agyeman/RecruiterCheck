import { Card } from '@/components/ui/Card'
import { splitFinding } from '@/components/feedback/FeedbackBullet'
import { ScoreLockup } from '@/components/feedback/ScoreLockup'
import { ROLE_EXAMPLES } from '@/features/landing/data/exampleCheck'

/**
 * The static recruiter-verdict preview beside the hero message: one glance
 * answers "what will I actually get" before the visitor scrolls. This is a
 * preview, not the product — non-interactive, clearly badged Example, one
 * strength and one gap with the evidence clamped to two lines, and the full
 * range of outcomes still belongs to the verdict trio below (an earlier,
 * correct decision removed an *interactive* hero card that hid that range
 * behind clicks; a static card hides nothing).
 *
 * Content is the AI/ML Engineer example from ROLE_EXAMPLES: the mid-tier
 * 76% Needs Improvement, because a checker that opens on a flattering score
 * is indistinguishable from flattery — the first number a visitor sees
 * should already prove the tool pushes back. Card tone is navy ('dark') to
 * match how this exact example renders in the verdict trio one scroll down
 * (see RoleFeedbackShowcase's TIER_SHOWCASE): the trio's white/navy/black
 * progression is the tier-severity code, so a "Needs Improvement" card
 * cannot sit on white here without contradicting it there. If this example
 * is ever swapped for a different tier, its tone must move with it —
 * likely stays light, not-a-fit would go ink, same as the trio.
 */
const example = ROLE_EXAMPLES.find((candidate) => candidate.id === 'ai-ml-engineer')

function PreviewFinding({ label, text }: { label: string; text: string }) {
  const { title, evidence } = splitFinding(text)
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">{label}</p>
      <p className="mt-[4px] line-clamp-2 text-sm leading-snug text-white/85">
        <span className="font-semibold text-white">{title}</span>
        {evidence ? ` ${evidence}` : null}
      </p>
    </div>
  )
}

export function HeroVerdictPreview() {
  if (!example) return null

  return (
    <Card tone="dark" className="text-left">
      {/* Own padding rather than CardContent: this repo's cn() has no
          tailwind-merge, so overriding CardContent's responsive padding from
          outside is a stylesheet-order gamble. */}
      <div className="px-[18px] py-[17px] sm:px-[24px] sm:py-[22px]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">{example.role}</p>
            <p className="text-sm font-semibold text-blue-light">{example.experience}</p>
          </div>
          <span className="mt-[2px] inline-block shrink-0 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/80">
            Example
          </span>
        </div>

        <ScoreLockup
          className="mt-[14px]"
          score={example.score}
          scoreWidthClass={example.scoreWidthClass}
          tone="dark"
          showFramework
        />

        <div className="mt-[14px] grid gap-[10px] border-t border-white/10 pt-[12px]">
          <PreviewFinding label="Strength" text={example.strengths[0]} />
          <PreviewFinding label="Area to improve" text={example.improvements[0]} />
        </div>
      </div>
    </Card>
  )
}
