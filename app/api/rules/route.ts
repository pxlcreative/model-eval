import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ok, err, requireApiKey } from '@/lib/api'

const RULE_TYPES = ['HARD_STOP', 'WARNING'] as const
const RULE_KINDS = ['KEYWORD', 'KEYWORD_WEIGHT_THRESHOLD'] as const
const MATCH_MODES = ['ANY', 'ALL'] as const
const WEIGHT_OPS = ['GT', 'GTE', 'LT', 'LTE'] as const

type RuleType = (typeof RULE_TYPES)[number]
type RuleKind = (typeof RULE_KINDS)[number]
type MatchMode = (typeof MATCH_MODES)[number]
type WeightOp = (typeof WEIGHT_OPS)[number]

function isRuleType(v: unknown): v is RuleType {
  return RULE_TYPES.includes(v as RuleType)
}
function isRuleKind(v: unknown): v is RuleKind {
  return RULE_KINDS.includes(v as RuleKind)
}
function isMatchMode(v: unknown): v is MatchMode {
  return MATCH_MODES.includes(v as MatchMode)
}
function isWeightOp(v: unknown): v is WeightOp {
  return WEIGHT_OPS.includes(v as WeightOp)
}

function validateRuleBody(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return 'Request body must be a JSON object.'
  const b = body as Record<string, unknown>

  if (typeof b.name !== 'string' || !b.name.trim()) return '"name" must be a non-empty string.'
  if (!isRuleType(b.type)) return `"type" must be one of: ${RULE_TYPES.join(', ')}.`
  if (!isRuleKind(b.rule_kind)) return `"rule_kind" must be one of: ${RULE_KINDS.join(', ')}.`
  if (!Array.isArray(b.keywords) || b.keywords.length === 0 || b.keywords.some((k) => typeof k !== 'string'))
    return '"keywords" must be a non-empty array of strings.'
  if (b.match_mode !== undefined && !isMatchMode(b.match_mode))
    return `"match_mode" must be one of: ${MATCH_MODES.join(', ')}.`

  if (b.rule_kind === 'KEYWORD_WEIGHT_THRESHOLD') {
    if (!isWeightOp(b.weight_op))
      return `"weight_op" is required for KEYWORD_WEIGHT_THRESHOLD and must be one of: ${WEIGHT_OPS.join(', ')}.`
    if (typeof b.weight_pct !== 'number' || isNaN(b.weight_pct))
      return '"weight_pct" is required for KEYWORD_WEIGHT_THRESHOLD and must be a number.'
  }

  return null
}

export async function GET(request: NextRequest) {
  const authError = requireApiKey(request)
  if (authError) return authError

  try {
    const rules = await prisma.rule.findMany({ orderBy: { created_at: 'desc' } })
    return ok(rules)
  } catch (e) {
    console.error('[GET /api/rules]', e)
    return err('Internal server error.', 500)
  }
}

export async function POST(request: NextRequest) {
  const authError = requireApiKey(request)
  if (authError) return authError

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return err('Request body must be valid JSON.', 400)
  }

  const validationError = validateRuleBody(body)
  if (validationError) return err(validationError, 400)

  const b = body as Record<string, unknown>

  try {
    const rule = await prisma.rule.create({
      data: {
        name: (b.name as string).trim(),
        type: b.type as RuleType,
        rule_kind: b.rule_kind as RuleKind,
        keywords: b.keywords as string[],
        match_mode: (b.match_mode as MatchMode | undefined) ?? 'ANY',
        weight_op: b.weight_op ? (b.weight_op as WeightOp) : null,
        weight_pct:
          typeof b.weight_pct === 'number'
            ? new Prisma.Decimal(b.weight_pct)
            : null,
        description: typeof b.description === 'string' ? b.description : null,
      },
    })
    return ok(rule, 201)
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return err(`A rule named "${(b.name as string).trim()}" already exists.`, 400)
    }
    console.error('[POST /api/rules]', e)
    return err('Internal server error.', 500)
  }
}
