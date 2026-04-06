import type { Position } from './rules-engine'

export class ParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ParseError'
  }
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

const PRODUCT_NAME_COLS = ['product_name', 'name', 'security', 'description']
const WEIGHT_COLS = ['weight', 'allocation', 'pct', 'percent']

function parseCSVRow(row: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < row.length; i++) {
    const ch = row[i]
    if (ch === '"') {
      // Escaped quote inside a quoted field ("" → ")
      if (inQuotes && row[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current.trim())
  return fields
}

function findColumnIndex(headers: string[], candidates: string[]): number {
  return headers.findIndex((h) => candidates.includes(h.toLowerCase().trim()))
}

function toWeight(raw: string, rowIndex: number): number {
  const cleaned = raw.replace(/%/g, '').trim()
  const n = Number(cleaned)
  if (!cleaned || isNaN(n)) {
    throw new ParseError(`Row ${rowIndex + 1}: weight value "${raw}" is not a valid number.`)
  }
  return n
}

export function parseCSV(fileContent: string): Position[] {
  const lines = fileContent.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length === 0) throw new ParseError('CSV file is empty.')

  const headers = parseCSVRow(lines[0])

  const nameIdx = findColumnIndex(headers, PRODUCT_NAME_COLS)
  const weightIdx = findColumnIndex(headers, WEIGHT_COLS)

  if (nameIdx === -1) {
    throw new ParseError(
      `CSV is missing a product name column. Expected one of: ${PRODUCT_NAME_COLS.join(', ')}. ` +
        `Found headers: ${headers.join(', ')}.`,
    )
  }
  if (weightIdx === -1) {
    throw new ParseError(
      `CSV is missing a weight column. Expected one of: ${WEIGHT_COLS.join(', ')}. ` +
        `Found headers: ${headers.join(', ')}.`,
    )
  }

  // Optional ticker column
  const tickerIdx = findColumnIndex(headers, ['ticker', 'symbol', 'cusip'])

  const positions: Position[] = []

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVRow(lines[i])

    const product_name = fields[nameIdx]?.trim()
    if (!product_name) {
      throw new ParseError(`Row ${i + 1}: product name is empty.`)
    }

    const weight = toWeight(fields[weightIdx] ?? '', i)

    const position: Position = { product_name, weight }
    if (tickerIdx !== -1 && fields[tickerIdx]?.trim()) {
      position.ticker = fields[tickerIdx].trim()
    }

    positions.push(position)
  }

  if (positions.length === 0) throw new ParseError('CSV contains no data rows.')
  return positions
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validatePosition(item: unknown, index: number): Position {
  if (!isRecord(item)) {
    throw new ParseError(`positions[${index}]: expected an object, got ${typeof item}.`)
  }

  const { product_name, weight, ticker } = item

  if (typeof product_name !== 'string' || product_name.trim() === '') {
    throw new ParseError(
      `positions[${index}]: "product_name" must be a non-empty string` +
        (product_name === undefined ? ' (field is missing).' : `, got ${JSON.stringify(product_name)}.`),
    )
  }

  // Accept weight as number or numeric string (strip % for consistency)
  let weightNum: number
  if (typeof weight === 'number') {
    weightNum = weight
  } else if (typeof weight === 'string') {
    const cleaned = weight.replace(/%/g, '').trim()
    weightNum = Number(cleaned)
    if (isNaN(weightNum)) {
      throw new ParseError(`positions[${index}]: "weight" string "${weight}" is not a valid number.`)
    }
  } else {
    throw new ParseError(
      `positions[${index}]: "weight" must be a number` +
        (weight === undefined ? ' (field is missing).' : `, got ${typeof weight}.`),
    )
  }

  const position: Position = { product_name: product_name.trim(), weight: weightNum }
  if (typeof ticker === 'string' && ticker.trim() !== '') {
    position.ticker = ticker.trim()
  }
  return position
}

export function parseJSON(content: string): Position[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new ParseError('Invalid JSON: could not parse input.')
  }

  let items: unknown[]

  if (Array.isArray(parsed)) {
    items = parsed
  } else if (isRecord(parsed) && Array.isArray(parsed.positions)) {
    items = parsed.positions
  } else if (isRecord(parsed)) {
    throw new ParseError(
      'JSON object must have a "positions" array property. ' +
        `Found keys: ${Object.keys(parsed).join(', ') || '(none)'}.`,
    )
  } else {
    throw new ParseError(
      `Expected a JSON array or an object with a "positions" array, got ${typeof parsed}.`,
    )
  }

  if (items.length === 0) throw new ParseError('"positions" array is empty.')

  return items.map((item, i) => validatePosition(item, i))
}
