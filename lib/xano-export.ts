export type XanoRule = {
  id: string
  name: string
  type: 'HARD_STOP' | 'WARNING'
  rule_kind: 'KEYWORD' | 'KEYWORD_WEIGHT_THRESHOLD'
  keywords: string[]
  match_mode: 'ANY' | 'ALL'
  weight_op: 'GT' | 'GTE' | 'LT' | 'LTE' | null
  weight_pct: number | null
}

type RuleInput = XanoRule & { active: boolean }

export function toXanoRules(rules: RuleInput[]): XanoRule[] {
  return rules
    .filter((r) => r.active)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ active: _active, ...rest }) => rest)
}
