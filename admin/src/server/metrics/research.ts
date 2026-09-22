import 'server-only'
import { available, unavailable, type Metric } from '@/lib/metric'
import type { Db } from '../supabase'
import { countOf } from './primitives'

export interface ResearchConsentData {
  /** Consents granted and not withdrawn. */
  active: Metric
  withdrawn: Metric
  /** Rows the research export would produce right now. */
  checksInDataset: Metric
  error: string | null
}

/**
 * Counts only. The consent table names users, so nothing here reads a row: the
 * operational questions are how many people are in, how many left, and how big
 * the dataset is.
 */
export async function loadResearchConsent(db: Db): Promise<ResearchConsentData> {
  const [active, withdrawn] = await Promise.all([
    countOf(
      db.from('research_consents').select('user_id', { count: 'exact', head: true }).is('withdrawn_at', null),
    ),
    countOf(
      db.from('research_consents').select('user_id', { count: 'exact', head: true }).not('withdrawn_at', 'is', null),
    ),
  ])

  const { count, error } = await db
    .from('research_checks')
    .select('check_id', { count: 'exact', head: true })

  return {
    active,
    withdrawn,
    checksInDataset: error ? unavailable(`query failed: ${error.message}`) : available(count ?? 0),
    error: error ? error.message : null,
  }
}
