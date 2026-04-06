import { Prisma } from '@prisma/client'
import { evaluate, type Position } from './rules-engine'
import type { Rule } from '@prisma/client'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRule(overrides: Partial<Rule> & Pick<Rule, 'type' | 'rule_kind' | 'keywords'>): Rule {
  return {
    id: 'rule-1',
    name: 'Test Rule',
    match_mode: 'ANY',
    weight_op: null,
    weight_pct: null,
    description: null,
    active: true,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  }
}

const D = (n: number) => new Prisma.Decimal(n)

// ---------------------------------------------------------------------------
// KEYWORD rules
// ---------------------------------------------------------------------------

describe('KEYWORD rule — ANY match mode', () => {
  const rule = makeRule({
    type: 'HARD_STOP',
    rule_kind: 'KEYWORD',
    keywords: ['LEVERAGED', 'INVERSE'],
  })

  test('triggers on case-insensitive substring match → FAIL', () => {
    const positions: Position[] = [
      { product_name: '2x Leveraged ETF', weight: 5 },
      { product_name: 'S&P 500 Index', weight: 95 },
    ]
    const result = evaluate(positions, [rule])
    expect(result.verdict).toBe('FAIL')
    expect(result.triggered).toHaveLength(1)
    expect(result.triggered[0].matched_keyword).toBe('LEVERAGED')
    expect(result.triggered[0].matched_position).toBe('2x Leveraged ETF')
  })

  test('triggers on second keyword in the list', () => {
    const positions: Position[] = [{ product_name: 'Inverse S&P ETF', weight: 10 }]
    const result = evaluate(positions, [rule])
    expect(result.verdict).toBe('FAIL')
    expect(result.triggered[0].matched_keyword).toBe('INVERSE')
  })

  test('does not trigger when no keyword matches → PASS', () => {
    const positions: Position[] = [
      { product_name: 'S&P 500 Index Fund', weight: 60 },
      { product_name: 'US Treasury Bond', weight: 40 },
    ]
    const result = evaluate(positions, [rule])
    expect(result.verdict).toBe('PASS')
    expect(result.triggered).toHaveLength(0)
  })

  test('triggers for each matching position independently', () => {
    const positions: Position[] = [
      { product_name: '2x Leveraged ETF', weight: 5 },
      { product_name: 'Short Inverse Fund', weight: 5 },
    ]
    const result = evaluate(positions, [rule])
    expect(result.triggered).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// KEYWORD rule — ALL match mode
// ---------------------------------------------------------------------------

describe('KEYWORD rule — ALL match mode', () => {
  const rule = makeRule({
    type: 'HARD_STOP',
    rule_kind: 'KEYWORD',
    keywords: ['PRIVATE', 'EQUITY'],
    match_mode: 'ALL',
  })

  test('triggers only when all keywords are present', () => {
    const positions: Position[] = [{ product_name: 'Private Equity Fund III', weight: 20 }]
    const result = evaluate(positions, [rule])
    expect(result.verdict).toBe('FAIL')
    expect(result.triggered[0].matched_keyword).toBe('PRIVATE, EQUITY')
  })

  test('does not trigger when only one keyword matches', () => {
    const positions: Position[] = [{ product_name: 'Private Credit Fund', weight: 20 }]
    const result = evaluate(positions, [rule])
    expect(result.verdict).toBe('PASS')
    expect(result.triggered).toHaveLength(0)
  })

  test('does not trigger when no keywords match', () => {
    const positions: Position[] = [{ product_name: 'Global Equity Index', weight: 20 }]
    const result = evaluate(positions, [rule])
    expect(result.verdict).toBe('PASS')
  })
})

// ---------------------------------------------------------------------------
// KEYWORD_WEIGHT_THRESHOLD rules
// ---------------------------------------------------------------------------

describe('KEYWORD_WEIGHT_THRESHOLD rule', () => {
  const rule = makeRule({
    type: 'WARNING',
    rule_kind: 'KEYWORD_WEIGHT_THRESHOLD',
    keywords: ['CRYPTO'],
    weight_op: 'GT',
    weight_pct: D(10),
  })

  test('triggers when keyword matches AND weight exceeds threshold → WARN', () => {
    const positions: Position[] = [
      { product_name: 'Crypto Index Fund', weight: 15 },
    ]
    const result = evaluate(positions, [rule])
    expect(result.verdict).toBe('WARN')
    expect(result.triggered).toHaveLength(1)
    expect(result.triggered[0].matched_keyword).toBe('CRYPTO')
  })

  test('does not trigger when keyword matches but weight is at or below threshold → PASS', () => {
    const positions: Position[] = [
      { product_name: 'Crypto Index Fund', weight: 10 },
    ]
    const result = evaluate(positions, [rule])
    expect(result.verdict).toBe('PASS')
    expect(result.triggered).toHaveLength(0)
  })

  test('does not trigger when weight exceeds threshold but keyword does not match', () => {
    const positions: Position[] = [
      { product_name: 'Emerging Markets Equity', weight: 50 },
    ]
    const result = evaluate(positions, [rule])
    expect(result.verdict).toBe('PASS')
  })
})

describe('KEYWORD_WEIGHT_THRESHOLD — all weight operators', () => {
  const base = { type: 'WARNING' as const, rule_kind: 'KEYWORD_WEIGHT_THRESHOLD' as const, keywords: ['BOND'] }

  test('GTE triggers when weight equals threshold', () => {
    const rule = makeRule({ ...base, weight_op: 'GTE', weight_pct: D(20) })
    const result = evaluate([{ product_name: 'Bond Fund', weight: 20 }], [rule])
    expect(result.verdict).toBe('WARN')
  })

  test('LT triggers when weight is below threshold', () => {
    const rule = makeRule({ ...base, weight_op: 'LT', weight_pct: D(5) })
    const result = evaluate([{ product_name: 'Bond Fund', weight: 3 }], [rule])
    expect(result.verdict).toBe('WARN')
  })

  test('LTE triggers when weight equals threshold', () => {
    const rule = makeRule({ ...base, weight_op: 'LTE', weight_pct: D(5) })
    const result = evaluate([{ product_name: 'Bond Fund', weight: 5 }], [rule])
    expect(result.verdict).toBe('WARN')
  })
})

// ---------------------------------------------------------------------------
// Verdict precedence
// ---------------------------------------------------------------------------

describe('verdict precedence', () => {
  test('FAIL beats WARN: one HARD_STOP + one WARNING → FAIL', () => {
    const hardStop = makeRule({
      id: 'r1',
      name: 'Leveraged Stop',
      type: 'HARD_STOP',
      rule_kind: 'KEYWORD',
      keywords: ['LEVERAGED'],
    })
    const warning = makeRule({
      id: 'r2',
      name: 'Crypto Warning',
      type: 'WARNING',
      rule_kind: 'KEYWORD_WEIGHT_THRESHOLD',
      keywords: ['CRYPTO'],
      weight_op: 'GT',
      weight_pct: D(10),
    })
    const positions: Position[] = [
      { product_name: '3x Leveraged ETF', weight: 5 },
      { product_name: 'Crypto Index Fund', weight: 15 },
    ]
    const result = evaluate(positions, [hardStop, warning])
    expect(result.verdict).toBe('FAIL')
    expect(result.triggered).toHaveLength(2)
  })

  test('all warnings → WARN', () => {
    const w1 = makeRule({ id: 'r1', name: 'W1', type: 'WARNING', rule_kind: 'KEYWORD', keywords: ['CRYPTO'] })
    const positions: Position[] = [{ product_name: 'Crypto Fund', weight: 5 }]
    const result = evaluate(positions, [w1])
    expect(result.verdict).toBe('WARN')
  })
})

// ---------------------------------------------------------------------------
// Inactive rules
// ---------------------------------------------------------------------------

describe('inactive rules', () => {
  test('inactive rule is ignored even when it would match', () => {
    const rule = makeRule({
      type: 'HARD_STOP',
      rule_kind: 'KEYWORD',
      keywords: ['LEVERAGED'],
      active: false,
    })
    const positions: Position[] = [{ product_name: '2x Leveraged ETF', weight: 10 }]
    const result = evaluate(positions, [rule])
    expect(result.verdict).toBe('PASS')
    expect(result.triggered).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Summary strings
// ---------------------------------------------------------------------------

describe('summary string', () => {
  test('PASS summary', () => {
    const result = evaluate([], [])
    expect(result.summary).toBe('Portfolio passed all rules.')
  })

  test('FAIL summary mentions the rule name', () => {
    const rule = makeRule({ name: 'Leveraged Stop', type: 'HARD_STOP', rule_kind: 'KEYWORD', keywords: ['LEVERAGED'] })
    const result = evaluate([{ product_name: '2x Leveraged ETF', weight: 5 }], [rule])
    expect(result.summary).toContain('Leveraged Stop')
  })

  test('WARN summary mentions the rule name', () => {
    const rule = makeRule({ name: 'Crypto Warning', type: 'WARNING', rule_kind: 'KEYWORD', keywords: ['CRYPTO'] })
    const result = evaluate([{ product_name: 'Crypto Fund', weight: 5 }], [rule])
    expect(result.summary).toContain('Crypto Warning')
  })
})
