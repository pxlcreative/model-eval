import { PrismaClient } from '@prisma/client'
import { serializeRulesJSON, XANO_DEFAULT_FIELDS, type FullRule } from '../lib/rules-io'

const prisma = new PrismaClient()

async function main() {
  const rules = await prisma.rule.findMany()

  const full: FullRule[] = rules.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    rule_kind: r.rule_kind,
    keywords: r.keywords,
    match_mode: r.match_mode,
    weight_op: r.weight_op,
    weight_pct: r.weight_pct === null ? null : r.weight_pct.toNumber(),
    description: r.description,
    active: r.active,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
  }))

  process.stdout.write(serializeRulesJSON(full, XANO_DEFAULT_FIELDS, { activeOnly: true }))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
