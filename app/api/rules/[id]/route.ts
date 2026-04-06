import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ok, err, requireApiKey } from '@/lib/api'

const WEIGHT_OPS = ['GT', 'GTE', 'LT', 'LTE'] as const
type WeightOp = (typeof WEIGHT_OPS)[number]
function isWeightOp(v: unknown): v is WeightOp {
  return WEIGHT_OPS.includes(v as WeightOp)
}

type Params = { params: Promise<{ id: string }> }

export async function PUT(request: NextRequest, { params }: Params) {
  const authError = requireApiKey(request)
  if (authError) return authError

  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return err('Request body must be valid JSON.', 400)
  }

  if (typeof body !== 'object' || body === null) {
    return err('Request body must be a JSON object.', 400)
  }

  const b = body as Record<string, unknown>

  // Build a partial update — only include fields that were sent
  const data: Prisma.RuleUpdateInput = {}

  if ('name' in b) {
    if (typeof b.name !== 'string' || !b.name.trim())
      return err('"name" must be a non-empty string.', 400)
    data.name = b.name.trim()
  }
  if ('type' in b) {
    if (b.type !== 'HARD_STOP' && b.type !== 'WARNING')
      return err('"type" must be HARD_STOP or WARNING.', 400)
    data.type = b.type
  }
  if ('rule_kind' in b) {
    if (b.rule_kind !== 'KEYWORD' && b.rule_kind !== 'KEYWORD_WEIGHT_THRESHOLD')
      return err('"rule_kind" must be KEYWORD or KEYWORD_WEIGHT_THRESHOLD.', 400)
    data.rule_kind = b.rule_kind
  }
  if ('keywords' in b) {
    if (!Array.isArray(b.keywords) || b.keywords.length === 0 || b.keywords.some((k) => typeof k !== 'string'))
      return err('"keywords" must be a non-empty array of strings.', 400)
    data.keywords = b.keywords as string[]
  }
  if ('match_mode' in b) {
    if (b.match_mode !== 'ANY' && b.match_mode !== 'ALL')
      return err('"match_mode" must be ANY or ALL.', 400)
    data.match_mode = b.match_mode
  }
  if ('weight_op' in b) {
    if (b.weight_op !== null && !isWeightOp(b.weight_op))
      return err('"weight_op" must be GT, GTE, LT, LTE, or null.', 400)
    data.weight_op = b.weight_op ? (b.weight_op as WeightOp) : null
  }
  if ('weight_pct' in b) {
    if (b.weight_pct !== null && (typeof b.weight_pct !== 'number' || isNaN(b.weight_pct)))
      return err('"weight_pct" must be a number or null.', 400)
    data.weight_pct =
      typeof b.weight_pct === 'number' ? new Prisma.Decimal(b.weight_pct) : null
  }
  if ('description' in b) {
    data.description = typeof b.description === 'string' ? b.description : null
  }
  if ('active' in b) {
    if (typeof b.active !== 'boolean')
      return err('"active" must be a boolean.', 400)
    data.active = b.active
  }

  if (Object.keys(data).length === 0) {
    return err('Request body contains no updatable fields.', 400)
  }

  try {
    const rule = await prisma.rule.update({ where: { id }, data })
    return ok(rule)
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2025') return err(`Rule "${id}" not found.`, 404)
      if (e.code === 'P2002') return err('A rule with that name already exists.', 400)
    }
    console.error('[PUT /api/rules/:id]', e)
    return err('Internal server error.', 500)
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const authError = requireApiKey(request)
  if (authError) return authError

  const { id } = await params

  try {
    const rule = await prisma.rule.update({
      where: { id },
      data: { active: false },
    })
    return ok(rule)
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return err(`Rule "${id}" not found.`, 404)
    }
    console.error('[DELETE /api/rules/:id]', e)
    return err('Internal server error.', 500)
  }
}
