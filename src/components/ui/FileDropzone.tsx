/**
 * Drag/click upload target with a selected-file row (replace + remove).
 * Interaction pattern adapted from the 21st.dev community component
 * "File Upload" by ephraimduncan (21st.dev/community/components/ephraimduncan/file-upload),
 * reimplemented against this app's own Button/Input/cn primitives and design
 * tokens — no Radix, cva, or icon-library dependency, and no simulated
 * progress bar (this app's uploads are single real requests, not chunked).
 */
import { type ChangeEvent, type DragEvent, type ReactNode, useRef, useState } from 'react'
import { cn } from '@/utils/cn'

interface FileDropzoneProps {
  id: string
  accept: string
  disabled?: boolean
  busy?: boolean
  busyLabel?: string
  fileName: string | null
  title: string
  helperText: ReactNode
  onFileSelected: (file: File) => void
  /** Omit when the selected file can only be replaced, not cleared to empty
   *  (e.g. a CV already saved against a draft check server-side). */
  onRemove?: () => void
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-[16px] w-[16px]" aria-hidden="true">
      <path
        d="M10 13V4M10 4L6.5 7.5M10 4l3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M4 13.5v1a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function FileIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-[16px] w-[16px]" aria-hidden="true">
      <path
        d="M5 3.5h6.5L15 7v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-11.5a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M11 3.5V7h4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-[16px] w-[16px]" aria-hidden="true">
      <path
        d="M4.5 6h11M8.5 6V4.5h3V6M6 6l.6 9a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9l.6-9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Spinner() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-[16px] w-[16px] animate-spin" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.25" />
      <path d="M17.5 10a7.5 7.5 0 0 0-7.5-7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function FileDropzone({
  id,
  accept,
  disabled,
  busy,
  busyLabel = 'Uploading...',
  fileName,
  title,
  helperText,
  onFileSelected,
  onRemove,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)
  const interactive = !disabled

  function openPicker() {
    if (!interactive) return
    inputRef.current?.click()
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) onFileSelected(file)
    event.target.value = ''
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragActive(false)
    if (!interactive) return
    const file = event.dataTransfer.files?.[0]
    if (file) onFileSelected(file)
  }

  const hiddenInput = (
    <input
      ref={inputRef}
      id={id}
      type="file"
      accept={accept}
      className="sr-only"
      disabled={disabled}
      onChange={handleChange}
    />
  )

  if (fileName) {
    return (
      <div
        key={fileName}
        className="file-selected-row flex items-center gap-3 rounded-[10px] border border-border-strong bg-background px-3 py-2.5"
      >
        <span className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-lg bg-navy-tint text-navy">
          {busy ? <Spinner /> : <FileIcon />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-primary">{fileName}</p>
          {busy ? <p className="text-xs text-text-secondary">{busyLabel}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={openPicker}
            disabled={disabled}
            className="min-h-[36px] rounded-lg px-2.5 text-xs font-medium text-blue transition-colors hover:underline disabled:pointer-events-none disabled:opacity-50"
          >
            Replace
          </button>
          {onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              disabled={disabled}
              aria-label="Remove file"
              className="flex h-[36px] w-[36px] items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface hover:text-error disabled:pointer-events-none disabled:opacity-50"
            >
              <TrashIcon />
            </button>
          ) : null}
        </div>
        {hiddenInput}
      </div>
    )
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-describedby={`${id}-helper`}
        onClick={openPicker}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            openPicker()
          }
        }}
        onDragOver={(event) => {
          event.preventDefault()
          if (interactive) setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={cn(
          'flex min-h-[112px] flex-col items-center justify-center gap-1.5 rounded-[10px] border-2 border-dashed px-4 py-6 text-center transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2',
          disabled ? 'pointer-events-none opacity-60' : 'cursor-pointer',
          dragActive ? 'border-blue bg-navy-tint' : 'border-border-strong bg-background hover:border-navy/40',
        )}
      >
        <span className="flex h-[36px] w-[36px] items-center justify-center rounded-full bg-surface text-text-secondary shadow-card">
          {busy ? <Spinner /> : <UploadIcon />}
        </span>
        <p className="text-sm font-medium text-text-primary">{busy ? busyLabel : title}</p>
        {!busy ? (
          <p className="text-xs text-text-secondary">
            Drag and drop, or <span className="font-medium text-blue">browse</span>
          </p>
        ) : null}
      </div>
      <div id={`${id}-helper`} className="mt-1.5 space-y-1 text-xs text-text-secondary">
        {helperText}
      </div>
      {hiddenInput}
    </div>
  )
}
