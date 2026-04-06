import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { evaluate, type Position } from '@/lib/rules-engine'
import { ok, err, requireApiKey } from '@/lib/api'

export async function POST(request: NextRequest) {
  const authError = requireApiKey(request)
  if (authError) return authError

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return err('Request body must be valid JSON.', 400)
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('positions' in body) ||
    !Array.isArray((body as Record<string, unknown>).positions)
  ) {
    return err('Request body must include a "positions" array.', 400)
  }

  const { positions, portfolio_name } = body as {
    positions: unknown[]
    portfolio_name?: unknown
  }

  // Validate each position
  const validated: Position[] = []
  for (let i = 0; i < positions.length; i++) {
    const item = positions[i]
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof (item as Record<string, unknown>).product_name !== 'string' ||
      typeof (item as Record<string, unknown>).weight !== 'number'
    ) {
      return err(
        `positions[${i}]: each position must have "product_name" (string) and "weight" (number).`,
        400,
      )
    }
    const p = item as Record<string, unknown>
    validated.push({
      product_name: p.product_name as string,
      weight: p.weight as number,
      ...(typeof p.ticker === 'string' ? { ticker: p.ticker } : {}),
    })
  }

  if (validated.length === 0) {
    return err('"positions" array must not be empty.', 400)
  }

  const portfolioName =
    typeof portfolio_name === 'string' && portfolio_name.trim()
      ? portfolio_name.trim()
      : null

  try {
    const rules = await prisma.rule.findMany({ where: { active: true } })
    const result = evaluate(validated, rules)

    const log = await prisma.evaluationLog.create({
      data: {
        source: 'API',
        portfolio_name: portfolioName,
        positions: validated,
        result: result.verdict,
        triggered_rules: result.triggered,
      },
    })

    return ok({
      log_id: log.id,
      verdict: result.verdict,
      triggered: result.triggered,
      summary: result.summary,
    })
  } catch (e) {
    console.error('[POST /api/evaluate]', e)
    return err('Internal server error.', 500)
  }
}
