import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { CANDIDATE_REPORTED_LABEL } from '@/lib/evidenceFollowUp'
import {
  GAP_ANALYSIS_CANDIDATE_REPORTED_NOTE,
  GAP_ANALYSIS_LABELS,
  GAP_ANALYSIS_SUBTITLE,
  GAP_ANALYSIS_TITLE,
  type GapAnalysisRow,
} from '@/lib/gapAnalysis'
import { cn } from '@/utils/cn'

interface GapAnalysisCardProps {
  rows: GapAnalysisRow[]
  // Follows the results container, same convention as EvidenceFollowUpCard.
  dark: boolean
}

function Field({ label, labelClass, bodyClass, children }: { label: string; labelClass: string; bodyClass: string; children: ReactNode }) {
  return (
    <div className="mt-1.5 first:mt-0">
      <p className={cn('text-xs font-medium uppercase tracking-wider', labelClass)}>{label}</p>
      <div className={cn('mt-0.5 text-sm leading-snug', bodyClass)}>{children}</div>
    </div>
  )
}

/**
 * The important requirements where the CV still leaves a recruiter question,
 * built by buildGapAnalysisRows from the matrix the score already uses.
 * Renders nothing when there is no gap: Strengths covers what the CV proves.
 */
export function GapAnalysisCard({ rows, dark }: GapAnalysisCardProps) {
  if (rows.length === 0) return null

  const cardTone = dark ? 'nested' : 'nested-light'
  const c = {
    heading: dark ? 'text-white' : 'text-text-primary',
    sub: dark ? 'text-white/75' : 'text-text-secondary',
    faint: dark ? 'text-white/65' : 'text-text-secondary',
    body: dark ? 'text-white/85' : 'text-text-secondary',
    accent: dark ? 'text-blue-light' : 'text-blue',
    rule: dark ? 'border-white/10' : 'border-border',
  }
  const hasCandidateReported = rows.some((row) => row.candidateReported !== null)
  const field = { labelClass: c.faint, bodyClass: c.body }

  return (
    <Card tone={cardTone}>
      <CardHeader tone={cardTone} className="px-5 py-3">
        <h2 className={cn('text-base font-semibold', c.heading)}>{GAP_ANALYSIS_TITLE}</h2>
        <p className={cn('mt-0.5 text-xs', c.sub)}>
          {GAP_ANALYSIS_SUBTITLE}
          {hasCandidateReported ? ` ${GAP_ANALYSIS_CANDIDATE_REPORTED_NOTE}` : null}
        </p>
      </CardHeader>
      <CardContent className="px-5 py-4">
        <ul>
          {rows.map((row, index) => (
            <li key={`${row.requirement}-${index}`} className={cn(index > 0 && cn('mt-4 border-t pt-4', c.rule))}>
              <Field label={GAP_ANALYSIS_LABELS.requirement} {...field}>
                <span className={cn('font-semibold', c.heading)}>{row.requirement}</span>
              </Field>
              {row.cvShows !== null ? (
                <Field label={GAP_ANALYSIS_LABELS.cvShows} {...field}>
                  {row.cvShows}
                </Field>
              ) : null}
              {row.candidateReported !== null ? (
                <Field label={CANDIDATE_REPORTED_LABEL} labelClass={c.accent} bodyClass={c.body}>
                  <span className="italic">&quot;{row.candidateReported}&quot;</span>
                </Field>
              ) : null}
              {row.recruiterRead ? (
                <Field label={GAP_ANALYSIS_LABELS.recruiterRead} {...field}>
                  {row.recruiterRead}
                </Field>
              ) : null}
              {row.gap ? (
                <Field label={GAP_ANALYSIS_LABELS.gap} {...field}>
                  {row.gap}
                </Field>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
