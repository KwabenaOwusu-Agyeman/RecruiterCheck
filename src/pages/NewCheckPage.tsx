import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { BackLink } from '@/components/ui/BackLink'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { PageHeader } from '@/components/ui/Badge'
import { Textarea } from '@/components/ui/Textarea'
import {
  ACCEPTED_CV_TYPES,
  ACCEPTED_JOB_FILE_TYPES,
  MAX_CV_SIZE_BYTES,
  MAX_JOB_FILE_SIZE_BYTES,
} from '@/lib/constants'
import { useAuth } from '@/hooks/useAuth'
import {
  analyzeCheck,
  createDraftCheck,
  extractJobDescriptionFromFile,
  extractJobDescriptionFromUrl,
  fetchJobCapture,
  getChecks,
  getCheckGateReason,
  replaceDraftCv,
  updateDraftCheck,
  type CheckGateReason,
} from '@/services/checkService'
import { cn } from '@/utils/cn'
import { categorizeUrlDomain, trackEvent } from '@/lib/analytics'

const PASTED_CV_FILE_NAME = 'cv.txt'
const MIN_PASTED_CV_LENGTH = 50

function textToCvFile(text: string): File {
  return new File([text], PASTED_CV_FILE_NAME, { type: 'text/plain' })
}

/**
 * The daily allowance resets at UTC midnight (matches reserve_check_analysis's
 * own day boundary), so this is computed from wall-clock time rather than
 * stored anywhere — it's only ever off by the seconds since the page loaded.
 */
function formatResetTime(): string {
  const now = new Date()
  const nextMidnightUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  )
  const totalMinutes = Math.max(1, Math.round((nextMidnightUtc.getTime() - now.getTime()) / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  const hourPart = hours > 0 ? `${hours} hour${hours === 1 ? '' : 's'}` : ''
  const minutePart = minutes > 0 ? `${minutes} minute${minutes === 1 ? '' : 's'}` : ''

  if (hourPart && minutePart) return `Resets in ${hourPart} ${minutePart}`
  return `Resets in ${hourPart || minutePart}`
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type CvInputMode = 'file' | 'paste'
type JobInputMode = 'paste' | 'url' | 'upload'

export function NewCheckPage() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, profile } = useAuth()

  const [gateChecked, setGateChecked] = useState(false)
  const [gateReason, setGateReason] = useState<CheckGateReason>(null)

  const [loadingDraft, setLoadingDraft] = useState(Boolean(id))
  const [notFound, setNotFound] = useState(false)
  const [captureError, setCaptureError] = useState<string | null>(null)

  const [jobTitle, setJobTitle] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [cvFileName, setCvFileName] = useState<string | null>(null)
  const [cvInputMode, setCvInputMode] = useState<CvInputMode>('file')
  const [cvPastedText, setCvPastedText] = useState('')

  const [jobInputMode, setJobInputMode] = useState<JobInputMode>('paste')
  const [jobUrl, setJobUrl] = useState('')
  const [extractingJobUrl, setExtractingJobUrl] = useState(false)
  const [jobUrlError, setJobUrlError] = useState<string | null>(null)
  const [extractingJobFile, setExtractingJobFile] = useState(false)
  const [jobFileError, setJobFileError] = useState<string | null>(null)
  const [jobFileName, setJobFileName] = useState<string | null>(null)

  const [uploadingCv, setUploadingCv] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checkIdRef = useRef<string | null>(id ?? null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cvSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!id) trackEvent('new_check_opened')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Gate fresh drafts only — a check already in progress may be resumed
  // regardless of plan, per the locked spec. Reads straight off the
  // profile's durable usage counters (no query needed) rather than counting
  // `checks` rows, so this can never say "allowed" right after a delete that
  // the server will then reject.
  useEffect(() => {
    if (id) {
      setGateChecked(true)
      return
    }
    if (!user || !profile) return

    setGateReason(getCheckGateReason(profile))
    setGateChecked(true)
  }, [id, user, profile])

  // Load an existing draft when editing.
  useEffect(() => {
    if (!id || !user) return

    let cancelled = false

    async function loadDraft() {
      try {
        const checks = await getChecks(user!.id)
        if (cancelled) return

        const existing = checks.find((c) => c.id === id)
        if (!existing || existing.status !== 'draft') {
          setNotFound(true)
          return
        }

        checkIdRef.current = existing.id
        setJobTitle(existing.job_title ?? '')
        setCompanyName(existing.company_name ?? '')
        setJobDescription(existing.job_description)
        setCvFileName(existing.cv_file_name)
        if (existing.cv_file_name === PASTED_CV_FILE_NAME) {
          setCvInputMode('paste')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load draft')
      } finally {
        if (!cancelled) setLoadingDraft(false)
      }
    }

    void loadDraft()
    return () => {
      cancelled = true
    }
  }, [id, user])

  // Extension hand-off: /checks/new?capture=<opaque-id>. Only applies to a
  // fresh draft — an existing draft being resumed (:id/edit) never carries
  // this param. The capture is single-use server-side, so this effect must
  // not re-fire on its own re-render; clearing the param from the URL is
  // what prevents that.
  useEffect(() => {
    if (id || !user) return
    const captureId = searchParams.get('capture')
    if (!captureId) return

    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('capture')
        return next
      },
      { replace: true },
    )

    let cancelled = false

    async function loadCapture(idToFetch: string) {
      try {
        const capture = await fetchJobCapture(idToFetch)
        if (cancelled) return
        setJobTitle(capture.jobTitle ?? '')
        setCompanyName(capture.companyName ?? '')
        setJobDescription(capture.jobDescription)
        trackEvent('extension_opened_new_check')
      } catch (err) {
        if (!cancelled) {
          setCaptureError(
            err instanceof Error
              ? err.message
              : 'This capture is no longer available. Paste, use a URL, or upload instead.',
          )
        }
      }
    }

    void loadCapture(captureId)
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user])

  const scheduleAutosave = useCallback(
    (updates: {
      jobTitle?: string
      companyName?: string
      jobDescription?: string
    }) => {
      if (!checkIdRef.current) return

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      setSaveState('saving')

      saveTimeoutRef.current = setTimeout(() => {
        void updateDraftCheck(checkIdRef.current!, updates)
          .then(() => setSaveState('saved'))
          .catch(() => setSaveState('error'))
      }, 800)
    },
    [],
  )

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      if (cvSaveTimeoutRef.current) clearTimeout(cvSaveTimeoutRef.current)
    }
  }, [])

  function handleJobDescriptionChange(value: string) {
    setJobDescription(value)
    scheduleAutosave({ jobDescription: value })
  }

  async function handleExtractJobUrl() {
    const trimmedUrl = jobUrl.trim()
    if (!trimmedUrl) return

    setJobUrlError(null)
    setExtractingJobUrl(true)

    try {
      const extracted = await extractJobDescriptionFromUrl(trimmedUrl)
      trackEvent('job_input_url_extract_succeeded')
      handleJobDescriptionChange(extracted)
      setJobInputMode('paste')
    } catch {
      trackEvent('job_input_url_extract_failed', categorizeUrlDomain(trimmedUrl))
      setJobUrlError("We couldn't read this job posting.")
    } finally {
      setExtractingJobUrl(false)
    }
  }

  async function handleJobFileChange(fileList: FileList | null) {
    const file = fileList?.[0]
    if (!file) return

    if (!ACCEPTED_JOB_FILE_TYPES.includes(file.type as (typeof ACCEPTED_JOB_FILE_TYPES)[number])) {
      setJobFileError('Please upload a PDF, Word (.docx), or plain text file.')
      return
    }

    if (file.size > MAX_JOB_FILE_SIZE_BYTES) {
      setJobFileError('File must be 10 MB or smaller.')
      return
    }

    setJobFileError(null)
    setExtractingJobFile(true)

    try {
      const extracted = await extractJobDescriptionFromFile(file)
      setJobFileName(file.name)
      handleJobDescriptionChange(extracted)
      setJobInputMode('paste')
    } catch (err) {
      setJobFileError(
        err instanceof Error ? err.message : 'Could not read this file. Paste the job description instead.',
      )
    } finally {
      setExtractingJobFile(false)
    }
  }

  async function saveCvFile(file: File) {
    if (!user) return

    try {
      if (checkIdRef.current) {
        const updated = await replaceDraftCv(checkIdRef.current, user.id, file)
        setCvFileName(updated.cv_file_name)
      } else {
        const created = await createDraftCheck(user.id, file)
        checkIdRef.current = created.id

        // Persist anything already typed before the CV was attached — this
        // must complete before navigating. The route change re-triggers the
        // draft-loading effect, which re-fetches the check from the DB; if
        // that fetch races ahead of this write, it reads the still-empty
        // row and clobbers what the user just typed into local state.
        if (jobTitle || companyName || jobDescription) {
          await updateDraftCheck(created.id, { jobTitle, companyName, jobDescription })
        }

        setCvFileName(created.cv_file_name)
        navigate(`/checks/${created.id}/edit`, { replace: true })
      }
    } catch (err) {
      throw err instanceof Error ? err : new Error('Could not save CV')
    }
  }

  async function handleFileChange(fileList: FileList | null) {
    const file = fileList?.[0]
    if (!file || !user) return

    if (!ACCEPTED_CV_TYPES.includes(file.type as (typeof ACCEPTED_CV_TYPES)[number])) {
      setError('Please upload a PDF or Word (.docx) document.')
      return
    }

    if (file.size > MAX_CV_SIZE_BYTES) {
      setError('CV must be 10 MB or smaller.')
      return
    }

    setError(null)
    setUploadingCv(true)

    try {
      await saveCvFile(file)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload CV')
    } finally {
      setUploadingCv(false)
    }
  }

  function handleCvTextChange(value: string) {
    setCvPastedText(value)

    const trimmed = value.trim()
    if (trimmed.length < MIN_PASTED_CV_LENGTH) return

    if (cvSaveTimeoutRef.current) clearTimeout(cvSaveTimeoutRef.current)
    setSaveState('saving')

    cvSaveTimeoutRef.current = setTimeout(() => {
      void saveCvFile(textToCvFile(trimmed))
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'))
    }, 800)
  }

  async function handleAnalyze() {
    const checkId = checkIdRef.current
    if (!checkId) return

    if (jobDescription.trim().length < 50) {
      setError('Please paste a complete job description (at least 50 characters).')
      return
    }

    setError(null)
    setAnalyzing(true)

    try {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      await updateDraftCheck(checkId, { jobTitle, companyName, jobDescription })
      await analyzeCheck(checkId)
      trackEvent('check_submitted')
      navigate(`/checks/${checkId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not analyze this check')
      setAnalyzing(false)
    }
  }

  if (notFound) {
    return <Navigate to="/checks" replace />
  }

  if (loadingDraft || !gateChecked) {
    return <p className="text-sm text-text-secondary">Loading...</p>
  }

  if (gateReason === 'free-tier') {
    return (
      <>
        <BackLink to="/checks" />
        <div className="mt-3">
          <PageHeader title="New Check" />
        </div>
        <div className="mx-auto max-w-md rounded-2xl border border-navy bg-surface sm:rounded-xl p-[20px] text-center sm:p-8">
          <h2 className="text-base font-semibold text-text-primary">
            You've used your free Check
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            Upgrade to continue checking applications and unlock your Recruiter Ready Kit.
          </p>
          <div className="mt-6 flex justify-center">
            <Link to="/account/billing">
              <Button size="sm" className="w-full sm:w-auto">
                Upgrade
              </Button>
            </Link>
          </div>
        </div>
      </>
    )
  }

  if (gateReason === 'daily-limit') {
    return (
      <>
        <BackLink to="/checks" />
        <div className="mt-3">
          <PageHeader title="New Check" />
        </div>
        <div className="mx-auto max-w-md rounded-2xl border border-navy bg-surface sm:rounded-xl p-[20px] text-center sm:p-8">
          <h2 className="text-base font-semibold text-text-primary">
            You've reached today's check limit
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            We cap checks at 8 a day so every application gets your full attention.
          </p>
          <p className="mt-3 text-xs text-text-secondary">{formatResetTime()}</p>
        </div>
      </>
    )
  }

  const hasCv = Boolean(cvFileName)
  const hasJobDescription = jobDescription.trim().length > 0
  const canCheck = hasCv && hasJobDescription

  return (
    <>
      <BackLink to="/checks" />
      <div className="mt-3">
        <PageHeader
          title="New Check"
          description="Add the job and your CV to see your application from a recruiter's perspective before you apply."
        />
      </div>

      <div className="mx-auto max-w-2xl space-y-[16px] rounded-2xl border border-navy bg-surface sm:rounded-xl p-[16px] sm:space-y-6 sm:p-6">
        {captureError ? <Alert variant="error">{captureError}</Alert> : null}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label
              htmlFor={
                jobInputMode === 'paste' ? 'jobDescription' : jobInputMode === 'url' ? 'jobUrl' : 'jobFile'
              }
            >
              Job description
            </Label>
            <div className="inline-flex rounded-lg border border-border p-0.5">
              <button
                type="button"
                onClick={() => {
                  if (jobInputMode !== 'paste') trackEvent('job_input_paste_selected')
                  setJobInputMode('paste')
                }}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  jobInputMode === 'paste'
                    ? 'bg-background text-text-primary'
                    : 'text-text-secondary hover:text-text-primary',
                )}
              >
                Paste
              </button>
              <button
                type="button"
                onClick={() => {
                  if (jobInputMode !== 'url') trackEvent('job_input_url_selected')
                  setJobInputMode('url')
                }}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  jobInputMode === 'url'
                    ? 'bg-background text-text-primary'
                    : 'text-text-secondary hover:text-text-primary',
                )}
              >
                URL
              </button>
              <button
                type="button"
                onClick={() => {
                  if (jobInputMode !== 'upload') trackEvent('job_input_upload_selected')
                  setJobInputMode('upload')
                }}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  jobInputMode === 'upload'
                    ? 'bg-background text-text-primary'
                    : 'text-text-secondary hover:text-text-primary',
                )}
              >
                Upload
              </button>
            </div>
          </div>

          {jobInputMode === 'paste' ? (
            <Textarea
              id="jobDescription"
              value={jobDescription}
              onChange={(event) => handleJobDescriptionChange(event.target.value)}
              placeholder="Paste the full job description"
            />
          ) : jobInputMode === 'url' ? (
            <>
              <div className="flex gap-2">
                <Input
                  id="jobUrl"
                  type="url"
                  value={jobUrl}
                  disabled={extractingJobUrl}
                  onChange={(event) => setJobUrl(event.target.value)}
                  placeholder="https://company.com/careers/job-posting"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  disabled={!jobUrl.trim() || extractingJobUrl}
                  onClick={() => void handleExtractJobUrl()}
                >
                  {extractingJobUrl ? 'Reading...' : 'Extract'}
                </Button>
              </div>
              <p className="text-xs text-text-secondary">Paste a link to a public job posting.</p>
              {jobUrlError ? (
                <Alert variant="error">
                  <p>{jobUrlError}</p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setJobUrlError(null)
                        setJobInputMode('paste')
                      }}
                    >
                      Paste Job Description
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setJobUrlError(null)
                        setJobInputMode('upload')
                      }}
                    >
                      Upload Job Description
                    </Button>
                  </div>
                </Alert>
              ) : null}
            </>
          ) : (
            <>
              <Input
                id="jobFile"
                type="file"
                accept=".pdf,.docx,.txt"
                disabled={extractingJobFile}
                onChange={(event) => void handleJobFileChange(event.target.files)}
              />
              <p className="text-xs text-text-secondary">PDF, DOCX, or TXT &middot; Maximum 10 MB</p>
              {extractingJobFile ? (
                <p className="text-sm text-text-secondary">Reading file...</p>
              ) : jobFileName ? (
                <p className="text-sm text-text-secondary">Selected: {jobFileName}</p>
              ) : null}
              {jobFileError ? <Alert variant="error">{jobFileError}</Alert> : null}
            </>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor={cvInputMode === 'file' ? 'cv' : 'cvText'}>CV</Label>
            <div className="inline-flex rounded-lg border border-border p-0.5">
              <button
                type="button"
                onClick={() => setCvInputMode('file')}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  cvInputMode === 'file'
                    ? 'bg-background text-text-primary'
                    : 'text-text-secondary hover:text-text-primary',
                )}
              >
                Upload file
              </button>
              <button
                type="button"
                onClick={() => setCvInputMode('paste')}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  cvInputMode === 'paste'
                    ? 'bg-background text-text-primary'
                    : 'text-text-secondary hover:text-text-primary',
                )}
              >
                Paste text
              </button>
            </div>
          </div>

          {cvInputMode === 'file' ? (
            <>
              <p className="text-sm text-text-primary">Upload your current CV</p>
              <Input
                id="cv"
                type="file"
                accept=".pdf,.docx"
                disabled={uploadingCv}
                onChange={(event) => void handleFileChange(event.target.files)}
              />
              <p className="text-xs text-text-secondary">PDF or DOCX &middot; Maximum 10 MB</p>
            </>
          ) : (
            <>
              <Textarea
                id="cvText"
                value={cvPastedText}
                onChange={(event) => handleCvTextChange(event.target.value)}
                placeholder="Paste the text of your CV here..."
              />
              <p className="text-xs text-text-secondary">
                Paste your CV as plain text — saves automatically as you type.
              </p>
            </>
          )}

          {uploadingCv ? (
            <p className="text-sm text-text-secondary">Uploading...</p>
          ) : cvFileName ? (
            <p className="text-sm text-text-secondary">
              {cvFileName === PASTED_CV_FILE_NAME ? 'CV text saved' : `Selected: ${cvFileName}`}
            </p>
          ) : null}
        </div>

        {error ? <Alert variant="error">{error}</Alert> : null}

        {saveState === 'saving' ? (
          <p className="text-xs text-text-secondary">Saving...</p>
        ) : saveState === 'saved' ? (
          <p className="text-xs text-text-secondary">Saved</p>
        ) : saveState === 'error' ? (
          <p className="text-xs text-error">Could not save your changes</p>
        ) : null}

        <div className="flex flex-col gap-3 border-t border-border pt-[16px] sm:flex-row sm:items-center sm:justify-end sm:pt-6">
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <Button
              type="button"
              size="sm"
              disabled={!canCheck || analyzing}
              onClick={() => void handleAnalyze()}
            >
              {analyzing ? 'Checking...' : 'Check'}
            </Button>
            {!canCheck ? (
              <p className="text-xs text-text-secondary">
                Add your CV and job description to continue.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </>
  )
}
