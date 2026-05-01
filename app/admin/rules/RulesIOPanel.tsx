'use client'

import { useCallback, useMemo, useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Copy, Check, Download, Upload, AlertCircle, FileText, FileJson } from 'lucide-react'
import {
  ALL_FIELDS,
  XANO_DEFAULT_FIELDS,
  type RuleField,
  type ImportRow,
  serializeRulesJSON,
  serializeRulesCSV,
  parseRulesJSON,
  parseRulesCSV,
  type FullRule,
  ParseError,
} from '@/lib/rules-io'
import {
  importRules,
  planImport,
  type SerializedRule,
  type ImportPlan,
  type ImportSummary,
} from './actions'

const FIELD_LABELS: Record<RuleField, string> = {
  id: 'id',
  name: 'name',
  type: 'type',
  rule_kind: 'rule_kind',
  keywords: 'keywords',
  match_mode: 'match_mode',
  weight_op: 'weight_op',
  weight_pct: 'weight_pct',
  description: 'description',
  active: 'active',
  created_at: 'created_at',
  updated_at: 'updated_at',
}

type Format = 'json' | 'csv'

function toFullRules(rules: SerializedRule[]): FullRule[] {
  return rules.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    rule_kind: r.rule_kind,
    keywords: r.keywords,
    match_mode: r.match_mode,
    weight_op: r.weight_op,
    weight_pct: r.weight_pct,
    description: r.description,
    active: r.active,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }))
}

export default function RulesIOPanel({
  rules,
  onImported,
}: {
  rules: SerializedRule[]
  onImported: () => void
}) {
  const [tab, setTab] = useState<'export' | 'import'>('export')

  return (
    <div className="mt-10 rounded-md border">
      <div className="px-4 py-3 border-b bg-muted/30">
        <h2 className="text-sm font-semibold">Import / Export</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Move rules between machines and the Xano paste workflow. JSON and CSV are
          fully round-trippable.
        </p>
      </div>

      <div className="flex gap-1 px-4 pt-3 -mb-px border-b">
        <TabButton active={tab === 'export'} onClick={() => setTab('export')}>
          Export
        </TabButton>
        <TabButton active={tab === 'import'} onClick={() => setTab('import')}>
          Import
        </TabButton>
      </div>

      {tab === 'export' && <ExportTab rules={rules} />}
      {tab === 'import' && <ImportTab onImported={onImported} />}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
        active
          ? 'border-foreground text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Export tab
// ───────────────────────────────────────────────────────────────────────────

function ExportTab({ rules }: { rules: SerializedRule[] }) {
  const [format, setFormat] = useState<Format>('json')
  const [selected, setSelected] = useState<Set<RuleField>>(new Set(XANO_DEFAULT_FIELDS))
  const [activeOnly, setActiveOnly] = useState(true)
  const [copied, setCopied] = useState(false)

  const fullRules = useMemo(() => toFullRules(rules), [rules])
  const orderedFields = useMemo<RuleField[]>(
    () => ALL_FIELDS.filter((f) => selected.has(f)),
    [selected],
  )

  const output = useMemo(() => {
    if (orderedFields.length === 0) return ''
    return format === 'json'
      ? serializeRulesJSON(fullRules, orderedFields, { activeOnly })
      : serializeRulesCSV(fullRules, orderedFields, { activeOnly })
  }, [fullRules, orderedFields, format, activeOnly])

  const includedCount = useMemo(
    () => (activeOnly ? rules.filter((r) => r.active).length : rules.length),
    [rules, activeOnly],
  )

  function applyXanoPreset() {
    setFormat('json')
    setSelected(new Set(XANO_DEFAULT_FIELDS))
    setActiveOnly(true)
  }

  function applyFullBackupPreset() {
    setSelected(new Set(ALL_FIELDS))
    setActiveOnly(false)
  }

  function toggleField(f: RuleField) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(f)) next.delete(f)
      else next.add(f)
      return next
    })
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(output)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (e) {
      console.error('Clipboard write failed', e)
    }
  }

  function handleDownload() {
    const ext = format === 'json' ? 'json' : 'csv'
    const mime = format === 'json' ? 'application/json' : 'text/csv'
    const date = new Date().toISOString().slice(0, 10)
    const blob = new Blob([output], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rules-${date}.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Presets + format + active-only */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={applyXanoPreset} className="text-xs">
          Xano paste defaults
        </Button>
        <Button variant="outline" size="sm" onClick={applyFullBackupPreset} className="text-xs">
          Full backup
        </Button>

        <div className="ml-auto flex items-center gap-3">
          <div className="inline-flex rounded-md border p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setFormat('json')}
              className={`px-2.5 py-1 rounded inline-flex items-center gap-1 ${
                format === 'json' ? 'bg-muted font-medium' : 'text-muted-foreground'
              }`}
            >
              <FileJson size={12} />
              JSON
            </button>
            <button
              type="button"
              onClick={() => setFormat('csv')}
              className={`px-2.5 py-1 rounded inline-flex items-center gap-1 ${
                format === 'csv' ? 'bg-muted font-medium' : 'text-muted-foreground'
              }`}
            >
              <FileText size={12} />
              CSV
            </button>
          </div>

          <label className="inline-flex items-center gap-2 text-xs">
            <Switch checked={activeOnly} onCheckedChange={setActiveOnly} />
            Active only
          </label>
        </div>
      </div>

      {/* Field checkboxes */}
      <div className="rounded-md border bg-muted/20 px-3 py-2.5">
        <div className="text-xs font-medium text-muted-foreground mb-1.5">Fields</div>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-4 gap-y-1">
          {ALL_FIELDS.map((f) => (
            <label key={f} className="inline-flex items-center gap-2 text-xs font-mono cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(f)}
                onChange={() => toggleField(f)}
                className="size-3.5 accent-foreground"
              />
              {FIELD_LABELS[f]}
            </label>
          ))}
        </div>
      </div>

      {/* Preview */}
      <pre className="text-xs font-mono px-3 py-2.5 max-h-96 overflow-auto rounded-md border bg-background">
        {output || <span className="text-muted-foreground">Select at least one field.</span>}
      </pre>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {includedCount} rule{includedCount !== 1 ? 's' : ''} · {orderedFields.length} field
          {orderedFields.length !== 1 ? 's' : ''}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCopy} disabled={!output} className="gap-1.5">
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button size="sm" onClick={handleDownload} disabled={!output} className="gap-1.5">
            <Download size={14} />
            Download
          </Button>
        </div>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Import tab
// ───────────────────────────────────────────────────────────────────────────

function ImportTab({ onImported }: { onImported: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [rows, setRows] = useState<ImportRow[] | null>(null)
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [parseErr, setParseErr] = useState<string | null>(null)
  const [result, setResult] = useState<ImportSummary | null>(null)
  const [isPending, startTransition] = useTransition()

  function reset() {
    setRows(null)
    setPlan(null)
    setParseErr(null)
    setResult(null)
    setFileName(null)
  }

  function detectFormat(name: string, content: string): 'json' | 'csv' {
    if (name.toLowerCase().endsWith('.json')) return 'json'
    if (name.toLowerCase().endsWith('.csv')) return 'csv'
    const trimmed = content.trim()
    return trimmed.startsWith('[') || trimmed.startsWith('{') ? 'json' : 'csv'
  }

  async function loadFile(file: File) {
    reset()
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = async (e) => {
      const content = e.target?.result as string
      try {
        const fmt = detectFormat(file.name, content)
        const parsed = fmt === 'json' ? parseRulesJSON(content) : parseRulesCSV(content)
        setRows(parsed)
        const planResult = await planImport(parsed)
        setPlan(planResult)
      } catch (err) {
        setParseErr(err instanceof ParseError ? err.message : err instanceof Error ? err.message : 'Could not parse file.')
      }
    }
    reader.readAsText(file)
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => setIsDragOver(false), [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) loadFile(file)
  }, [])

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) loadFile(file)
    e.target.value = ''
  }

  function handleApply() {
    if (!rows) return
    startTransition(async () => {
      try {
        const summary = await importRules(rows)
        setResult(summary)
        if (summary.created + summary.updated > 0) onImported()
      } catch (err) {
        setParseErr(err instanceof Error ? err.message : 'Import failed.')
      }
    })
  }

  const dropZoneBorder = isDragOver
    ? 'border-primary bg-primary/5'
    : parseErr
      ? 'border-destructive bg-destructive/5'
      : rows
        ? 'border-green-400 bg-green-50/50'
        : 'border-border hover:border-foreground/30 hover:bg-accent/50'

  return (
    <div className="px-4 py-4 space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.json"
        className="sr-only"
        onChange={handleFileInputChange}
      />

      <div
        role="button"
        tabIndex={0}
        aria-label="Upload rules file"
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center cursor-pointer transition-colors select-none ${dropZoneBorder}`}
      >
        {parseErr ? (
          <>
            <AlertCircle size={20} className="text-destructive" />
            <div className="text-destructive text-sm font-medium">Parse error</div>
            <div className="text-xs text-muted-foreground max-w-md">{parseErr}</div>
            <div className="text-xs text-muted-foreground">Click to try again</div>
          </>
        ) : rows && plan ? (
          <>
            <div className="text-green-700 font-medium text-sm">{fileName}</div>
            <div className="text-xs text-muted-foreground">
              {rows.length} rule{rows.length !== 1 ? 's' : ''} parsed — click to replace
            </div>
          </>
        ) : (
          <>
            <Upload size={20} className="text-muted-foreground" />
            <div className="text-sm font-medium">
              {isDragOver ? 'Drop to import' : 'Drop a .json or .csv file'}
            </div>
            <div className="text-xs text-muted-foreground">
              Round-trippable with the Export tab — click to browse
            </div>
          </>
        )}
      </div>

      {/* Preview table */}
      {rows && plan && !result && (
        <div className="rounded-md border">
          <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between">
            <div className="text-xs font-medium">Preview</div>
            <div className="text-xs text-muted-foreground">
              {plan.entries.filter((e) => e.action === 'create').length} create ·{' '}
              {plan.entries.filter((e) => e.action === 'update').length} update
            </div>
          </div>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/20 sticky top-0">
                <tr className="text-left text-muted-foreground">
                  <th className="px-3 py-1.5 font-medium w-16">#</th>
                  <th className="px-3 py-1.5 font-medium">Name</th>
                  <th className="px-3 py-1.5 font-medium w-24">Action</th>
                  <th className="px-3 py-1.5 font-medium w-28">Match</th>
                </tr>
              </thead>
              <tbody>
                {plan.entries.map((entry) => (
                  <tr key={entry.index} className="border-t">
                    <td className="px-3 py-1.5 text-muted-foreground">{entry.index + 1}</td>
                    <td className="px-3 py-1.5 font-medium">{entry.name}</td>
                    <td className="px-3 py-1.5">
                      {entry.action === 'create' ? (
                        <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-700">
                          Create
                        </span>
                      ) : (
                        <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700">
                          Update
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">
                      {entry.match === 'id' ? 'by id' : entry.match === 'name' ? 'by name' : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Result banner */}
      {result && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            result.errors.length > 0
              ? 'border-destructive/40 bg-destructive/5 text-destructive'
              : 'border-green-300 bg-green-50 text-green-800'
          }`}
        >
          <div className="font-medium">
            Imported {result.created + result.updated} rule
            {result.created + result.updated !== 1 ? 's' : ''} — {result.created} created,{' '}
            {result.updated} updated
          </div>
          {result.errors.length > 0 && (
            <ul className="mt-1 ml-4 list-disc text-xs">
              {result.errors.map((e, i) => (
                <li key={i}>
                  {e.name ? <strong>{e.name}: </strong> : null}
                  {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Apply button */}
      {rows && plan && !result && (
        <div className="flex justify-end">
          <Button onClick={handleApply} disabled={isPending} size="sm">
            {isPending ? 'Applying…' : `Apply ${rows.length} rule${rows.length !== 1 ? 's' : ''}`}
          </Button>
        </div>
      )}
    </div>
  )
}
