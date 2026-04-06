import type { Rule } from '@prisma/client'

export type Position = {
  product_name: string
  ticker?: string
  weight: number
}

export type TriggeredRule = {
  rule_id: string
  rule_name: string
  rule_type: 'HARD_STOP' | 'WARNING'
  matched_position: string
  matched_keyword: string
  position_weight: number
}

export type EvaluationResult = {
  verdict: 'PASS' | 'WARN' | 'FAIL'
  triggered: TriggeredRule[]
  summary: string
}

function matchKeywords(
  keywords: string[],
  productName: string,
  matchMode: 'ANY' | 'ALL',
): string | null {
  const lower = productName.toLowerCase()
  if (matchMode === 'ALL') {
    const allMatch = keywords.every((kw) => lower.includes(kw.toLowerCase()))
    return allMatch ? keywords.join(', ') : null
  }
  // ANY
  return keywords.find((kw) => lower.includes(kw.toLowerCase())) ?? null
}

function passesWeightOp(
  weight: number,
  op: 'GT' | 'GTE' | 'LT' | 'LTE',
  threshold: number,
): boolean {
  switch (op) {
    case 'GT':  return weight > threshold
    case 'GTE': return weight >= threshold
    case 'LT':  return weight < threshold
    case 'LTE': return weight <= threshold
  }
}

export function evaluate(positions: Position[], rules: Rule[]): EvaluationResult {
  const triggered: TriggeredRule[] = []

  for (const rule of rules) {
    if (!rule.active) continue

    for (const position of positions) {
      const matchedKeyword = matchKeywords(
        rule.keywords,
        position.product_name,
        rule.match_mode,
      )
      if (matchedKeyword === null) continue

      if (rule.rule_kind === 'KEYWORD') {
        triggered.push({
          rule_id: rule.id,
          rule_name: rule.name,
          rule_type: rule.type,
          matched_position: position.product_name,
          matched_keyword: matchedKeyword,
          position_weight: position.weight,
        })
        continue
      }

      // KEYWORD_WEIGHT_THRESHOLD — keyword matched; now check weight condition
      if (rule.weight_op !== null && rule.weight_pct !== null) {
        const threshold = rule.weight_pct!.toNumber()
        if (passesWeightOp(position.weight, rule.weight_op!, threshold)) {
          triggered.push({
            rule_id: rule.id,
            rule_name: rule.name,
            rule_type: rule.type,
            matched_position: position.product_name,
            matched_keyword: matchedKeyword,
            position_weight: position.weight,
          })
        }
      }
    }
  }

  const verdict: 'PASS' | 'WARN' | 'FAIL' = triggered.some(
    (t) => t.rule_type === 'HARD_STOP',
  )
    ? 'FAIL'
    : triggered.length > 0
      ? 'WARN'
      : 'PASS'

  const summary = buildSummary(verdict, triggered)
  return { verdict, triggered, summary }
}

function buildSummary(
  verdict: 'PASS' | 'WARN' | 'FAIL',
  triggered: TriggeredRule[],
): string {
  if (triggered.length === 0) return 'Portfolio passed all rules.'
  const ruleNames = [...new Set(triggered.map((t) => t.rule_name))].join(', ')
  if (verdict === 'FAIL') return `Portfolio failed: hard stop triggered by ${ruleNames}.`
  return `Portfolio has warnings: ${ruleNames}.`
}
