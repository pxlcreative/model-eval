import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  await prisma.rule.upsert({
    where: { name: 'Leveraged/Inverse Hard Stop' },
    update: {},
    create: {
      name: 'Leveraged/Inverse Hard Stop',
      type: 'HARD_STOP',
      rule_kind: 'KEYWORD',
      keywords: ['LEVERAGED', 'INVERSE'],
      match_mode: 'ANY',
      description: 'Hard stop on any leveraged or inverse products.',
    },
  })

  await prisma.rule.upsert({
    where: { name: 'Crypto Weight Warning' },
    update: {},
    create: {
      name: 'Crypto Weight Warning',
      type: 'WARNING',
      rule_kind: 'KEYWORD_WEIGHT_THRESHOLD',
      keywords: ['CRYPTO'],
      match_mode: 'ANY',
      weight_op: 'GT',
      weight_pct: 10,
      description: 'Warning when crypto allocation exceeds 10%.',
    },
  })

  await prisma.rule.upsert({
    where: { name: 'Private Equity Hard Stop' },
    update: {},
    create: {
      name: 'Private Equity Hard Stop',
      type: 'HARD_STOP',
      rule_kind: 'KEYWORD',
      keywords: ['PRIVATE EQUITY'],
      match_mode: 'ANY',
      description: 'Hard stop on private equity positions.',
    },
  })

  console.log('Seed complete.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
