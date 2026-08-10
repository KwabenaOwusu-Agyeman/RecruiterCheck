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
import type { OutputLanguage } from '@/types'
import { cn } from '@/utils/cn'
import { categorizeUrlDomain, trackEvent } from '@/lib/analytics'

const OUTPUT_LANGUAGE_OPTIONS: { value: OutputLanguage; label: string }[] = [
  { value: 'auto', label: 'Auto detect' },
  { value: 'en', label: 'English' },
  { value: 'nl', label: 'Dutch' },
]

const PASTED_CV_FILE_NAME = 'cv.txt'
const MIN_PASTED_CV_LENGTH = 50

function textToCvFile(text: string): File {
  return new File([text], PASTED_CV_FILE_NAME, { type: 'text/plain' })
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
  const [outputLanguage, setOutputLanguage] = useState<OutputLanguage>('auto')
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

  // Gate fresh drafts only — a check already in progress may be resumed
  // regardless of plan, per the locked spec.
  useEffect(() => {
    if (id) {
      setGateChecked(true)
      return
    }
    if (!user || !profile) return

    let cancelled = false

    async function checkGate() {
      try {
        const checks = await getChecks(user!.id)
        if (cancelled) return
        setGateReason(getCheckGateReason(profile!, checks))
      } catch {
        if (!cancelled) setGateReason(null)
      } finally {
        if (!cancelled) setGateChecked(true)
      }
    }

    void checkGate()
    return () => {
      cancelled = true
    }
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
        setOutputLanguage(existing.output_language)
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
      outputLanguage?: OutputLanguage
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

  function handleJobTitleChange(value: string) {
    setJobTitle(value)
    scheduleAutosave({ jobTitle: value })
  }

  function handleCompanyNameChange(value: string) {
    setCompanyName(value)
    scheduleAutosave({ companyName: value })
  }

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

  function handleOutputLanguageChange(value: OutputLanguage) {
    setOutputLanguage(value)
    scheduleAutosave({ outputLanguage: value })
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
        if (jobTitle || companyName || jobDescription || outputLanguage !== 'auto') {
          await updateDraftCheck(created.id, { jobTitle, companyName, jobDescription, outputLanguage })
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
      await updateDraftCheck(checkId, { jobTitle, companyName, jobDescription, outputLanguage })
      await analyzeCheck(checkId)
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
        <div className="mx-auto max-w-md rounded-xl border border-navy bg-surface p-8 text-center">
          <h2 className="text-base font-semibold text-text-primary">
            You've used your free Recruiter Check
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            Upgrade to continue checking more applications.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link to="/account/billing">
              <Button variant="secondary" size="sm" className="w-full sm:w-auto">
                Weekly Premium
              </Button>
            </Link>
            <Link to="/account/billing">
              <Button size="sm" className="w-full sm:w-auto">
                Monthly Premium
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
        <div className="mx-auto max-w-md rounded-xl border border-navy bg-surface p-8 text-center">
          <h2 className="text-base font-semibold text-text-primary">
            You've reached today's check limit
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            We cap checks at 8 a day so every application gets your full attention, not a rushed
            once over. Come back tomorrow for more.
          </p>
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

      <div className="mx-auto max-w-2xl space-y-6 rounded-xl border border-navy bg-surface p-6">
        {captureError ? <Alert variant="error">{captureError}</Alert> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="jobTitle">Job title</Label>
            <Input
              id="jobTitle"
              value={jobTitle}
              onChange={(event) => handleJobTitleChange(event.target.value)}
              placeholder="e.g. Product Manager"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="companyName">Company</Label>
            <Input
              id="companyName"
              value={companyName}
              onChange={(event) => handleCompanyNameChange(event.target.value)}
              placeholder="e.g. Acme"
            />
          </div>
        </div>

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
          <Label htmlFor="outputLanguage">Language</Label>
          <select
            id="outputLanguage"
            value={outputLanguage}
            onChange={(event) => handleOutputLanguageChange(event.target.value as OutputLanguage)}
            className="h-7 w-28 rounded-md border border-border bg-background px-1.5 text-xs text-text-primary focus:border-navy focus:outline-none"
          >
            {OUTPUT_LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-text-secondary">
            We&rsquo;ll automatically use the language of the job description. You can choose
            another language if needed.
          </p>
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

        <div className="flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-end">
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
