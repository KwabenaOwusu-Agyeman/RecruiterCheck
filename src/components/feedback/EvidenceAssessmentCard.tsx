import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import type { EvidenceStrength, RequirementEvidenceRow } from '@/types'
import { cn } from '@/utils/cn'

interface EvidenceAssessmentCardProps {
  requirementEvidence: RequirementEvidenceRow[]
  recruiterDoubts: string[]
  // Follows the results container, same convention as EvidenceFollowUpCard.
  dark: boolean
}

// Best news first, same ordering principle as the Prospects score bands.
const STRENGTH_ORDER: EvidenceStrength[] = ['strong', 'moderate', 'none']

const STRENGTH_SECTION_LABEL: Record<EvidenceStrength, string> = {
  strong: 'Strong evidence',
  moderate: 'Moderate evidence',
  none: 'No evidence',
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
 * Grouped by evidence strength rather than left in requirement order, so a
 * recruiter's eye lands on the strong evidence first and the gaps last,
 * instead of the two interleaved. The strength badge that used to sit on
 * each row now lives once, as the section heading; repeating it per row
 * next to a heading that already says the same thing was pure noise.
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

  const strengthColor: Record<EvidenceStrength, string> = {
    strong: dark ? 'text-success' : 'text-success-deep',
    moderate: dark ? 'text-warning' : 'text-warning-deep',
    none: dark ? 'text-error-light' : 'text-error',
  }
  const strengthDot: Record<EvidenceStrength, string> = {
    strong: 'bg-success',
    moderate: 'bg-warning',
    none: 'bg-error',
  }

  const groups = STRENGTH_ORDER.map((strength) => ({
    strength,
    rows: requirementEvidence.filter((row) => row.evidence_strength === strength),
  })).filter((group) => group.rows.length > 0)

  return (
    <Card tone={cardTone}>
      <CardHeader tone={cardTone} className="px-5 py-3">
        <h2 className={cn('text-base font-semibold', c.heading)}>How a recruiter reads your CV</h2>
        <p className={cn('mt-0.5 text-xs', c.sub)}>
          We checked the important requirements in the job description against the evidence in your CV.
        </p>
      </CardHeader>
      <CardContent className="px-5 py-4">
        {groups.map((group, groupIndex) => (
          <div key={group.strength} className={cn(groupIndex > 0 && cn('mt-5 border-t pt-5', c.rule))}>
            <h3
              className={cn(
                'flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider',
                strengthColor[group.strength],
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', strengthDot[group.strength])} aria-hidden="true" />
              {STRENGTH_SECTION_LABEL[group.strength]}
            </h3>
            <ul>
              {group.rows.map((row, rowIndex) => (
                <li
                  key={`${row.requirement}-${rowIndex}`}
                  className={cn('mt-3', rowIndex > 0 && cn('border-t pt-3', c.rule))}
                >
                  <h4 className={cn('text-sm font-semibold', c.heading)}>{row.requirement}</h4>
                  <div className="mt-1.5">
                    <p className={cn('text-xs font-medium uppercase tracking-wider', c.faint)}>CV evidence</p>
                    <p className={cn('mt-0.5 text-sm leading-snug', c.body)}>{row.evidence_found}</p>
                  </div>
                  <div className="mt-1.5">
                    <p className={cn('text-xs font-medium uppercase tracking-wider', c.faint)}>Recruiter read</p>
                    <p className={cn('mt-0.5 text-sm leading-snug', c.body)}>{row.recruiter_interpretation}</p>
                  </div>
                  {row.gap_note ? (
                    <div className="mt-1.5">
                      <p className={cn('text-xs font-medium uppercase tracking-wider', c.faint)}>Gap</p>
                      <p className={cn('mt-0.5 text-sm leading-snug', c.body)}>{row.gap_note}</p>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}

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
