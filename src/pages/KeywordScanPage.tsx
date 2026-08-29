import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { BackLink } from '@/components/ui/BackLink'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import {
  ACCEPTED_CV_TYPES,
  ACCEPTED_JOB_FILE_TYPES,
} from '@/lib/constants'
import { FileDropzone } from '@/components/ui/FileDropzone'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { PageHeader } from '@/components/ui/Badge'
import { Textarea } from '@/components/ui/Textarea'
import { useAuth } from '@/hooks/useAuth'
import { usePageMeta } from '@/hooks/usePageMeta'
import { trackEvent } from '@/lib/analytics'
import { runKeywordScan,
  extractJobDescriptionFromFile,
  extractJobDescriptionFromUrl,
} from '@/services/checkService'
import type { KeywordScanResult } from '@/types'

const FREE_SCAN_LIMIT = 3

/**
 * On-palette since the 2026-08 brand pass. This screen originally used
 * deliberately off-brand colors (orange/purple/pink) to read as disposable;
 * the owner's standing direction now is that every surface matches the
 * brand standard, so the ring runs blue-light (the dark-surface accent) and
 * the term dots carry meaning: matched = success, missing = error. The
 * disposable *behavior* is unchanged — nothing here is saved: no check row,
 * no result row, the scan lives only in this component's state.
 *
 * Dashed-track radial gauge with a solid accent arc on top, modeled on a
 * modern stat-card pattern (segmented dotted ring + bold centered number +
 * short label), rather than a flat conic-gradient donut.
 */
function MatchRing({ percent }: { percent: number }) {
  const radius = 54
  const circumference = 2 * Math.PI * radius
  const dashCount = 40
  const trackDash = `${(circumference / dashCount) * 0.55} ${(circumference / dashCount) * 0.45}`
  const arcOffset = circumference * (1 - percent / 100)

  return (
    <div className="relative flex h-36 w-36 shrink-0 items-center justify-center sm:h-40 sm:w-40">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="3" strokeDasharray={trackDash} strokeLinecap="round" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="#8FB2F0"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={arcOffset}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-semibold tracking-[-0.02em] text-white sm:text-4xl">{percent}%</span>
        <span className="mt-0.5 text-xs text-white/50">match</span>
      </div>
    </div>
  )
}

function TermRow({
  label,
  terms,
  moreCount,
  dotColor,
}: {
  label: string
  terms: string[]
  moreCount: number
  dotColor: 'matched' | 'missing'
}) {
  const dotClass = dotColor === 'matched' ? 'bg-success' : 'bg-error-light'

  return (
    <div className="flex items-start gap-2.5 border-t border-white/10 py-2.5 first:border-t-0">
      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wider text-white/50">{label}</p>
        <p className="mt-0.5 text-sm text-white/90">
          {terms.length > 0 ? terms.join(', ') : 'None found'}
          {moreCount > 0 ? <span className="text-white/50"> +{moreCount} more</span> : null}
        </p>
      </div>
    </div>
  )
}

export function KeywordScanPage() {
  usePageMeta({
    title: 'Free Keyword Scan | MyRecruiterCheck',
    description: 'Check which keywords from a job description your CV is missing, free.',
    path: '/checks/keyword-scan',
    noindex: true,
  })

  const { profile } = useAuth()
  const [cvFile, setCvFile] = useState<File | null>(null)
  const [cvInputMode, setCvInputMode] = useState<'file' | 'paste'>('file')
  const [cvPastedText, setCvPastedText] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [jobInputMode, setJobInputMode] = useState<'paste' | 'url' | 'upload'>('paste')
  const [jobUrl, setJobUrl] = useState('')
  const [jobFileName, setJobFileName] = useState<string | null>(null)
  const [extractingJob, setExtractingJob] = useState(false)
  const [jobExtractError, setJobExtractError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<KeywordScanResult | null>(null)

  const scansUsed = profile?.keyword_scans_consumed ?? 0
  const hasBalance = (profile?.checks_balance ?? 0) > 0
  const scansLeft = Math.max(FREE_SCAN_LIMIT - scansUsed, 0)

  const PASTED_CV_FILE_NAME = 'cv.txt'
  const MIN_PASTED_CV_LENGTH = 50

  // A pasted CV is wrapped into a text File so runKeywordScan keeps its
  // single File signature — the same shape NewCheckPage uses for its own
  // paste path, and the scan edge function already accepts text/plain.
  function resolveCvFile(): File | null {
    if (cvInputMode === 'file') return cvFile
    const text = cvPastedText.trim()
    if (text.length < MIN_PASTED_CV_LENGTH) return null
    return new File([text], PASTED_CV_FILE_NAME, { type: 'text/plain' })
  }

  async function handleExtractJobUrl() {
    const url = jobUrl.trim()
    if (!url) return
    setExtractingJob(true)
    setJobExtractError(null)
    try {
      const text = await extractJobDescriptionFromUrl(url)
      setJobDescription(text)
      trackEvent('keyword_scan_job_url_extracted')
    } catch (err) {
      setJobExtractError(err instanceof Error ? err.message : 'Could not read that job posting')
    } finally {
      setExtractingJob(false)
    }
  }

  async function handleJobFile(file: File) {
    setExtractingJob(true)
    setJobExtractError(null)
    setJobFileName(file.name)
    try {
      const text = await extractJobDescriptionFromFile(file)
      setJobDescription(text)
      trackEvent('keyword_scan_job_file_extracted')
    } catch (err) {
      setJobExtractError(err instanceof Error ? err.message : 'Could not read that file')
      setJobFileName(null)
    } finally {
      setExtractingJob(false)
    }
  }

  async function handleScan() {
    const cv = resolveCvFile()
    if (!cv || jobDescription.trim().length < 50) return

    setScanning(true)
    setError(null)
    setResult(null)

    try {
      const scanResult = await runKeywordScan(cv, jobDescription)
      setResult(scanResult)
      trackEvent('keyword_scan_completed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete the scan')
    } finally {
      setScanning(false)
    }
  }

  const canScan = Boolean(resolveCvFile()) && jobDescription.trim().length >= 50

  return (
    <>
      <BackLink to="/checks" />
      <div className="mt-3">
        <PageHeader
          title="Free Keyword Scan"
          description={
            hasBalance
              ? 'Check keyword overlap before spending a Recruiter Check. Free, unlimited.'
              : `Free, ${scansLeft} of ${FREE_SCAN_LIMIT} left. Nothing here is saved.`
          }
        />
      </div>

      {!result ? (
        <Card className="mx-auto mt-4 max-w-xl p-4 sm:p-6">
          <div className="space-y-4">
            {/* Same input choices as a real check: a free scan that only
                accepts an uploaded CV and pasted text turns away anyone
                holding a PDF job posting or a CV they would rather paste. */}
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor={cvInputMode === 'file' ? 'scan-cv' : 'scan-cv-text'}>Your CV</Label>
                <SegmentedControl
                  aria-label="CV input method"
                  options={[
                    { value: 'file', label: 'Upload' },
                    { value: 'paste', label: 'Paste' },
                  ]}
                  value={cvInputMode}
                  onChange={setCvInputMode}
                />
              </div>
              {cvInputMode === 'file' ? (
                <FileDropzone
                  id="scan-cv"
                  accept={ACCEPTED_CV_TYPES.join(',')}
                  fileName={cvFile?.name ?? null}
                  title="Upload your CV"
                  helperText={<p>PDF or DOCX &middot; Maximum 10 MB &middot; Not saved anywhere</p>}
                  onFileSelected={setCvFile}
                  onRemove={() => setCvFile(null)}
                />
              ) : (
                <Textarea
                  id="scan-cv-text"
                  value={cvPastedText}
                  onChange={(event) => setCvPastedText(event.target.value)}
                  placeholder="Paste your CV text here..."
                />
              )}
            </div>

            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <Label
                  htmlFor={
                    jobInputMode === 'paste'
                      ? 'scan-job-description'
                      : jobInputMode === 'url'
                        ? 'scan-job-url'
                        : 'scan-job-file'
                  }
                >
                  Job description
                </Label>
                <SegmentedControl
                  aria-label="Job description input method"
                  options={[
                    { value: 'paste', label: 'Paste' },
                    { value: 'url', label: 'URL' },
                    { value: 'upload', label: 'Upload' },
                  ]}
                  value={jobInputMode}
                  onChange={setJobInputMode}
                />
              </div>

              {jobInputMode === 'paste' ? (
                <Textarea
                  id="scan-job-description"
                  value={jobDescription}
                  onChange={(event) => setJobDescription(event.target.value)}
                  placeholder="Paste the job description here..."
                />
              ) : jobInputMode === 'url' ? (
                <div className="flex gap-2">
                  <Input
                    id="scan-job-url"
                    type="url"
                    value={jobUrl}
                    disabled={extractingJob}
                    onChange={(event) => setJobUrl(event.target.value)}
                    placeholder="https://company.com/careers/job-posting"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="shrink-0"
                    disabled={!jobUrl.trim() || extractingJob}
                    onClick={() => void handleExtractJobUrl()}
                  >
                    {extractingJob ? 'Reading...' : 'Get'}
                  </Button>
                </div>
              ) : (
                <FileDropzone
                  id="scan-job-file"
                  accept={ACCEPTED_JOB_FILE_TYPES.join(',')}
                  busy={extractingJob}
                  busyLabel="Reading..."
                  fileName={jobFileName}
                  title="Upload the job description"
                  helperText={<p>PDF, DOCX or TXT &middot; Maximum 10 MB &middot; Not saved anywhere</p>}
                  onFileSelected={(file) => void handleJobFile(file)}
                  onRemove={() => {
                    setJobFileName(null)
                    setJobDescription('')
                  }}
                />
              )}

              {jobExtractError ? (
                <Alert variant="error" className="mt-3">
                  {jobExtractError}
                </Alert>
              ) : null}

              {/* Extracted text is shown, not hidden: a URL or file the
                  parser misread should be visible and fixable before the
                  scan runs. */}
              {jobInputMode !== 'paste' && jobDescription ? (
                <Textarea
                  id="scan-job-extracted"
                  className="mt-3"
                  value={jobDescription}
                  onChange={(event) => setJobDescription(event.target.value)}
                />
              ) : null}
            </div>

            {error ? <Alert variant="error">{error}</Alert> : null}

            <Button
              className="w-full"
              disabled={!canScan || scanning}
              onClick={() => void handleScan()}
            >
              {scanning ? 'Scanning...' : 'Scan for keywords'}
            </Button>
          </div>
        </Card>
      ) : (
        <div className="mx-auto mt-4 max-w-xl">
          <Card tone="dark" className="flex flex-col items-center gap-4 p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
            <MatchRing percent={result.matchPercent} />
            <div className="w-full">
              <TermRow label="Matched" terms={result.matched} moreCount={Math.max(result.matchedTotal - result.matched.length, 0)} dotColor="matched" />
              <TermRow label="Missing" terms={result.missing} moreCount={Math.max(result.missingTotal - result.missing.length, 0)} dotColor="missing" />
            </div>
          </Card>
          <div className="mt-4 flex flex-col items-center gap-2 text-center">
            <Link to={!hasBalance && scansLeft <= 0 ? '/pricing' : '/checks/new'}>
              <Button size="sm">Get check</Button>
            </Link>
            <button
              type="button"
              className="text-sm text-text-secondary hover:underline"
              onClick={() => {
                setResult(null)
                setCvFile(null)
                setJobDescription('')
              }}
            >
              New scan
            </button>
          </div>
        </div>
      )}
    </>
  )
}
