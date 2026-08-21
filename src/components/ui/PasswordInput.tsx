/**
 * Show/hide toggle adapted from the interaction in the 21st.dev community
 * component "Login/Signup" by efferd (21st.dev/community/components/efferd/minimal-auth-page),
 * reimplemented against this app's own Input component and icon style —
 * the source component's dark theme, particle animation, and glassmorphism
 * were dropped as they conflict with the existing design.
 */
import { forwardRef, useState } from 'react'
import { Input, type InputProps } from '@/components/ui/Input'
import { cn } from '@/utils/cn'

function EyeIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M1.7 10S4.5 4.5 10 4.5 18.3 10 18.3 10 15.5 15.5 10 15.5 1.7 10 1.7 10Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="2.3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M2.5 2.5l15 15M8.3 8.5a2.3 2.3 0 0 0 3.2 3.2M6.1 6.2C3.7 7.4 1.7 10 1.7 10s2.8 5.5 8.3 5.5c1.4 0 2.6-.35 3.6-.9M13.9 13.9c1.9-1.3 3-3.4 4.4-3.9 0 0-1.4-3.2-4.9-4.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export const PasswordInput = forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <Input ref={ref} type={visible ? 'text' : 'password'} className={cn('pr-11', className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute right-[4px] top-1/2 flex h-[36px] w-[36px] -translate-y-1/2 items-center justify-center rounded-lg text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  )
})

PasswordInput.displayName = 'PasswordInput'
