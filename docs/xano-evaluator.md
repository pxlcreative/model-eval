# Xano Evaluator — External Endpoint

A standalone Xano endpoint that mirrors `POST /api/evaluate` from this repo, intended
for external model-database integrations. The Xano endpoint **uses no Xano database**:
its rule set is a hard-coded constant inside the function stack, kept in sync with the
Postgres rules in this app via the `npm run export:xano-rules` tool.

The existing Next.js app, Postgres, admin UI, and `/api/evaluate` are untouched. Both
endpoints can run side by side.

---

## Sync workflow

After any change to rules in `/admin/rules`:

1. From repo root: `npm run export:xano-rules`
2. Copy the printed JSON.
3. In the Xano UI, open `model-eval / POST /evaluate`. Edit the `rules` variable in the
   function stack, paste, save, redeploy.

Soft-deleted rules (`active = false`) are excluded automatically. The export is
idempotent — re-running without rule changes yields identical output.

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
`ticker` are resolved to a name via OpenFIGI (see step 6 below); unresolved tickers
keep the uppercase ticker as their `product_name`.

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

There is no `log_id` — this endpoint does not persist evaluations. Errors return
`400 { "error": "..." }` for validation failures and `500` for upstream/internal errors.

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

## Function stack (one-time setup in Xano UI)

Mirrors `lib/rules-engine.ts:1-125`, weight normalization from `lib/parsers.ts`, and
OpenFIGI batching from `lib/ticker-lookup.ts:1-109`.

1. **Precondition** — `positions` is a non-empty array. Otherwise return
   `400 { "error": "positions must be a non-empty array" }`.

2. **Create Variable `rules`** — paste the output of `npm run export:xano-rules`.
   This is the hard-coded rule set. Each item has the shape:
   ```jsonc
   {
     "id": "<uuid>",
     "name": "Leveraged/Inverse Hard Stop",
     "type": "HARD_STOP",
     "rule_kind": "KEYWORD",
     "keywords": ["LEVERAGED", "INVERSE"],
     "match_mode": "ANY",
     "weight_op": null,
     "weight_pct": null
   }
   ```

3. **Create Variable `triggered = []`.**

4. **Normalize positions** — For Each `positions` → `pos`:
   - If `pos.weight` is a string, strip `%` and coerce to number. Non-numeric → 400.
   - Require `product_name` or `ticker`. If only `ticker` is present, set
     `pos.product_name = upper(ticker)` and tag `pos._ticker_fallback = true`.

5. **Build `tickerFallbackIds`** — collect IDs from positions tagged in step 4.

6. **OpenFIGI resolution** — only when `tickerFallbackIds` is non-empty:
   - Chunk into groups of **10** (matches the unauthenticated batch size used in
     `lib/ticker-lookup.ts`).
   - For each chunk, run an **External API Request**:
     - URL `https://api.openfigi.com/v3/mapping`
     - Method `POST`, `Content-Type: application/json`, timeout `6000` ms.
     - Body: array of `{ idType, idValue, exchCode: "US" }` where `idType` is
       `"ID_CUSIP"` if the id matches `^[A-Z0-9]{9}$`, else `"TICKER"`.
   - Wrap in try/catch. Failures must not block evaluation; unresolved IDs keep their
     uppercase ticker as `product_name`.
   - Merge resolved names back onto positions by id.

7. **For Each `rules` → `rule`** — switch on `rule.rule_kind`:

   **Branch A — `KEYWORD`** (one entry per matching position; mirrors
   `rules-engine.ts:57-70`):

   For each `pos`, call `match_keywords(rule.keywords, pos.product_name, rule.match_mode)`.
   On a hit, push to `triggered`:
   ```
   {
     rule_id: rule.id,
     rule_name: rule.name,
     rule_type: rule.type,
     matched_positions: [pos.product_name],
     matched_keyword: <hit>,
     total_weight: pos.weight
   }
   ```

   **Branch B — `KEYWORD_WEIGHT_THRESHOLD`** (aggregated; mirrors
   `rules-engine.ts:71-102`):

   - `matches = []`. For each `pos`, on hit push `{ name, keyword, weight }`.
   - If `matches` is empty, continue.
   - `totalWeight = sum(matches[].weight)`. Compare against `rule.weight_pct` using
     `rule.weight_op` (`GT` / `GTE` / `LT` / `LTE`).
   - On pass, push **one** entry to `triggered`:
     ```
     {
       rule_id: rule.id,
       rule_name: rule.name,
       rule_type: rule.type,
       matched_positions: matches[].name,
       matched_keyword: dedup(matches[].keyword).join(", "),
       total_weight: totalWeight
     }
     ```

8. **Verdict** — any `HARD_STOP` triggered → `FAIL`; else any triggered → `WARN`;
   else `PASS`.

9. **Summary** — see strings above.

10. **Response** — return `{ data: { verdict, triggered, summary } }`.

### Helper: `match_keywords` custom function

Signature: `match_keywords(keywords, product_name, match_mode) → string | null`.

Mirrors `matchKeywords` in `lib/rules-engine.ts:24-36`:

- Lowercase both sides; substring containment.
- `match_mode = ANY` → return the first keyword that hits, else `null`.
- `match_mode = ALL` → return `keywords.join(", ")` only when every keyword hits, else
  `null`.

Used by both branches in step 7.

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
