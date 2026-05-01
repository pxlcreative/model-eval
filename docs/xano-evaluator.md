# Xano Evaluator — External Endpoint

A standalone Xano endpoint that mirrors `POST /api/evaluate` from this repo, intended
for external model-database integrations. The Xano endpoint **uses no Xano database**:
its rule set is a hard-coded constant inside the function stack, kept in sync with the
Postgres rules in this app via the `Import / Export` panel on `/admin/rules` (or the
`npm run export:xano-rules` CLI).

The existing Next.js app, Postgres, admin UI, and `/api/evaluate` are untouched.

---

## Sync workflow

After any change to rules in `/admin/rules`:

1. Open the **Import / Export** panel on `/admin/rules`.
2. On the **Export** tab, click **Xano paste defaults** (selects the right fields,
   JSON format, active-only). Equivalent CLI: `npm run export:xano-rules`.
3. Click **Copy**.
4. In the Xano UI, open `model-eval / POST /evaluate`. Edit the `rules` variable in the
   function stack, paste, save, redeploy.

Soft-deleted rules (`active = false`) are excluded automatically by the Xano paste
preset. The export is idempotent.

For full backups (cross-machine sync, version control), use the **Full backup** preset
on the same panel — JSON or CSV, all fields including `active` and `description`,
re-importable via the **Import** tab. Imports match existing rules by `id` if present,
otherwise by `name`; rules absent from the file are left untouched.

---

## Endpoint contract

`POST {xano-base}/api:model-eval/evaluate` · public (no auth).

### Request body

```jsonc
{
  "portfolio_name": "string (optional)",
  "positions": [
    { "product_name": "string?", "ticker": "string?", "weight": "number|string" }
  ]
}
```

Either `product_name` or `ticker` must be present on every position. `weight` may be a
number or a string with a trailing `%`, on a 0–100 scale. Positions with only a
`ticker` are resolved to a name via OpenFIGI; unresolved tickers keep the uppercase
ticker as their `product_name`.

### Response (200)

```jsonc
{
  "data": {
    "verdict": "PASS" | "WARN" | "FAIL",
    "triggered": [
      {
        "rule_id": "uuid",
        "rule_name": "string",
        "rule_type": "HARD_STOP" | "WARNING",
        "matched_positions": ["string", ...],
        "matched_keyword": "string",
        "total_weight": 12.34
      }
    ],
    "summary": "string"
  }
}
```

### Verdict logic

- Any triggered rule with `rule_type = HARD_STOP` → `FAIL`
- Else any triggered → `WARN`
- Else → `PASS`

### Summary strings (must match `lib/rules-engine.ts:116-124` exactly)

- No triggers: `"Portfolio passed all rules."`
- FAIL: `` `Portfolio failed: hard stop triggered by ${ruleNames}.` ``
- WARN: `` `Portfolio has warnings: ${ruleNames}.` ``

`ruleNames` is the de-duplicated, comma-joined list of triggered rule names.

---

## XanoScript source

Two artifacts: one **custom function** (`utilities/match_text`) and one **API
endpoint** (`model_eval/evaluate`). The helper takes a `match_type` input
(`"keyword"` or `"regex"`) and dispatches internally — so the four `RuleKind`
values (`KEYWORD`, `KEYWORD_WEIGHT_THRESHOLD`, `REGEX`, `REGEX_WEIGHT_THRESHOLD`)
collapse into two code paths: simple per-position trigger vs. aggregated weight
threshold. Push both via the Metadata API
(`POST /workspace/{workspace_id}/multidoc`, `Content-Type: text/x-xanoscript`) or paste
each into the XanoScript editor in the Xano UI.

### Regex compatibility note

JavaScript regex (used by the Next.js engine) and Xano's PCRE-style `regex_match`
are mostly compatible for everyday patterns: character classes (`[a-z]`, `\d`,
`\w`, `\s`), anchors (`\b`, `^`, `$`), quantifiers (`*`, `+`, `?`, `{n,m}`),
alternation, basic groups, lookahead/lookbehind. Avoid named groups
(`(?<name>...)`) and Unicode property escapes (`\p{L}`) — flavor-specific.
Both engines apply the case-insensitive flag implicitly here, so don't
prefix your patterns with `(?i)` (no harm, just redundant).

### Caveats before pasting

XanoScript has a few corners where the public docs are thin or self-inconsistent.
Where I have low certainty, I've marked the line with `// VERIFY:` so it's easy to
spot. Most likely tweaks:

- **Loop iteration alias prefixing.** Docs show both `each as user { … user.name }`
  (no `$`) and `each as index { … $index … }` (with `$`). If your Xano version
  rejects one form, swap to the other.
- **`return` for early exit / non-200.** XanoScript's idiomatic way to send a 4xx
  varies. The skeleton uses an `error` step pattern; if your workspace prefers
  preconditions or `response.error`, adapt accordingly.
- **Filter names.** `icontains`, `to_lower`, `to_upper`, `count`, `sum`, `unique`,
  `implode`, `replace`, `regex_match`, `regex_match_first`, `to_number`, `concat`,
  `map` are all documented Xano filters. `regex_match_first` (returns the first
  matched substring or null) is the regex equivalent of `icontains` for our
  purposes. If your workspace exposes it under a different name (`regex_search`,
  `regex_extract`), swap accordingly. The exact pipe arity
  (`|map:"$this.weight"` vs `|map:$this.weight`) sometimes varies — adjust if a
  filter complains.
- **Object construction in `response`.** Some workspaces require
  `response { value = { … } }`; others accept `response = { … }` inline. Either
  should work.

### 1. Custom function — `utilities/match_text`

Mirrors `matchKeywords` and `matchPatterns` in `lib/rules-engine.ts`. Takes a
`match_type` of `"keyword"` (case-insensitive substring via `icontains`) or
`"regex"` (PCRE via `regex_match`) and applies `ANY` / `ALL` semantics. For
keyword matches the result is the keyword that hit; for regex it's the actual
matched substring. Returns `null` when no match.

```xs
function utilities/match_text {
  description = "Case-insensitive keyword OR regex match. Returns the matched substring/keyword, or null. Mirrors matchKeywords + matchPatterns in lib/rules-engine.ts."

  input {
    json keywords            // For "keyword" mode: substrings. For "regex": patterns.
    text product_name
    text match_mode          // "ANY" | "ALL"
    text match_type          // "keyword" | "regex"
  }

  stack {
    var $matched {
      value = null
    }

    conditional {
      if (`$input.match_mode == "ALL"`) {
        var $all_match {
          value = true
        }
        var $all_hits {
          value = []
        }
        foreach ($input.keywords) {
          each as kw {
            // For regex mode, capture the actual matched substring; for keyword,
            // the keyword IS the substring. `regex_match_first` is Xano's
            // pattern-find filter (returns the first match string or null).
            // VERIFY: filter name in your workspace — may be `regex_match` or
            // `regex_search` depending on Xano version.
            var $hit {
              value = ($input.match_type == "regex")
                ? ($input.product_name|regex_match_first:$kw)
                : (($input.product_name|icontains:$kw) ? $kw : null)
            }
            conditional {
              if (`$hit == null`) {
                var.update $all_match {
                  value = false
                }
                break
              }
              else {
                array.push $all_hits {
                  value = $hit
                }
              }
            }
          }
        }
        conditional {
          if (`$all_match == true`) {
            var.update $matched {
              value = $all_hits|implode:", "
            }
          }
        }
      }
      else {
        // ANY mode
        foreach ($input.keywords) {
          each as kw {
            var $hit {
              value = ($input.match_type == "regex")
                ? ($input.product_name|regex_match_first:$kw)
                : (($input.product_name|icontains:$kw) ? $kw : null)
            }
            conditional {
              if (`$hit != null`) {
                var.update $matched {
                  value = $hit
                }
                break
              }
            }
          }
        }
      }
    }
  }

  response = $matched
}
```

### 2. API endpoint — `model_eval/evaluate`

Replace the `value = []` of `$rules` (step **2**) with the JSON from
`npm run export:xano-rules` (or the `/admin/rules` *Xano export* panel). Wrap the
JSON in `"…"|json_decode` so XanoScript parses it as a literal value.

```xs
query model_eval/evaluate verb=POST {
  description = "Stateless portfolio rules evaluator. Mirrors POST /api/evaluate in the Next.js app."

  input {
    text portfolio_name?
    json positions
  }

  stack {

    // ── 1. Validate positions non-empty ─────────────────────────────────
    conditional {
      if (`($input.positions|count) == 0`) {
        // VERIFY: workspace-specific syntax for "return early with 400".
        // If `precondition` style is preferred, swap this block out.
        var $err {
          value = {error: "positions must be a non-empty array"}
        }
        return $err
      }
    }

    // ── 2. Hard-coded rules. Replace the empty array with the JSON from
    //      `npm run export:xano-rules` (or the /admin/rules Xano export panel).
    var $rules {
      value = "[]"|json_decode
    }

    // ── 3. Triggered accumulator ────────────────────────────────────────
    var $triggered {
      value = []
    }

    // ── 4. Normalize positions: coerce weights and derive product_name
    //      from ticker when missing. Tag _ticker_fallback for step 5.
    var $positions {
      value = []
    }
    foreach ($input.positions) {
      each as raw {
        // Coerce weight (number or "12.34%")
        var $w {
          value = $raw.weight
        }
        conditional {
          if (`($w|typeof) == "string"`) {
            var.update $w {
              value = ($w|replace:"%":"")|to_number   // VERIFY: filter name
            }
          }
        }

        // Derive product_name from ticker if missing
        var $name {
          value = $raw.product_name
        }
        var $ticker_fallback {
          value = false
        }
        conditional {
          if (`$name == null || $name == ""`) {
            conditional {
              if (`$raw.ticker != null && $raw.ticker != ""`) {
                var.update $name {
                  value = $raw.ticker|to_upper
                }
                var.update $ticker_fallback {
                  value = true
                }
              }
              else {
                // Both missing — invalid. Fail fast.
                var $err {
                  value = {error: "each position must include product_name or ticker"}
                }
                return $err
              }
            }
          }
        }

        array.push $positions {
          value = {
            product_name: $name,
            ticker: $raw.ticker,
            weight: $w,
            _ticker_fallback: $ticker_fallback
          }
        }
      }
    }

    // ── 5. Build tickerFallbackPositions (positions where the name was inferred) ─
    array.filter ($positions) if (`$this._ticker_fallback == true`) as $tickerFallbackPositions

    // ── 6. OpenFIGI resolution. Single batch — capped at 10 ids
    //      (the unauthenticated batch limit; see lib/ticker-lookup.ts).
    //      For larger ticker-only portfolios extend with chunking.
    conditional {
      if (`($tickerFallbackPositions|count) > 0`) {
        var $figi_body {
          value = []
        }
        foreach ($tickerFallbackPositions) {
          each as p {
            var $idType {
              value = "TICKER"
            }
            // CUSIPs are 9 alphanumeric chars
            conditional {
              if (`$p.ticker|regex_match:"^[A-Z0-9]{9}$"`) {   // VERIFY: filter name
                var.update $idType {
                  value = "ID_CUSIP"
                }
              }
            }
            array.push $figi_body {
              value = {idType: $idType, idValue: $p.ticker, exchCode: "US"}
            }
          }
        }

        api.request {
          url = "https://api.openfigi.com/v3/mapping"
          method = "POST"
          params = $figi_body
          headers = []|array_push:"Content-Type: application/json"
          timeout = 6
        } as $figi_response

        // Map figi_response back onto $positions by ticker.
        // Response shape: [{ data: [{ name }] }, ...] aligned with the request order.
        var $i {
          value = 0
        }
        foreach ($tickerFallbackPositions) {
          each as p {
            // VERIFY: how the API response body is exposed — usually
            //   $figi_response.response.result  or  $figi_response.body
            var $resolved {
              value = $figi_response.response.result[$i].data[0].name
            }
            conditional {
              if (`$resolved != null && $resolved != ""`) {
                array.map ($positions) as $positions {
                  value = ($this.ticker == $p.ticker) ? ({...$this, product_name: $resolved}) : $this   // VERIFY: object spread support
                }
              }
            }
            var.update $i {
              value = $i + 1
            }
          }
        }
      }
    }

    // ── 7. Evaluate every rule.
    //      Two axes derived from rule_kind:
    //        - $match_type: "regex" if rule_kind contains "REGEX", else "keyword"
    //        - $is_threshold: true if rule_kind ends in "_WEIGHT_THRESHOLD"
    //      The same body runs for all four kinds; only the helper input changes.
    foreach ($rules) {
      each as rule {
        var $match_type {
          value = ($rule.rule_kind|icontains:"REGEX") ? "regex" : "keyword"
        }
        var $is_threshold {
          value = ($rule.rule_kind|icontains:"WEIGHT_THRESHOLD") ? true : false
        }

        conditional {
          if (`$is_threshold == false`) {
            // Per-position trigger (KEYWORD or REGEX).
            foreach ($positions) {
              each as pos {
                function.run utilities/match_text {
                  input = {
                    keywords: $rule.keywords,
                    product_name: $pos.product_name,
                    match_mode: $rule.match_mode,
                    match_type: $match_type
                  }
                } as $hit
                conditional {
                  if (`$hit != null`) {
                    array.push $triggered {
                      value = {
                        rule_id: $rule.id,
                        rule_name: $rule.name,
                        rule_type: $rule.type,
                        matched_positions: [$pos.product_name],
                        matched_keyword: $hit,
                        total_weight: $pos.weight
                      }
                    }
                  }
                }
              }
            }
          }
          else {
            // Aggregated weight threshold (KEYWORD_WEIGHT_THRESHOLD or REGEX_WEIGHT_THRESHOLD).
            var $matches {
              value = []
            }
            foreach ($positions) {
              each as pos {
                function.run utilities/match_text {
                  input = {
                    keywords: $rule.keywords,
                    product_name: $pos.product_name,
                    match_mode: $rule.match_mode,
                    match_type: $match_type
                  }
                } as $hit
                conditional {
                  if (`$hit != null`) {
                    array.push $matches {
                      value = {
                        name: $pos.product_name,
                        keyword: $hit,
                        weight: $pos.weight
                      }
                    }
                  }
                }
              }
            }

            conditional {
              if (`($matches|count) > 0`) {
                var $totalWeight {
                  value = $matches|map:"$this.weight"|sum
                }
                var $threshold {
                  value = $rule.weight_pct
                }
                var $passes {
                  value = false
                }
                switch ($rule.weight_op) {
                  case ("GT")  { var.update $passes { value = `$totalWeight >  $threshold` } } break
                  case ("GTE") { var.update $passes { value = `$totalWeight >= $threshold` } } break
                  case ("LT")  { var.update $passes { value = `$totalWeight <  $threshold` } } break
                  case ("LTE") { var.update $passes { value = `$totalWeight <= $threshold` } } break
                  default {}
                }
                conditional {
                  if (`$passes == true`) {
                    var $kwLabel {
                      value = $matches|map:"$this.keyword"|unique|implode:", "
                    }
                    array.push $triggered {
                      value = {
                        rule_id: $rule.id,
                        rule_name: $rule.name,
                        rule_type: $rule.type,
                        matched_positions: $matches|map:"$this.name",
                        matched_keyword: $kwLabel,
                        total_weight: $totalWeight
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // ── 8. Verdict ──────────────────────────────────────────────────────
    array.has ($triggered) if (`$this.rule_type == "HARD_STOP"`) as $hasHardStop
    var $verdict {
      value = "PASS"
    }
    conditional {
      if (`$hasHardStop == true`) {
        var.update $verdict {
          value = "FAIL"
        }
      }
      elseif (`($triggered|count) > 0`) {
        var.update $verdict {
          value = "WARN"
        }
      }
    }

    // ── 9. Summary (must match lib/rules-engine.ts:116-124) ─────────────
    var $summary {
      value = "Portfolio passed all rules."
    }
    conditional {
      if (`($triggered|count) > 0`) {
        var $names {
          value = $triggered|map:"$this.rule_name"|unique|implode:", "
        }
        conditional {
          if (`$verdict == "FAIL"`) {
            var.update $summary {
              value = "Portfolio failed: hard stop triggered by "|concat:$names:"."
            }
          }
          else {
            var.update $summary {
              value = "Portfolio has warnings: "|concat:$names:"."
            }
          }
        }
      }
    }
  }

  response = {
    data: {
      verdict: $verdict,
      triggered: $triggered,
      summary: $summary
    }
  }
}
```

### Pushing both via the Metadata API

If you'd rather not paste in the UI, push both as a single multidoc:

```bash
curl -X POST \
  "https://{instance}.xano.io/api:meta/workspace/{workspace_id}/multidoc" \
  -H "Authorization: Bearer $XANO_TOKEN" \
  -H "Content-Type: text/x-xanoscript" \
  --data-binary @xano-evaluator.xs
```

Where `xano-evaluator.xs` concatenates the two blocks above (function first, then
endpoint). See <https://docs.xano.com/api-reference/xanoscript/push-xanoscript-multidoc>.

---

## Sample exported JSON

Output of `npm run export:xano-rules` against the freshly seeded DB (UUIDs will differ):

```json
[
  {
    "id": "<uuid>",
    "name": "Crypto Weight Warning",
    "type": "WARNING",
    "rule_kind": "KEYWORD_WEIGHT_THRESHOLD",
    "keywords": ["CRYPTO"],
    "match_mode": "ANY",
    "weight_op": "GT",
    "weight_pct": 10
  },
  {
    "id": "<uuid>",
    "name": "Leveraged/Inverse Hard Stop",
    "type": "HARD_STOP",
    "rule_kind": "KEYWORD",
    "keywords": ["LEVERAGED", "INVERSE"],
    "match_mode": "ANY",
    "weight_op": null,
    "weight_pct": null
  },
  {
    "id": "<uuid>",
    "name": "Private Equity Hard Stop",
    "type": "HARD_STOP",
    "rule_kind": "KEYWORD",
    "keywords": ["PRIVATE EQUITY"],
    "match_mode": "ANY",
    "weight_op": null,
    "weight_pct": null
  }
]
```
