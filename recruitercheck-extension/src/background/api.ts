import { resolveFunctionError, supabase } from '@/background/supabaseClient'
import type { JobCapture } from '@/shared/types'

export async function submitJobCapture(capture: JobCapture): Promise<string> {
  const { data, error } = await supabase.functions.invoke('submit-job-capture', {
    body: {
      jobTitle: capture.jobTitle,
      companyName: capture.companyName,
      jobDescription: capture.jobDescription,
      jobUrl: capture.jobUrl,
      sourceDomain: capture.sourceDomain,
    },
  })

  if (error) throw await resolveFunctionError(error)
  if (data?.error) throw new Error(String(data.error))
  return String(data.captureId)
}
