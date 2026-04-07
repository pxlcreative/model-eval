'use server'

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { evaluate, type Position, type TriggeredRule } from '@/lib/rules-engine'
import { resolveTickerNames } from '@/lib/ticker-lookup'

export type EvalActionResult = {
  log_id: string
  verdict: 'PASS' | 'WARN' | 'FAIL'
  triggered: TriggeredRule[]
  summary: string
}

export type ResolveResult =
  | { ok: true; positions: Position[]; resolvedCount: number }
  | { ok: false; error: string }

export async function resolvePositionNames(positions: Position[]): Promise<ResolveResult> {
  const tickersToResolve = positions
    .filter((p) => p.ticker && p.product_name === p.ticker.toUpperCase())
    .map((p) => p.ticker!)

  if (tickersToResolve.length === 0) {
    return { ok: true, positions, resolvedCount: 0 }
  }

  const nameMap = await resolveTickerNames(tickersToResolve)

  const unresolved = tickersToResolve.filter((t) => nameMap.get(t)?.source === 'unresolved')
  if (unresolved.length > 0) {
    return {
      ok: false,
      error:
        `Could not resolve fund names for: ${unresolved.join(', ')}. ` +
        `The name lookup service may be unavailable or rate-limited. ` +
        `Please use a file with a product name column instead of ticker-only.`,
    }
  }

  let resolvedCount = 0
  const enriched = positions.map((p) => {
    if (!p.ticker) return p
    const resolved = nameMap.get(p.ticker.toUpperCase())
    if (resolved && resolved.source !== 'unresolved') {
      resolvedCount++
      return { ...p, product_name: resolved.name }
    }
    return p
  })

  return { ok: true, positions: enriched, resolvedCount }
}

export async function runEvaluation(
  positions: Position[],
  portfolioName: string | null,
): Promise<EvalActionResult> {
  const rules = await prisma.rule.findMany({ where: { active: true } })
  const result = evaluate(positions, rules)

  const log = await prisma.evaluationLog.create({
    data: {
      source: 'UI',
      portfolio_name: portfolioName,
      positions: positions as unknown as Prisma.InputJsonValue,
      result: result.verdict,
      triggered_rules: result.triggered as unknown as Prisma.InputJsonValue,
    },
  })

  return {
    log_id: log.id,
    verdict: result.verdict,
    triggered: result.triggered,
    summary: result.summary,
  }
}

export type HistoryEntry = {
  id: string
  source: 'UI' | 'API'
  portfolio_name: string | null
  result: 'PASS' | 'WARN' | 'FAIL'
  triggered_count: number
  evaluated_at: string
}

export async function getHistory(): Promise<HistoryEntry[]> {
  const logs = await prisma.evaluationLog.findMany({
    orderBy: { evaluated_at: 'desc' },
    take: 20,
  })
  return logs.map((log) => ({
    id: log.id,
    source: log.source,
    portfolio_name: log.portfolio_name,
    result: log.result,
    triggered_count: Array.isArray(log.triggered_rules)
      ? log.triggered_rules.length
      : 0,
    evaluated_at: log.evaluated_at.toISOString(),
  }))
}
