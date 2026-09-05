// CSV generation for the dashboard's exports.
//
// Two things matter here beyond correct quoting. First, an export carries the
// same redaction rules as the screen: callers pass already-redacted rows.
// Second, spreadsheet formula injection is a real risk for a file a founder
// will open in Excel, so any cell that could be read as a formula is
// neutralised.

const NEEDS_QUOTING = /[",\r\n]/
// Leading characters that make Excel, Sheets and Numbers treat a cell as a
// formula. A cell beginning with one of these is prefixed with a single quote.
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r']

export function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return ''

  let text =
    value instanceof Date
      ? value.toISOString()
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value)

  // Neutralise formula injection before quoting, never after.
  if (text.length > 0 && FORMULA_PREFIXES.includes(text[0])) {
    text = `'${text}`
  }

  if (NEEDS_QUOTING.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export interface CsvColumn<T> {
  header: string
  value: (row: T) => unknown
}

export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const lines: string[] = [columns.map((c) => escapeCell(c.header)).join(',')]
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCell(c.value(row))).join(','))
  }
  // CRLF per RFC 4180. The UTF-8 BOM makes Excel read accented names correctly
  // instead of mojibake.
  return `\ufeff${lines.join('\r\n')}\r\n`
}

/** A filename-safe, timestamped name for a downloaded export. */
export function exportFilename(base: string, now: Date): string {
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-')
  const safe = base.replace(/[^a-z0-9-]/gi, '-').toLowerCase()
  return `${safe}-${stamp}.csv`
}
