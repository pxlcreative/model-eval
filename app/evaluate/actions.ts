'use server'

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { evaluate, type Position, type TriggeredRule } from '@/lib/rules-engine'

export type EvalActionResult = {
  log_id: string
  verdict: 'PASS' | 'WARN' | 'FAIL'
  triggered: TriggeredRule[]
  summary: string
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
