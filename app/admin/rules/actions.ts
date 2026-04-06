'use server'

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

// Plain-object representation safe to pass to client components
export type SerializedRule = {
  id: string
  name: string
  type: 'HARD_STOP' | 'WARNING'
  rule_kind: 'KEYWORD' | 'KEYWORD_WEIGHT_THRESHOLD'
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
  rule_kind: 'KEYWORD' | 'KEYWORD_WEIGHT_THRESHOLD'
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
