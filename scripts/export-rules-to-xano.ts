import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const rules = await prisma.rule.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
  })

  const exported = rules.map((rule) => ({
    id: rule.id,
    name: rule.name,
    type: rule.type,
    rule_kind: rule.rule_kind,
    keywords: rule.keywords,
    match_mode: rule.match_mode,
    weight_op: rule.weight_op,
    weight_pct: rule.weight_pct === null ? null : rule.weight_pct.toNumber(),
  }))

  process.stdout.write(JSON.stringify(exported, null, 2) + '\n')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
