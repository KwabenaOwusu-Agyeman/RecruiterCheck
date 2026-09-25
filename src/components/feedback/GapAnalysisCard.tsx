import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { GAP_ANALYSIS_SUBTITLE, GAP_ANALYSIS_TITLE, type GapAnalysisItem } from '@/lib/gapAnalysis'
import { cn } from '@/utils/cn'

interface GapAnalysisCardProps {
  gap: GapAnalysisItem | null
  // Follows the results container, same convention as EvidenceFollowUpCard.
  dark: boolean
}

/** The one gap the Evidence Follow Up below asks about. Renders nothing when there is none. */
export function GapAnalysisCard({ gap, dark }: GapAnalysisCardProps) {
  if (!gap) return null

  const cardTone = dark ? 'nested' : 'nested-light'
  const heading = dark ? 'text-white' : 'text-text-primary'

  return (
    <Card tone={cardTone}>
      <CardHeader tone={cardTone} className="px-5 py-3">
        <h2 className={cn('text-base font-semibold', heading)}>{GAP_ANALYSIS_TITLE}</h2>
        <p className={cn('mt-0.5 text-xs', dark ? 'text-white/75' : 'text-text-secondary')}>{GAP_ANALYSIS_SUBTITLE}</p>
      </CardHeader>
      <CardContent className="px-5 py-4">
        <p className={cn('text-sm font-semibold leading-snug', heading)}>{gap.requirement}</p>
        {gap.detail ? (
          <p className={cn('mt-1 text-sm leading-snug', dark ? 'text-white/85' : 'text-text-secondary')}>{gap.detail}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}
