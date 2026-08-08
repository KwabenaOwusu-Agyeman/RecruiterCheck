import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { BackLink } from '@/components/ui/BackLink'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { PageHeader } from '@/components/ui/Badge'
import { Textarea } from '@/components/ui/Textarea'
import { ACCEPTED_CV_TYPES, MAX_CV_SIZE_BYTES } from '@/lib/constants'
import { useAuth } from '@/hooks/useAuth'
import {
  analyzeCheck,
  createDraftCheck,
  getChecks,
  getCheckGateReason,
  replaceDraftCv,
  updateDraftCheck,
  type CheckGateReason,
} from '@/services/checkService'
import type { OutputLanguage } from '@/types'
import { cn } from '@/utils/cn'

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

export function NewCheckPage() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const { user, profile } = useAuth()

  const [gateChecked, setGateChecked] = useState(false)
  const [gateReason, setGateReason] = useState<CheckGateReason>(null)

  const [loadingDraft, setLoadingDraft] = useState(Boolean(id))
  const [notFound, setNotFound] = useState(false)

  const [jobTitle, setJobTitle] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [outputLanguage, setOutputLanguage] = useState<OutputLanguage>('auto')
  const [cvFileName, setCvFileName] = useState<string | null>(null)
  const [cvInputMode, setCvInputMode] = useState<CvInputMode>('file')
  const [cvPastedText, setCvPastedText] = useState('')

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
          <Label htmlFor="jobDescription">Job description</Label>
          <Textarea
            id="jobDescription"
            value={jobDescription}
            onChange={(event) => handleJobDescriptionChange(event.target.value)}
            placeholder="Paste the full job description"
          />
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
