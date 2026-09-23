import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { EvidenceStrengthBadge } from '@/components/ui/Badge'
import type { RequirementEvidenceRow } from '@/types'
import { cn } from '@/utils/cn'

interface EvidenceAssessmentCardProps {
  requirementEvidence: RequirementEvidenceRow[]
  recruiterDoubts: string[]
  // Follows the results container, same convention as EvidenceFollowUpCard.
  dark: boolean
}

/**
 * "How a recruiter reads your CV": a compact, scannable per-requirement
 * evidence table, built entirely from the same finalized requirement matrix
 * the Interview Score already uses (buildRequirementEvidenceTable in
 * supabase/functions/analyze-check/logic.ts). This is a restructuring of the
 * existing Recruiter Feedback, not a new AI explanation and not a new
 * scoring system, it makes the evidence behind the existing recruiter
 * assessment visible: job requirement, CV evidence, recruiter
 * interpretation, gap.
 *
 * Historical checks with no data (requirement_evidence.length === 0) render
 * nothing, the same pattern EvidenceFollowUpCard uses for !canAnswer.
 */
export function EvidenceAssessmentCard({ requirementEvidence, recruiterDoubts, dark }: EvidenceAssessmentCardProps) {
  if (requirementEvidence.length === 0) return null

  const cardTone = dark ? 'nested' : 'nested-light'
  const c = {
    heading: dark ? 'text-white' : 'text-text-primary',
    sub: dark ? 'text-white/75' : 'text-text-secondary',
    faint: dark ? 'text-white/65' : 'text-text-secondary',
    body: dark ? 'text-white/85' : 'text-text-secondary',
    accent: dark ? 'text-blue-light' : 'text-blue',
    rule: dark ? 'border-white/10' : 'border-border',
  }

  return (
    <Card tone={cardTone}>
      <CardHeader tone={cardTone} className="px-5 py-3">
        <h2 className={cn('text-base font-semibold', c.heading)}>How a recruiter reads your CV</h2>
        <p className={cn('mt-0.5 text-xs', c.sub)}>
          We checked the important requirements in the job description against the evidence in your CV.
        </p>
      </CardHeader>
      <CardContent className="px-5 py-4">
        <ul>
          {requirementEvidence.map((row, index) => (
            <li key={`${row.requirement}-${index}`} className={cn(index > 0 && cn('mt-4 border-t pt-4', c.rule))}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className={cn('text-sm font-semibold', c.heading)}>{row.requirement}</h3>
                <EvidenceStrengthBadge strength={row.evidence_strength} tone={dark ? 'dark' : 'light'} />
              </div>
              <div className="mt-2">
                <p className={cn('text-xs font-medium uppercase tracking-wider', c.faint)}>CV evidence</p>
                <p className={cn('mt-1 text-sm leading-snug', c.body)}>{row.evidence_found}</p>
              </div>
              <div className="mt-2">
                <p className={cn('text-xs font-medium uppercase tracking-wider', c.faint)}>Recruiter read</p>
                <p className={cn('mt-1 text-sm leading-snug', c.body)}>{row.recruiter_interpretation}</p>
              </div>
              {row.gap_note ? (
                <div className="mt-2">
                  <p className={cn('text-xs font-medium uppercase tracking-wider', c.faint)}>Gap</p>
                  <p className={cn('mt-1 text-sm leading-snug', c.body)}>{row.gap_note}</p>
                </div>
              ) : null}
            </li>
          ))}
        </ul>

        {recruiterDoubts.length > 0 ? (
          <div className={cn('mt-5 border-t pt-4', c.rule)}>
            <p className={cn('text-xs font-medium uppercase tracking-wider', c.faint)}>
              What may make a recruiter hesitate
            </p>
            <ul className="mt-2 space-y-2">
              {recruiterDoubts.slice(0, 3).map((doubt) => (
                <li key={doubt} className="flex gap-2">
                  <span className={c.accent} aria-hidden="true">
                    •
                  </span>
                  <span className={cn('text-sm leading-snug', c.body)}>{doubt}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
