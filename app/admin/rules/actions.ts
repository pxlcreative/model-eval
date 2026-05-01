'use server'

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import type { ImportRow } from '@/lib/rules-io'

// Plain-object representation safe to pass to client components
export type SerializedRule = {
  id: string
  name: string
  type: 'HARD_STOP' | 'WARNING'
  rule_kind: 'KEYWORD' | 'KEYWORD_WEIGHT_THRESHOLD' | 'REGEX' | 'REGEX_WEIGHT_THRESHOLD'
  keywords: string[]
  match_mode: 'ANY' | 'ALL'
  weight_op: 'GT' | 'GTE' | 'LT' | 'LTE' | null
  weight_pct: number | null
  description: string | null
  active: boolean
  created_at: string
  updated_at: string
}

function serialize(rule: Awaited<ReturnType<typeof prisma.rule.findFirstOrThrow>>): SerializedRule {
  return {
    ...rule,
    weight_pct: rule.weight_pct ? rule.weight_pct.toNumber() : null,
    created_at: rule.created_at.toISOString(),
    updated_at: rule.updated_at.toISOString(),
  }
}

export async function getRules(): Promise<SerializedRule[]> {
  const rules = await prisma.rule.findMany({ orderBy: { created_at: 'desc' } })
  return rules.map(serialize)
}

export type RuleFormData = {
  name: string
  type: 'HARD_STOP' | 'WARNING'
  rule_kind: 'KEYWORD' | 'KEYWORD_WEIGHT_THRESHOLD' | 'REGEX' | 'REGEX_WEIGHT_THRESHOLD'
  keywords: string[]
  match_mode: 'ANY' | 'ALL'
  weight_op: 'GT' | 'GTE' | 'LT' | 'LTE' | null
  weight_pct: number | null
  description: string | null
}

export async function createRule(data: RuleFormData): Promise<SerializedRule> {
  const rule = await prisma.rule.create({
    data: {
      name: data.name.trim(),
      type: data.type,
      rule_kind: data.rule_kind,
      keywords: data.keywords,
      match_mode: data.match_mode,
      weight_op: data.weight_op ?? null,
      weight_pct: data.weight_pct !== null ? new Prisma.Decimal(data.weight_pct) : null,
      description: data.description?.trim() || null,
    },
  })
  revalidatePath('/admin/rules')
  return serialize(rule)
}

export async function updateRule(id: string, data: Partial<RuleFormData>): Promise<SerializedRule> {
  const rule = await prisma.rule.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.type !== undefined && { type: data.type }),
      ...(data.rule_kind !== undefined && { rule_kind: data.rule_kind }),
      ...(data.keywords !== undefined && { keywords: data.keywords }),
      ...(data.match_mode !== undefined && { match_mode: data.match_mode }),
      ...(data.weight_op !== undefined && { weight_op: data.weight_op }),
      ...(data.weight_pct !== undefined && {
        weight_pct: data.weight_pct !== null ? new Prisma.Decimal(data.weight_pct) : null,
      }),
      ...(data.description !== undefined && { description: data.description?.trim() || null }),
    },
  })
  revalidatePath('/admin/rules')
  return serialize(rule)
}

export async function setRuleActive(id: string, active: boolean): Promise<void> {
  await prisma.rule.update({ where: { id }, data: { active } })
  revalidatePath('/admin/rules')
}

export async function deleteRule(id: string): Promise<void> {
  await prisma.rule.update({ where: { id }, data: { active: false } })
  revalidatePath('/admin/rules')
}

export type ImportPlanEntry = {
  index: number
  name: string
  action: 'create' | 'update'
  match: 'id' | 'name' | null
  existingId: string | null
}

export type ImportPlan = {
  entries: ImportPlanEntry[]
}

export type ImportSummary = {
  created: number
  updated: number
  errors: { name?: string; message: string }[]
}

function rowToPrismaData(row: ImportRow): Prisma.RuleUncheckedCreateInput {
  return {
    name: row.name.trim(),
    type: row.type,
    rule_kind: row.rule_kind,
    keywords: row.keywords,
    match_mode: row.match_mode ?? 'ANY',
    weight_op: row.weight_op ?? null,
    weight_pct: row.weight_pct === null || row.weight_pct === undefined ? null : new Prisma.Decimal(row.weight_pct),
    description: row.description ?? null,
    active: row.active ?? true,
  }
}

// Plan an import without writing — used by the UI preview to show
// Create/Update badges before the user confirms.
export async function planImport(rows: ImportRow[]): Promise<ImportPlan> {
  const ids = rows.map((r) => r.id).filter((id): id is string => !!id)
  const names = rows.map((r) => r.name)
  const existingById = ids.length
    ? await prisma.rule.findMany({ where: { id: { in: ids } }, select: { id: true } })
    : []
  const existingByName = await prisma.rule.findMany({
    where: { name: { in: names } },
    select: { id: true, name: true },
  })
  const idSet = new Set(existingById.map((r) => r.id))
  const nameMap = new Map(existingByName.map((r) => [r.name, r.id]))

  const entries: ImportPlanEntry[] = rows.map((row, i) => {
    if (row.id && idSet.has(row.id)) {
      return { index: i, name: row.name, action: 'update', match: 'id', existingId: row.id }
    }
    const byName = nameMap.get(row.name)
    if (byName) {
      return { index: i, name: row.name, action: 'update', match: 'name', existingId: byName }
    }
    return { index: i, name: row.name, action: 'create', match: null, existingId: null }
  })

  return { entries }
}

export async function importRules(rows: ImportRow[]): Promise<ImportSummary> {
  const plan = await planImport(rows)

  let created = 0
  let updated = 0
  const errors: ImportSummary['errors'] = []

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const entry = plan.entries[i]
      const data = rowToPrismaData(row)

      try {
        if (entry.action === 'update' && entry.existingId) {
          await tx.rule.update({ where: { id: entry.existingId }, data })
          updated++
        } else {
          await tx.rule.create({ data })
          created++
        }
      } catch (e) {
        errors.push({
          name: row.name,
          message: e instanceof Error ? e.message : 'Unknown error',
        })
      }
    }
  })

  revalidatePath('/admin/rules')
  return { created, updated, errors }
}
