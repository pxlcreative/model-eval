'use client'

import { useEffect, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { getRules, setRuleActive, deleteRule, type SerializedRule } from './actions'
import RuleDrawer from './RuleDrawer'

const WEIGHT_OP_LABEL: Record<string, string> = {
  GT: '>',
  GTE: '≥',
  LT: '<',
  LTE: '≤',
}

function TypeBadge({ type }: { type: 'HARD_STOP' | 'WARNING' }) {
  if (type === 'HARD_STOP') {
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 font-medium">
        Hard Stop
      </Badge>
    )
  }
  return (
    <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 font-medium">
      Warning
    </Badge>
  )
}

function WeightCondition({ rule }: { rule: SerializedRule }) {
  if (rule.rule_kind !== 'KEYWORD_WEIGHT_THRESHOLD' || !rule.weight_op || rule.weight_pct === null) {
    return <span className="text-muted-foreground text-xs">—</span>
  }
  return (
    <span className="font-mono text-sm">
      {WEIGHT_OP_LABEL[rule.weight_op]} {rule.weight_pct}%
    </span>
  )
}

export default function RulesPage() {
  const [rules, setRules] = useState<SerializedRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<SerializedRule | null>(null)
  const [isPending, startTransition] = useTransition()

  async function load() {
    try {
      setError(null)
      const data = await getRules()
      setRules(data)
    } catch (e) {
      setError('Failed to load rules. Please refresh.')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditingRule(null)
    setDrawerOpen(true)
  }

  function openEdit(rule: SerializedRule) {
    setEditingRule(rule)
    setDrawerOpen(true)
  }

  function handleSaved(saved: SerializedRule) {
    setRules((prev) => {
      const idx = prev.findIndex((r) => r.id === saved.id)
      return idx >= 0
        ? prev.map((r) => (r.id === saved.id ? saved : r))
        : [saved, ...prev]
    })
    setDrawerOpen(false)
  }

  function handleToggleActive(rule: SerializedRule, active: boolean) {
    // Optimistic update
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, active } : r)))
    startTransition(async () => {
      try {
        await setRuleActive(rule.id, active)
      } catch {
        // Revert on failure
        setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, active: !active } : r)))
      }
    })
  }

  function handleDelete(rule: SerializedRule) {
    if (!confirm(`Soft-delete "${rule.name}"? It will be deactivated and hidden from evaluations.`)) return
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, active: false } : r)))
    startTransition(async () => {
      try {
        await deleteRule(rule.id)
      } catch {
        // Revert on failure
        setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, active: true } : r)))
      }
    })
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Rules</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage hard stop and warning rules applied during portfolio evaluation.
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus size={16} />
            New Rule
          </Button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <RulesTableHead />
              </TableHeader>
              <TableBody>
                {Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}>
                        <div className="h-4 rounded bg-muted animate-pulse" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && rules.length === 0 && (
          <div className="rounded-md border border-dashed flex flex-col items-center justify-center py-20 gap-3 text-center">
            <p className="text-sm font-medium">No rules yet</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Create your first rule to start evaluating portfolios against hard stop and warning criteria.
            </p>
            <Button variant="outline" size="sm" onClick={openCreate} className="mt-2 gap-1.5">
              <Plus size={14} />
              New Rule
            </Button>
          </div>
        )}

        {/* Table */}
        {!loading && rules.length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <RulesTableHead />
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id} className={rule.active ? '' : 'opacity-50'}>
                    <TableCell className="font-medium max-w-48">
                      <div className="truncate" title={rule.name}>{rule.name}</div>
                      {rule.description && (
                        <div className="text-xs text-muted-foreground truncate mt-0.5" title={rule.description}>
                          {rule.description}
                        </div>
                      )}
                    </TableCell>

                    <TableCell>
                      <TypeBadge type={rule.type} />
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      {rule.rule_kind === 'KEYWORD' ? 'Keyword' : 'Weight Threshold'}
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-56">
                        {rule.keywords.map((kw) => (
                          <span
                            key={kw}
                            className="inline-block bg-secondary text-secondary-foreground rounded px-1.5 py-0.5 text-xs font-mono"
                          >
                            {kw}
                          </span>
                        ))}
                        {rule.match_mode === 'ALL' && (
                          <span className="inline-block text-xs text-muted-foreground italic ml-0.5">
                            (all)
                          </span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      <WeightCondition rule={rule} />
                    </TableCell>

                    <TableCell>
                      <Switch
                        checked={rule.active}
                        onCheckedChange={(checked) => handleToggleActive(rule, checked)}
                        disabled={isPending}
                        aria-label={rule.active ? 'Deactivate rule' : 'Activate rule'}
                      />
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-1.5 justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(rule)}
                          aria-label="Edit rule"
                        >
                          <Pencil size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(rule)}
                          disabled={isPending}
                          aria-label="Delete rule"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <RuleDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSaved={handleSaved}
        rule={editingRule}
      />
    </div>
  )
}

function RulesTableHead() {
  return (
    <TableRow>
      <TableHead className="w-48">Name</TableHead>
      <TableHead className="w-28">Type</TableHead>
      <TableHead className="w-36">Kind</TableHead>
      <TableHead>Keywords</TableHead>
      <TableHead className="w-28">Weight</TableHead>
      <TableHead className="w-20">Active</TableHead>
      <TableHead className="w-20 text-right">Actions</TableHead>
    </TableRow>
  )
}
