import { PrismaClient } from '@prisma/client'
import { toXanoRules } from '../lib/xano-export'

const prisma = new PrismaClient()

async function main() {
  const rules = await prisma.rule.findMany()

  const exported = toXanoRules(
    rules.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      rule_kind: r.rule_kind,
      keywords: r.keywords,
      match_mode: r.match_mode,
      weight_op: r.weight_op,
      weight_pct: r.weight_pct === null ? null : r.weight_pct.toNumber(),
      active: r.active,
    })),
  )

  process.stdout.write(JSON.stringify(exported, null, 2) + '\n')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
