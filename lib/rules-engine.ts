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
  matched_positions: string[]   // one entry per matching position; multiple for threshold rules
  matched_keyword: string
  total_weight: number          // sum of weights across all matched positions
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

    if (rule.rule_kind === 'KEYWORD') {
      // Each matching position triggers independently.
      for (const position of positions) {
        const matchedKeyword = matchKeywords(rule.keywords, position.product_name, rule.match_mode)
        if (matchedKeyword === null) continue
        triggered.push({
          rule_id: rule.id,
          rule_name: rule.name,
          rule_type: rule.type,
          matched_positions: [position.product_name],
          matched_keyword: matchedKeyword,
          total_weight: position.weight,
        })
      }
    } else {
      // KEYWORD_WEIGHT_THRESHOLD — aggregate weight across ALL matching positions,
      // then compare the total against the threshold.
      if (rule.weight_op === null || rule.weight_pct === null) continue

      type Match = { name: string; keyword: string; weight: number }
      const matches: Match[] = []
      for (const position of positions) {
        const matchedKeyword = matchKeywords(rule.keywords, position.product_name, rule.match_mode)
        if (matchedKeyword !== null) {
          matches.push({ name: position.product_name, keyword: matchedKeyword, weight: position.weight })
        }
      }
      if (matches.length === 0) continue

      const totalWeight = matches.reduce((sum, m) => sum + m.weight, 0)
      const threshold = rule.weight_pct.toNumber()

      if (passesWeightOp(totalWeight, rule.weight_op, threshold)) {
        // Use unique matched keywords for the label (e.g. ANY mode may match different keywords)
        const uniqueKeywords = Array.from(new Set(matches.map((m) => m.keyword)))
        triggered.push({
          rule_id: rule.id,
          rule_name: rule.name,
          rule_type: rule.type,
          matched_positions: matches.map((m) => m.name),
          matched_keyword: uniqueKeywords.join(', '),
          total_weight: totalWeight,
        })
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
  const ruleNames = Array.from(new Set(triggered.map((t) => t.rule_name))).join(', ')
  if (verdict === 'FAIL') return `Portfolio failed: hard stop triggered by ${ruleNames}.`
  return `Portfolio has warnings: ${ruleNames}.`
}
