import type { Position } from './rules-engine'

export class ParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ParseError'
  }
}

/**
 * Result of parsing a portfolio file.
 *
 * `hasTickerFallback` is true when at least one position's product_name
 * was populated from a ticker/cusip column because no name column was
 * found. Callers should run resolveTickerNames() on these positions
 * before evaluation so that keyword rules can match proper fund names.
 */
export type ParseResult = {
  positions: Position[]
  hasTickerFallback: boolean
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

const PRODUCT_NAME_COLS = ['product_name', 'name', 'security', 'description']
const WEIGHT_COLS = ['weight', 'allocation', 'pct', 'percent']
const TICKER_COLS = ['ticker', 'symbol', 'cusip']

function parseCSVRow(row: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < row.length; i++) {
    const ch = row[i]
    if (ch === '"') {
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

export function parseCSV(fileContent: string): ParseResult {
  const lines = fileContent.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length === 0) throw new ParseError('CSV file is empty.')

  const headers = parseCSVRow(lines[0])

  const nameIdx = findColumnIndex(headers, PRODUCT_NAME_COLS)
  const weightIdx = findColumnIndex(headers, WEIGHT_COLS)
  const tickerIdx = findColumnIndex(headers, TICKER_COLS)

  // No name column at all — hard fail
  if (nameIdx === -1 && tickerIdx === -1) {
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

  // If no name col but ticker col found → use ticker as product_name (needs resolution)
  const usingTickerAsFallback = nameIdx === -1 && tickerIdx !== -1

  const positions: Position[] = []

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVRow(lines[i])

    let product_name: string
    let ticker: string | undefined

    if (usingTickerAsFallback) {
      ticker = fields[tickerIdx]?.trim()
      if (!ticker) throw new ParseError(`Row ${i + 1}: ticker/cusip is empty.`)
      product_name = ticker.toUpperCase()
    } else {
      product_name = fields[nameIdx]?.trim()
      if (!product_name) throw new ParseError(`Row ${i + 1}: product name is empty.`)
      if (tickerIdx !== -1 && fields[tickerIdx]?.trim()) {
        ticker = fields[tickerIdx].trim()
      }
    }

    const weight = toWeight(fields[weightIdx] ?? '', i)
    const position: Position = { product_name, weight }
    if (ticker) position.ticker = ticker

    positions.push(position)
  }

  if (positions.length === 0) throw new ParseError('CSV contains no data rows.')
  return { positions, hasTickerFallback: usingTickerAsFallback }
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validatePosition(item: unknown, index: number): { position: Position; tickerFallback: boolean } {
  if (!isRecord(item)) {
    throw new ParseError(`positions[${index}]: expected an object, got ${typeof item}.`)
  }

  const { product_name, weight, ticker } = item

  const hasTicker = typeof ticker === 'string' && ticker.trim() !== ''

  // Accept ticker-only positions (no product_name)
  if ((product_name === undefined || product_name === null || product_name === '') && hasTicker) {
    let weightNum: number
    if (typeof weight === 'number') {
      weightNum = weight
    } else if (typeof weight === 'string') {
      const cleaned = (weight as string).replace(/%/g, '').trim()
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
    const tickerStr = (ticker as string).trim().toUpperCase()
    return {
      position: { product_name: tickerStr, weight: weightNum, ticker: tickerStr },
      tickerFallback: true,
    }
  }

  if (typeof product_name !== 'string' || product_name.trim() === '') {
    throw new ParseError(
      `positions[${index}]: "product_name" must be a non-empty string` +
        (product_name === undefined ? ' (field is missing).' : `, got ${JSON.stringify(product_name)}.`),
    )
  }

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
  if (hasTicker) position.ticker = (ticker as string).trim()
  return { position, tickerFallback: false }
}

export function parseJSON(content: string): ParseResult {
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

  let hasTickerFallback = false
  const positions: Position[] = []
  for (let i = 0; i < items.length; i++) {
    const { position, tickerFallback } = validatePosition(items[i], i)
    positions.push(position)
    if (tickerFallback) hasTickerFallback = true
  }

  return { positions, hasTickerFallback }
}
