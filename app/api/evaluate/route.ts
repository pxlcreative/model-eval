import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { evaluate, type Position } from '@/lib/rules-engine'
import { ok, err, requireApiKey } from '@/lib/api'
import { resolveTickerNames } from '@/lib/ticker-lookup'

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

  // Validate each position — accept ticker-only positions (no product_name)
  const validated: Position[] = []
  const tickerFallbackIndices: number[] = []

  for (let i = 0; i < positions.length; i++) {
    const item = positions[i]
    if (typeof item !== 'object' || item === null) {
      return err(`positions[${i}]: expected an object.`, 400)
    }
    const p = item as Record<string, unknown>
    const hasName = typeof p.product_name === 'string' && (p.product_name as string).trim() !== ''
    const hasTicker = typeof p.ticker === 'string' && (p.ticker as string).trim() !== ''

    if (!hasName && !hasTicker) {
      return err(
        `positions[${i}]: each position must have "product_name" (string) or "ticker" (string).`,
        400,
      )
    }

    const rawWeight = p.weight
    let weight: number
    if (typeof rawWeight === 'number') {
      weight = rawWeight
    } else if (typeof rawWeight === 'string') {
      weight = Number((rawWeight as string).replace(/%/g, '').trim())
      if (isNaN(weight)) {
        return err(`positions[${i}]: "weight" value "${rawWeight}" is not a valid number.`, 400)
      }
    } else {
      return err(`positions[${i}]: "weight" must be a number.`, 400)
    }

    if (!hasName && hasTicker) {
      // Ticker-only position — placeholder until resolved below
      const ticker = (p.ticker as string).trim().toUpperCase()
      validated.push({ product_name: ticker, weight, ticker })
      tickerFallbackIndices.push(i)
    } else {
      validated.push({
        product_name: (p.product_name as string).trim(),
        weight,
        ...(hasTicker ? { ticker: (p.ticker as string).trim() } : {}),
      })
    }
  }

  if (validated.length === 0) {
    return err('"positions" array must not be empty.', 400)
  }

  // Resolve ticker-only positions to fund names
  if (tickerFallbackIndices.length > 0) {
    const ids = tickerFallbackIndices.map((i) => validated[i].ticker as string)
    const resolved = await resolveTickerNames(ids)
    for (const idx of tickerFallbackIndices) {
      const ticker = validated[idx].ticker as string
      const r = resolved.get(ticker)
      if (r && r.source !== 'unresolved') {
        validated[idx] = { ...validated[idx], product_name: r.name }
      }
    }
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
