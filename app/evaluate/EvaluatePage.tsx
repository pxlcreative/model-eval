'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Upload, Download, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { parseCSV, parseJSON, ParseError } from '@/lib/parsers'
import type { Position } from '@/lib/rules-engine'
import { runEvaluation, resolvePositionNames, getHistory, type EvalActionResult, type HistoryEntry, type ResolveResult } from './actions'

// ---------------------------------------------------------------------------
// Verdict UI helpers
// ---------------------------------------------------------------------------

const VERDICT_STYLES = {
  PASS: 'bg-green-100 text-green-800 border-green-200',
  WARN: 'bg-amber-100 text-amber-800 border-amber-200',
  FAIL: 'bg-red-100 text-red-800 border-red-200',
}

const VERDICT_LABEL = { PASS: 'Pass', WARN: 'Warning', FAIL: 'Fail' }

function VerdictBadge({ verdict }: { verdict: 'PASS' | 'WARN' | 'FAIL' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-5 py-1.5 text-2xl font-bold tracking-wide ${VERDICT_STYLES[verdict]}`}
    >
      {VERDICT_LABEL[verdict]}
    </span>
  )
}

function TypeBadge({ type }: { type: 'HARD_STOP' | 'WARNING' }) {
  return type === 'HARD_STOP' ? (
    <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100">Hard Stop</Badge>
  ) : (
    <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">Warning</Badge>
  )
}

// ---------------------------------------------------------------------------
// Result download
// ---------------------------------------------------------------------------

function downloadJSON(result: EvalActionResult, positions: Position[], portfolioName: string) {
  const payload = {
    log_id: result.log_id,
    evaluated_at: new Date().toISOString(),
    portfolio_name: portfolioName || null,
    verdict: result.verdict,
    summary: result.summary,
    triggered: result.triggered,
    positions,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `eval-${result.log_id.slice(0, 8)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type InputState =
  | { kind: 'empty' }
  | { kind: 'resolving'; fileName: string; rawCount: number }
  | { kind: 'parsed'; positions: Position[]; fileName: string; resolvedCount: number }
  | { kind: 'parseError'; message: string }

type EvalState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; result: EvalActionResult; positions: Position[] }
  | { kind: 'error'; message: string }

export default function EvaluatePage() {
  const [inputState, setInputState] = useState<InputState>({ kind: 'empty' })
  const [evalState, setEvalState] = useState<EvalState>({ kind: 'idle' })
  const [portfolioName, setPortfolioName] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [history, setHistory] = useState<HistoryEntry[] | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getHistory().then(setHistory).catch(() => setHistory([]))
  }, [])

  // ---- ticker resolution ---------------------------------------------------

  async function resolveAndSet(positions: Position[], fileName: string) {
    setInputState({ kind: 'resolving', fileName, rawCount: positions.length })

    const result: ResolveResult = await resolvePositionNames(positions)

    if (!result.ok) {
      setInputState({ kind: 'parseError', message: result.error })
      return
    }

    setInputState({ kind: 'parsed', positions: result.positions, fileName, resolvedCount: result.resolvedCount })
    setEvalState({ kind: 'idle' })
  }

  // ---- file parsing --------------------------------------------------------

  function parseFile(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      try {
        const result = file.name.endsWith('.csv') ? parseCSV(content) : parseJSON(content)
        setPasteOpen(false)
        setPasteText('')
        setEvalState({ kind: 'idle' })
        if (result.hasTickerFallback) {
          resolveAndSet(result.positions, file.name)
        } else {
          setInputState({ kind: 'parsed', positions: result.positions, fileName: file.name, resolvedCount: 0 })
        }
      } catch (err) {
        setInputState({
          kind: 'parseError',
          message: err instanceof ParseError ? err.message : 'Could not parse file.',
        })
      }
    }
    reader.readAsText(file)
  }

  function handlePasteChange(text: string) {
    setPasteText(text)
    if (!text.trim()) {
      setInputState({ kind: 'empty' })
      return
    }
    try {
      const result = parseJSON(text)
      setEvalState({ kind: 'idle' })
      if (result.hasTickerFallback) {
        resolveAndSet(result.positions, 'pasted JSON')
      } else {
        setInputState({ kind: 'parsed', positions: result.positions, fileName: 'pasted JSON', resolvedCount: 0 })
      }
    } catch (err) {
      if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
        setInputState({
          kind: 'parseError',
          message: err instanceof ParseError ? err.message : 'Invalid JSON.',
        })
      }
    }
  }

  // ---- drag & drop ---------------------------------------------------------

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => setIsDragOver(false), [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) parseFile(file)
  }, [])

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) parseFile(file)
    e.target.value = ''
  }

  // ---- evaluate ------------------------------------------------------------

  async function handleEvaluate() {
    if (inputState.kind !== 'parsed') return
    setEvalState({ kind: 'loading' })
    try {
      const result = await runEvaluation(inputState.positions, portfolioName.trim() || null)
      setEvalState({ kind: 'done', result, positions: inputState.positions })
      getHistory().then(setHistory).catch(() => {})
    } catch (err) {
      setEvalState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Evaluation failed.',
      })
    }
  }

  const canEvaluate = inputState.kind === 'parsed' && evalState.kind !== 'loading'

  // ---- drop zone display ---------------------------------------------------

  function DropZoneContent() {
    if (inputState.kind === 'resolving') {
      return (
        <>
          <Loader2 size={20} className="text-primary animate-spin" />
          <div className="text-sm font-medium">Resolving fund names…</div>
          <div className="text-xs text-muted-foreground">
            Looking up {inputState.rawCount} ticker{inputState.rawCount !== 1 ? 's' : ''} via OpenFIGI
          </div>
        </>
      )
    }
    if (inputState.kind === 'parsed') {
      return (
        <>
          <div className="text-green-600 font-medium text-sm">{inputState.fileName}</div>
          <div className="text-xs text-muted-foreground">
            {inputState.positions.length} position{inputState.positions.length !== 1 ? 's' : ''} loaded
            {inputState.resolvedCount > 0 && (
              <> — <span className="text-primary">{inputState.resolvedCount} ticker{inputState.resolvedCount !== 1 ? 's' : ''} resolved</span></>
            )}
            {' '}— click to replace
          </div>
        </>
      )
    }
    if (inputState.kind === 'parseError') {
      return (
        <>
          <Upload size={20} className="text-destructive" />
          <div className="text-destructive text-sm font-medium">Parse error</div>
          <div className="text-xs text-muted-foreground max-w-sm">{inputState.message}</div>
          <div className="text-xs text-muted-foreground">Click to try a different file</div>
        </>
      )
    }
    return (
      <>
        <Upload size={20} className="text-muted-foreground" />
        <div className="text-sm font-medium">
          {isDragOver ? 'Drop to upload' : 'Drop a .csv or .json file'}
        </div>
        <div className="text-xs text-muted-foreground">
          Supports product name, ticker, or CUSIP — click to browse
        </div>
      </>
    )
  }

  const dropZoneBorder =
    isDragOver
      ? 'border-primary bg-primary/5'
      : inputState.kind === 'parsed'
        ? 'border-green-400 bg-green-50/50'
        : inputState.kind === 'resolving'
          ? 'border-primary/40 bg-primary/5'
          : inputState.kind === 'parseError'
            ? 'border-destructive bg-destructive/5'
            : 'border-border hover:border-foreground/30 hover:bg-accent/50'

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-6 py-10 flex flex-col gap-10">

        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Evaluate Portfolio</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload a CSV or JSON file and run it against all active rules.
            Accepts product names, ticker symbols, or CUSIPs.
          </p>
        </div>

        <div className="rounded-lg border bg-card flex flex-col gap-5 p-6">

          {/* Drop zone */}
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload portfolio file"
            onClick={() => inputState.kind !== 'resolving' && fileInputRef.current?.click()}
            onKeyDown={(e) => e.key === 'Enter' && inputState.kind !== 'resolving' && fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors select-none
              ${inputState.kind === 'resolving' ? 'cursor-wait' : 'cursor-pointer'}
              ${dropZoneBorder}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json"
              className="sr-only"
              onChange={handleFileInputChange}
            />
            <DropZoneContent />
          </div>

          {/* Paste JSON toggle */}
          <div>
            <button
              type="button"
              onClick={() => setPasteOpen((o) => !o)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {pasteOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {pasteOpen ? 'Hide paste area' : 'or paste JSON'}
            </button>
            {pasteOpen && (
              <Textarea
                className="mt-2 font-mono text-xs resize-none"
                rows={6}
                placeholder={'[{ "ticker": "SPY", "weight": 60 }, { "product_name": "Bond Fund", "weight": 40 }]'}
                value={pasteText}
                onChange={(e) => handlePasteChange(e.target.value)}
                autoFocus
              />
            )}
          </div>

          <Separator />

          {/* Portfolio name + evaluate */}
          <div className="flex gap-3 items-end">
            <div className="flex-1 flex flex-col gap-1.5">
              <Label htmlFor="portfolio-name" className="text-sm font-medium">
                Portfolio name{' '}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="portfolio-name"
                value={portfolioName}
                onChange={(e) => setPortfolioName(e.target.value)}
                placeholder="e.g. Client Model Q2 2026"
              />
            </div>
            <Button onClick={handleEvaluate} disabled={!canEvaluate} className="shrink-0">
              {evalState.kind === 'loading' ? 'Evaluating…' : 'Evaluate'}
            </Button>
          </div>

          {evalState.kind === 'error' && (
            <p className="text-sm text-destructive">{evalState.message}</p>
          )}
        </div>

        {evalState.kind === 'done' && (
          <ResultsPanel
            result={evalState.result}
            positions={evalState.positions}
            portfolioName={portfolioName}
          />
        )}

        <HistorySection history={history} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Results panel
// ---------------------------------------------------------------------------

function ResultsPanel({
  result,
  positions,
  portfolioName,
}: {
  result: EvalActionResult
  positions: Position[]
  portfolioName: string
}) {
  const [showPositions, setShowPositions] = useState(false)
  const triggeredNames = new Set(result.triggered.flatMap((t) => t.matched_positions))

  return (
    <div className="rounded-lg border bg-card flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <VerdictBadge verdict={result.verdict} />
          <p className="text-sm text-muted-foreground">{result.summary}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={() => downloadJSON(result, positions, portfolioName)}
        >
          <Download size={14} />
          Download JSON
        </Button>
      </div>

      {result.triggered.length === 0 ? (
        <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
          No issues found — all positions cleared active rules.
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule</TableHead>
                <TableHead className="w-28">Type</TableHead>
                <TableHead>Matched Position</TableHead>
                <TableHead>Keyword</TableHead>
                <TableHead className="w-20 text-right">Weight</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.triggered.map((t, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{t.rule_name}</TableCell>
                  <TableCell><TypeBadge type={t.rule_type} /></TableCell>
                  <TableCell className="text-sm">{t.matched_positions.join(', ')}</TableCell>
                  <TableCell>
                    <span className="font-mono text-xs bg-secondary text-secondary-foreground rounded px-1.5 py-0.5">
                      {t.matched_keyword}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{t.total_weight}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Portfolio positions toggle */}
      <div>
        <button
          type="button"
          onClick={() => setShowPositions((o) => !o)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {showPositions ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {showPositions ? 'Hide' : 'View'} portfolio ({positions.length} position{positions.length !== 1 ? 's' : ''})
        </button>

        {showPositions && (
          <div className="mt-3 rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product Name</TableHead>
                  <TableHead className="w-28">Ticker</TableHead>
                  <TableHead className="w-20 text-right">Weight</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {positions.map((p, i) => {
                  const flagged = triggeredNames.has(p.product_name)
                  return (
                    <TableRow key={i} className={flagged ? 'bg-red-50/60' : undefined}>
                      <TableCell className={`text-sm font-medium ${flagged ? 'text-red-700' : ''}`}>
                        {p.product_name}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {p.ticker ?? '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{p.weight}%</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// History section
// ---------------------------------------------------------------------------

function HistorySection({ history }: { history: HistoryEntry[] | null }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Recent Evaluations</h2>
        {history !== null && (
          <span className="text-xs text-muted-foreground">{history.length} run{history.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {history === null && (
        <div className="rounded-md border">
          <Table>
            <TableHeader><HistoryTableHead /></TableHeader>
            <TableBody>
              {Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}><div className="h-4 rounded bg-muted animate-pulse" /></TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {history !== null && history.length === 0 && (
        <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
          No evaluations yet. Run your first portfolio above.
        </div>
      )}

      {history !== null && history.length > 0 && (
        <div className="rounded-md border">
          <Table>
            <TableHeader><HistoryTableHead /></TableHeader>
            <TableBody>
              {history.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-sm">
                    {entry.portfolio_name ?? <span className="text-muted-foreground italic">Unnamed</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs font-mono uppercase tracking-wide">
                      {entry.source}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${VERDICT_STYLES[entry.result]}`}>
                      {VERDICT_LABEL[entry.result]}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {entry.triggered_count > 0
                      ? <span className="text-foreground">{entry.triggered_count}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground tabular-nums">
                    {new Date(entry.evaluated_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function HistoryTableHead() {
  return (
    <TableRow>
      <TableHead>Portfolio</TableHead>
      <TableHead className="w-20">Source</TableHead>
      <TableHead className="w-24">Result</TableHead>
      <TableHead className="w-24">Triggered</TableHead>
      <TableHead className="w-40">Time</TableHead>
    </TableRow>
  )
}
