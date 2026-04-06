'use client'

import { useState, useEffect, KeyboardEvent } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createRule, updateRule, type SerializedRule, type RuleFormData } from './actions'

type Props = {
  open: boolean
  onClose: () => void
  onSaved: (rule: SerializedRule) => void
  rule: SerializedRule | null
}

type FormState = {
  name: string
  type: 'HARD_STOP' | 'WARNING'
  rule_kind: 'KEYWORD' | 'KEYWORD_WEIGHT_THRESHOLD'
  keywords: string[]
  keywordInput: string
  match_mode: 'ANY' | 'ALL'
  weight_op: 'GT' | 'GTE' | 'LT' | 'LTE' | ''
  weight_pct: string
  description: string
}

const EMPTY_FORM: FormState = {
  name: '',
  type: 'HARD_STOP',
  rule_kind: 'KEYWORD',
  keywords: [],
  keywordInput: '',
  match_mode: 'ANY',
  weight_op: 'GT',
  weight_pct: '',
  description: '',
}

function ruleToForm(rule: SerializedRule): FormState {
  return {
    name: rule.name,
    type: rule.type,
    rule_kind: rule.rule_kind,
    keywords: rule.keywords,
    keywordInput: '',
    match_mode: rule.match_mode,
    weight_op: rule.weight_op ?? 'GT',
    weight_pct: rule.weight_pct !== null ? String(rule.weight_pct) : '',
    description: rule.description ?? '',
  }
}

export default function RuleDrawer({ open, onClose, onSaved, rule }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(rule ? ruleToForm(rule) : EMPTY_FORM)
      setErrors({})
    }
  }, [open, rule])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  function commitKeywordInput() {
    const raw = form.keywordInput.trim().toUpperCase()
    if (!raw) return
    const newKws = raw
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k && !form.keywords.includes(k))
    if (newKws.length) {
      set('keywords', [...form.keywords, ...newKws])
      setErrors((prev) => ({ ...prev, keywords: undefined }))
    }
    set('keywordInput', '')
  }

  function handleKeywordKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commitKeywordInput()
    } else if (e.key === 'Backspace' && !form.keywordInput && form.keywords.length) {
      set('keywords', form.keywords.slice(0, -1))
    }
  }

  function validate(): boolean {
    const next: typeof errors = {}
    if (!form.name.trim()) next.name = 'Name is required.'
    const allKeywords = [
      ...form.keywords,
      ...form.keywordInput.split(',').map((k) => k.trim().toUpperCase()).filter(Boolean),
    ]
    if (allKeywords.length === 0) next.keywords = 'At least one keyword is required.'
    if (form.rule_kind === 'KEYWORD_WEIGHT_THRESHOLD') {
      if (!form.weight_op) next.weight_op = 'Operator is required.'
      const n = parseFloat(form.weight_pct)
      if (form.weight_pct === '' || isNaN(n) || n < 0 || n > 100)
        next.weight_pct = 'Enter a valid percentage (0–100).'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit() {
    const pendingKws = form.keywordInput
      .split(',')
      .map((k) => k.trim().toUpperCase())
      .filter((k) => k && !form.keywords.includes(k))
    const finalKeywords = [...form.keywords, ...pendingKws]
    const finalForm = { ...form, keywords: finalKeywords, keywordInput: '' }
    setForm(finalForm)

    if (!validate()) return
    setSaving(true)

    const data: RuleFormData = {
      name: finalForm.name,
      type: finalForm.type,
      rule_kind: finalForm.rule_kind,
      keywords: finalForm.keywords,
      match_mode: finalForm.match_mode,
      weight_op:
        finalForm.rule_kind === 'KEYWORD_WEIGHT_THRESHOLD' && finalForm.weight_op
          ? finalForm.weight_op
          : null,
      weight_pct:
        finalForm.rule_kind === 'KEYWORD_WEIGHT_THRESHOLD' && finalForm.weight_pct !== ''
          ? parseFloat(finalForm.weight_pct)
          : null,
      description: finalForm.description || null,
    }

    try {
      const saved = rule ? await updateRule(rule.id, data) : await createRule(data)
      onSaved(saved)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong.'
      setErrors({ name: msg })
    } finally {
      setSaving(false)
    }
  }

  const isThreshold = form.rule_kind === 'KEYWORD_WEIGHT_THRESHOLD'

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      {/* Override the built-in sm:max-w-sm with a wider panel */}
      <SheetContent className="flex flex-col p-0 sm:max-w-md [&[data-side=right]]:sm:max-w-md">
        <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <SheetTitle>{rule ? 'Edit Rule' : 'New Rule'}</SheetTitle>
        </SheetHeader>

        {/* Scrollable form body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">

          {/* Name */}
          <Field label="Name" error={errors.name}>
            <Input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Leveraged Products Hard Stop"
            />
          </Field>

          {/* Verdict type — card toggle */}
          <Field label="Verdict" error={errors.type}>
            <div className="grid grid-cols-2 gap-2">
              <TypeCard
                value="HARD_STOP"
                selected={form.type === 'HARD_STOP'}
                onClick={() => set('type', 'HARD_STOP')}
                title="Hard Stop"
                sub="Triggers FAIL"
                selectedClass="border-red-400 bg-red-50 text-red-900"
              />
              <TypeCard
                value="WARNING"
                selected={form.type === 'WARNING'}
                onClick={() => set('type', 'WARNING')}
                title="Warning"
                sub="Triggers WARN"
                selectedClass="border-amber-400 bg-amber-50 text-amber-900"
              />
            </div>
          </Field>

          {/* Rule kind */}
          <Field label="Rule Kind">
            <Select
              value={form.rule_kind}
              onValueChange={(v) => set('rule_kind', v as FormState['rule_kind'])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="KEYWORD">Keyword match</SelectItem>
                <SelectItem value="KEYWORD_WEIGHT_THRESHOLD">Keyword + weight threshold</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {/* Keywords */}
          <Field
            label="Keywords"
            hint="Press Enter or comma to add. Matching is case-insensitive."
            error={errors.keywords}
          >
            <div
              className={cn(
                'flex flex-wrap gap-1.5 min-h-10 w-full rounded-md border bg-background px-3 py-2 text-sm cursor-text transition-colors',
                'focus-within:outline-none focus-within:ring-1 focus-within:ring-ring',
                errors.keywords ? 'border-destructive' : 'border-input',
              )}
              onClick={() =>
                (document.getElementById('keyword-input') as HTMLInputElement)?.focus()
              }
            >
              {form.keywords.map((kw) => (
                <span
                  key={kw}
                  className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-xs font-mono text-secondary-foreground"
                >
                  {kw}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeKeyword(kw) }}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    aria-label={`Remove ${kw}`}
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
              <input
                id="keyword-input"
                value={form.keywordInput}
                onChange={(e) => set('keywordInput', e.target.value)}
                onKeyDown={handleKeywordKeyDown}
                onBlur={commitKeywordInput}
                placeholder={form.keywords.length === 0 ? 'e.g. LEVERAGED, INVERSE' : ''}
                className="flex-1 min-w-20 bg-transparent outline-none placeholder:text-muted-foreground text-sm"
              />
            </div>
          </Field>

          {/* Match mode — segmented control */}
          <Field label="Match Mode">
            <div className="flex rounded-md border border-input overflow-hidden">
              {(['ANY', 'ALL'] as const).map((mode, i) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => set('match_mode', mode)}
                  className={cn(
                    'flex-1 py-2 text-sm font-medium transition-colors focus-visible:outline-none',
                    i > 0 && 'border-l border-input',
                    form.match_mode === mode
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-foreground hover:bg-accent',
                  )}
                >
                  {mode === 'ANY' ? 'Any keyword' : 'All keywords'}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {form.match_mode === 'ANY'
                ? 'Triggers if any keyword appears in the position name.'
                : 'All keywords must appear in the same position name.'}
            </p>
          </Field>

          {/* Weight threshold — grouped section */}
          {isThreshold && (
            <div className="rounded-md border bg-muted/40 p-4 flex flex-col gap-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Weight Condition
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Operator" error={errors.weight_op}>
                  <Select
                    value={form.weight_op}
                    onValueChange={(v) => set('weight_op', v as FormState['weight_op'])}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GT">&gt;&nbsp;&nbsp;greater than</SelectItem>
                      <SelectItem value="GTE">≥&nbsp;&nbsp;at least</SelectItem>
                      <SelectItem value="LT">&lt;&nbsp;&nbsp;less than</SelectItem>
                      <SelectItem value="LTE">≤&nbsp;&nbsp;at most</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Threshold %" error={errors.weight_pct}>
                  <div className="relative">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="any"
                      value={form.weight_pct}
                      onChange={(e) => set('weight_pct', e.target.value)}
                      placeholder="10"
                      className="pr-7"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      %
                    </span>
                  </div>
                </Field>
              </div>
            </div>
          )}

          {/* Description */}
          <Field label="Description" hint="Optional — shown in the rules table.">
            <Textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="What does this rule protect against?"
              rows={3}
              className="resize-none"
            />
          </Field>
        </div>

        {/* Sticky footer */}
        <SheetFooter className="px-6 py-4 border-t shrink-0 flex-row justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : rule ? 'Save Changes' : 'Create Rule'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )

  function removeKeyword(kw: string) {
    set('keywords', form.keywords.filter((k) => k !== kw))
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TypeCard({
  selected,
  onClick,
  title,
  sub,
  selectedClass,
}: {
  value: string
  selected: boolean
  onClick: () => void
  title: string
  sub: string
  selectedClass: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        selected
          ? selectedClass
          : 'border-input bg-background hover:bg-accent text-foreground',
      )}
    >
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-xs opacity-60 mt-0.5">{sub}</div>
    </button>
  )
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {error
        ? <p className="text-xs text-destructive">{error}</p>
        : hint
          ? <p className="text-xs text-muted-foreground">{hint}</p>
          : null}
    </div>
  )
}
