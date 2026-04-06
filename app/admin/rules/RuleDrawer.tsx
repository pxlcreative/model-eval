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
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { X } from 'lucide-react'
import { createRule, updateRule, type SerializedRule, type RuleFormData } from './actions'

type Props = {
  open: boolean
  onClose: () => void
  onSaved: (rule: SerializedRule) => void
  rule: SerializedRule | null // null = create mode
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

  // Keyword tag input
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

  function removeKeyword(kw: string) {
    set('keywords', form.keywords.filter((k) => k !== kw))
  }

  function validate(): boolean {
    const next: typeof errors = {}
    if (!form.name.trim()) next.name = 'Name is required.'
    const allKeywords = [
      ...form.keywords,
      ...form.keywordInput
        .split(',')
        .map((k) => k.trim().toUpperCase())
        .filter(Boolean),
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
    // Flush any pending keyword input before validating
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
      <SheetContent className="w-full sm:max-w-lg flex flex-col gap-0 overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle>{rule ? 'Edit Rule' : 'New Rule'}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-5 flex-1 pb-4">
          {/* Name */}
          <Field label="Name" error={errors.name}>
            <Input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Leveraged Products Hard Stop"
            />
          </Field>

          {/* Type + Rule Kind */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Type" error={errors.type}>
              <Select value={form.type} onValueChange={(v) => set('type', v as FormState['type'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HARD_STOP">Hard Stop</SelectItem>
                  <SelectItem value="WARNING">Warning</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label="Rule Kind" error={errors.rule_kind}>
              <Select
                value={form.rule_kind}
                onValueChange={(v) => set('rule_kind', v as FormState['rule_kind'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="KEYWORD">Keyword</SelectItem>
                  <SelectItem value="KEYWORD_WEIGHT_THRESHOLD">Weight Threshold</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          {/* Keywords */}
          <Field
            label="Keywords"
            hint="Type a keyword and press Enter or comma to add. Matching is case-insensitive substring."
            error={errors.keywords}
          >
            <div
              className="flex flex-wrap gap-1.5 min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-ring cursor-text"
              onClick={() =>
                (document.getElementById('keyword-input') as HTMLInputElement)?.focus()
              }
            >
              {form.keywords.map((kw) => (
                <span
                  key={kw}
                  className="inline-flex items-center gap-1 bg-secondary text-secondary-foreground rounded px-2 py-0.5 text-xs font-mono"
                >
                  {kw}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeKeyword(kw) }}
                    className="hover:text-destructive"
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
                placeholder={form.keywords.length === 0 ? 'LEVERAGED, INVERSE…' : ''}
                className="flex-1 min-w-24 bg-transparent outline-none placeholder:text-muted-foreground"
              />
            </div>
          </Field>

          {/* Match Mode */}
          <Field label="Match Mode">
            <div className="flex gap-2">
              {(['ANY', 'ALL'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => set('match_mode', mode)}
                  className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                    form.match_mode === mode
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-input hover:bg-accent'
                  }`}
                >
                  {mode === 'ANY' ? 'Any keyword' : 'All keywords'}
                </button>
              ))}
            </div>
          </Field>

          {/* Weight Threshold fields */}
          {isThreshold && (
            <>
              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <Field label="Weight Operator" error={errors.weight_op}>
                  <Select
                    value={form.weight_op}
                    onValueChange={(v) => set('weight_op', v as FormState['weight_op'])}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GT">&gt; greater than</SelectItem>
                      <SelectItem value="GTE">≥ at least</SelectItem>
                      <SelectItem value="LT">&lt; less than</SelectItem>
                      <SelectItem value="LTE">≤ at most</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Weight %" error={errors.weight_pct}>
                  <div className="relative">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="any"
                      value={form.weight_pct}
                      onChange={(e) => set('weight_pct', e.target.value)}
                      placeholder="10"
                      className="pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      %
                    </span>
                  </div>
                </Field>
              </div>
            </>
          )}

          <Separator />

          {/* Description */}
          <Field label="Description" hint="Optional — displayed in the UI only.">
            <Textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="What does this rule protect against?"
              rows={3}
            />
          </Field>
        </div>

        <SheetFooter className="pt-2 gap-2">
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
      <Label className="font-medium">{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
