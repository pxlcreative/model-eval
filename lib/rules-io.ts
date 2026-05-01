// Round-trippable rules export/import. Used both server-side (CLI script,
// import server action) and client-side (live preview in /admin/rules).
// Keep this file free of @prisma/client imports so it stays bundleable for
// the browser.

import { ParseError } from './parsers'
export { ParseError }

export type RuleType = 'HARD_STOP' | 'WARNING'
export type RuleKind = 'KEYWORD' | 'KEYWORD_WEIGHT_THRESHOLD' | 'REGEX' | 'REGEX_WEIGHT_THRESHOLD'
export type MatchMode = 'ANY' | 'ALL'
export type WeightOp = 'GT' | 'GTE' | 'LT' | 'LTE'

// Full rule shape this utility reads from. Matches `SerializedRule` in
// app/admin/rules/actions.ts (timestamps as ISO strings, weight_pct as number).
export type FullRule = {
  id: string
  name: string
  type: RuleType
  rule_kind: RuleKind
  keywords: string[]
  match_mode: MatchMode
  weight_op: WeightOp | null
  weight_pct: number | null
  description: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export const ALL_FIELDS = [
  'id',
  'name',
  'type',
  'rule_kind',
  'keywords',
  'match_mode',
  'weight_op',
  'weight_pct',
  'description',
  'active',
  'created_at',
  'updated_at',
] as const
export type RuleField = (typeof ALL_FIELDS)[number]

// Default JSON field set — matches the legacy `toXanoRules` output exactly.
// Order matters for byte-identical CLI export.
export const XANO_DEFAULT_FIELDS: RuleField[] = [
  'id',
  'name',
  'type',
  'rule_kind',
  'keywords',
  'match_mode',
  'weight_op',
  'weight_pct',
]

// Required-on-import vs optional. Drives validation messages.
const REQUIRED_FIELDS: RuleField[] = ['name', 'type', 'rule_kind', 'keywords']

// Parsed row from JSON or CSV. All optional except the four required fields.
export type ImportRow = {
  id?: string
  name: string
  type: RuleType
  rule_kind: RuleKind
  keywords: string[]
  match_mode?: MatchMode
  weight_op?: WeightOp | null
  weight_pct?: number | null
  description?: string | null
  active?: boolean
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export type SerializeOptions = {
  activeOnly: boolean
}

function selectAndOrder(rules: FullRule[], opts: SerializeOptions): FullRule[] {
  const filtered = opts.activeOnly ? rules.filter((r) => r.active) : rules.slice()
  return filtered.sort((a, b) => a.name.localeCompare(b.name))
}

function projectField(rule: FullRule, field: RuleField): unknown {
  return rule[field]
}

export function serializeRulesJSON(
  rules: FullRule[],
  fields: RuleField[],
  opts: SerializeOptions,
): string {
  const ordered = selectAndOrder(rules, opts)
  const out = ordered.map((rule) => {
    const obj: Record<string, unknown> = {}
    for (const f of fields) obj[f] = projectField(rule, f)
    return obj
  })
  return JSON.stringify(out, null, 2) + '\n'
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str === '') return ''
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

function csvCell(rule: FullRule, field: RuleField): string {
  const v = projectField(rule, field)
  if (field === 'keywords') {
    const arr = v as string[]
    // Pipe-separated is the preferred encoding for spreadsheet readability.
    // But regex alternation also uses `|`, so when ANY keyword contains a
    // pipe, fall back to a JSON-encoded array — round-trip-safe regardless.
    const text = arr.some((k) => k.includes('|')) ? JSON.stringify(arr) : arr.join('|')
    return csvEscape(text)
  }
  if (field === 'active') {
    return v ? 'true' : 'false'
  }
  if (v === null || v === undefined) return ''
  return csvEscape(v)
}

export function serializeRulesCSV(
  rules: FullRule[],
  fields: RuleField[],
  opts: SerializeOptions,
): string {
  const ordered = selectAndOrder(rules, opts)
  const header = fields.join(',')
  const rows = ordered.map((rule) => fields.map((f) => csvCell(rule, f)).join(','))
  return [header, ...rows].join('\n') + '\n'
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const VALID_TYPES = new Set<RuleType>(['HARD_STOP', 'WARNING'])
const VALID_KINDS = new Set<RuleKind>([
  'KEYWORD',
  'KEYWORD_WEIGHT_THRESHOLD',
  'REGEX',
  'REGEX_WEIGHT_THRESHOLD',
])
const VALID_MATCH_MODES = new Set<MatchMode>(['ANY', 'ALL'])
const VALID_WEIGHT_OPS = new Set<WeightOp>(['GT', 'GTE', 'LT', 'LTE'])

function coerceBoolean(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (s === 'true' || s === '1' || s === 'yes') return true
    if (s === 'false' || s === '0' || s === 'no') return false
    if (s === '') return undefined
  }
  return undefined
}

function coerceNumberOrNull(v: unknown): number | null | undefined {
  if (v === null) return null
  if (v === undefined) return undefined
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const s = v.trim()
    if (s === '') return null
    const n = Number(s)
    if (Number.isNaN(n)) return undefined
    return n
  }
  return undefined
}

function normalizeRow(raw: Record<string, unknown>, label: string): ImportRow {
  for (const f of REQUIRED_FIELDS) {
    if (raw[f] === undefined || raw[f] === null || raw[f] === '') {
      throw new ParseError(`${label}: missing required field "${f}".`)
    }
  }

  const name = String(raw.name).trim()
  const type = String(raw.type).trim().toUpperCase() as RuleType
  if (!VALID_TYPES.has(type)) {
    throw new ParseError(`${label}: invalid type "${raw.type}". Must be HARD_STOP or WARNING.`)
  }

  const rule_kind = String(raw.rule_kind).trim().toUpperCase() as RuleKind
  if (!VALID_KINDS.has(rule_kind)) {
    throw new ParseError(
      `${label}: invalid rule_kind "${raw.rule_kind}". Must be KEYWORD or KEYWORD_WEIGHT_THRESHOLD.`,
    )
  }

  let keywords: string[]
  if (Array.isArray(raw.keywords)) {
    keywords = raw.keywords.map((k) => String(k).trim()).filter((k) => k !== '')
  } else if (typeof raw.keywords === 'string') {
    // CSV path. A leading `[` signals a JSON-encoded array (used when any
    // keyword contains `|`, which would conflict with the pipe separator).
    // Otherwise, pipe-separated.
    const s = raw.keywords.trim()
    if (s.startsWith('[')) {
      try {
        const parsed = JSON.parse(s)
        if (!Array.isArray(parsed)) throw new Error('not an array')
        keywords = parsed.map((k) => String(k).trim()).filter((k) => k !== '')
      } catch (e) {
        throw new ParseError(`${label}: keywords cell looks like JSON but failed to parse: ${(e as Error).message}`)
      }
    } else {
      keywords = s.split('|').map((k) => k.trim()).filter((k) => k !== '')
    }
  } else {
    throw new ParseError(`${label}: keywords must be an array or pipe-separated string.`)
  }
  if (keywords.length === 0) {
    throw new ParseError(`${label}: keywords cannot be empty.`)
  }

  const out: ImportRow = { name, type, rule_kind, keywords }

  if (raw.id !== undefined && raw.id !== null && raw.id !== '') {
    out.id = String(raw.id)
  }

  if (raw.match_mode !== undefined && raw.match_mode !== null && raw.match_mode !== '') {
    const mm = String(raw.match_mode).trim().toUpperCase() as MatchMode
    if (!VALID_MATCH_MODES.has(mm)) {
      throw new ParseError(`${label}: invalid match_mode "${raw.match_mode}". Must be ANY or ALL.`)
    }
    out.match_mode = mm
  }

  if (raw.weight_op !== undefined && raw.weight_op !== null && raw.weight_op !== '') {
    const op = String(raw.weight_op).trim().toUpperCase() as WeightOp
    if (!VALID_WEIGHT_OPS.has(op)) {
      throw new ParseError(
        `${label}: invalid weight_op "${raw.weight_op}". Must be GT, GTE, LT, or LTE.`,
      )
    }
    out.weight_op = op
  } else if (raw.weight_op === null || raw.weight_op === '') {
    out.weight_op = null
  }

  const wp = coerceNumberOrNull(raw.weight_pct)
  if (wp === undefined && raw.weight_pct !== undefined) {
    throw new ParseError(`${label}: weight_pct "${raw.weight_pct}" is not a valid number.`)
  }
  if (wp !== undefined) out.weight_pct = wp

  const isThreshold = rule_kind === 'KEYWORD_WEIGHT_THRESHOLD' || rule_kind === 'REGEX_WEIGHT_THRESHOLD'
  if (isThreshold) {
    if (out.weight_op === undefined || out.weight_op === null) {
      throw new ParseError(`${label}: ${rule_kind} requires weight_op.`)
    }
    if (out.weight_pct === undefined || out.weight_pct === null) {
      throw new ParseError(`${label}: ${rule_kind} requires weight_pct.`)
    }
  }

  if (rule_kind === 'REGEX' || rule_kind === 'REGEX_WEIGHT_THRESHOLD') {
    for (const p of keywords) {
      try {
        new RegExp(p, 'i')
      } catch (e) {
        throw new ParseError(`${label}: invalid regex pattern "${p}": ${(e as Error).message}`)
      }
    }
  }

  if (raw.description !== undefined) {
    if (raw.description === null || raw.description === '') {
      out.description = null
    } else {
      out.description = String(raw.description).trim() || null
    }
  }

  if (raw.active !== undefined) {
    const ab = coerceBoolean(raw.active)
    if (ab !== undefined) out.active = ab
  }

  return out
}

export function parseRulesJSON(text: string): ImportRow[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    throw new ParseError(`Invalid JSON: ${(e as Error).message}`)
  }

  let arr: unknown[]
  if (Array.isArray(parsed)) {
    arr = parsed
  } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { rules?: unknown }).rules)) {
    arr = (parsed as { rules: unknown[] }).rules
  } else {
    throw new ParseError('JSON must be an array of rules or an object with a "rules" array.')
  }

  if (arr.length === 0) throw new ParseError('JSON contains no rules.')

  return arr.map((row, i) => {
    if (!row || typeof row !== 'object') {
      throw new ParseError(`Row ${i + 1}: expected an object.`)
    }
    return normalizeRow(row as Record<string, unknown>, `Row ${i + 1}`)
  })
}

// ---------------------------------------------------------------------------
// CSV parsing — mirrors `parseCSVRow` and `findColumnIndex` in lib/parsers.ts
// ---------------------------------------------------------------------------

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

function findColumnIndex(headers: string[], name: string): number {
  return headers.findIndex((h) => h.toLowerCase().trim() === name.toLowerCase())
}

export function parseRulesCSV(text: string): ImportRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length === 0) throw new ParseError('CSV file is empty.')

  const headers = parseCSVRow(lines[0])
  const indexes: Partial<Record<RuleField, number>> = {}
  for (const f of ALL_FIELDS) {
    const idx = findColumnIndex(headers, f)
    if (idx !== -1) indexes[f] = idx
  }

  for (const f of REQUIRED_FIELDS) {
    if (indexes[f] === undefined) {
      throw new ParseError(`CSV is missing required column "${f}".`)
    }
  }

  if (lines.length === 1) throw new ParseError('CSV contains no data rows.')

  const rows: ImportRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVRow(lines[i])
    const obj: Record<string, unknown> = {}
    for (const f of ALL_FIELDS) {
      const idx = indexes[f]
      if (idx === undefined) continue
      const cell = fields[idx]
      obj[f] = cell ?? ''
    }
    rows.push(normalizeRow(obj, `Row ${i + 1}`))
  }
  return rows
}
