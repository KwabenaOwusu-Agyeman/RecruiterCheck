'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'

export function SearchBox({
  placeholder,
  paramName = 'q',
}: {
  placeholder: string
  paramName?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(searchParams.get(paramName) ?? '')

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const params = new URLSearchParams(searchParams.toString())
    if (value.trim()) params.set(paramName, value.trim())
    else params.delete(paramName)
    // Any new search returns to the first page; keeping the old page number
    // would show an empty page for a narrower result set.
    params.delete('page')
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-md gap-2">
      <label htmlFor={`search-${paramName}`} className="sr-only">
        {placeholder}
      </label>
      <input
        id={`search-${paramName}`}
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        className="h-8 min-w-0 flex-1 rounded-full border border-border-strong bg-surface px-4 text-sm text-text-primary"
      />
      <Button type="submit" size="sm" variant="secondary">
        Search
      </Button>
    </form>
  )
}
