# Model Portfolio Evaluator

A self-hosted portfolio rules engine that evaluates investment model portfolios against configurable hard stop and warning rules.

**Surfaces**

| Path | Description |
|---|---|
| `/evaluate` | Drag-and-drop evaluator — upload CSV or JSON, see PASS / WARN / FAIL verdict |
| `/admin/rules` | Rules management — create, edit, toggle, and soft-delete rules |
| `/api-docs` | Interactive API documentation with a live Try It panel |
| `/api/*` | REST API for external integrations |

---

## Local Development

### Prerequisites

- Node.js 20+
- PostgreSQL 16 (or Docker)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — set DATABASE_URL and API_KEY

# 3. Run migrations and seed example rules
npx prisma migrate dev --name init
npx prisma db seed

# 4. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Database shortcuts

```bash
# Reset DB and re-seed from scratch
npx prisma migrate reset

# Open Prisma Studio (browser-based DB browser)
npx prisma studio

# Re-generate Prisma client after schema changes
npx prisma generate
```

### Tests

```bash
npm test          # run all tests
npm test -- --watch   # watch mode
```

---

## Docker

The full stack runs via Docker Compose: PostgreSQL, a one-shot migration/seed container, and the Next.js app.

```bash
# Build and start everything
docker compose up --build

# Reset the database and start fresh
docker compose down -v && docker compose up --build
```

The app is available at [http://localhost:3000](http://localhost:3000).

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `API_KEY` | Yes | Shared secret for `x-api-key` header authentication |
| `NODE_ENV` | Yes | `development` locally, `production` in Docker |
| `NEXTAUTH_SECRET` | — | Reserved for future auth; not currently used |

Generate secure values:

```bash
openssl rand -hex 32    # for API_KEY
openssl rand -base64 32 # for NEXTAUTH_SECRET
```

---

## API Usage

All `/api/*` routes require the `x-api-key` header. Responses use a consistent `{ data }` / `{ error }` envelope.

### POST /api/evaluate

Run a portfolio against all active rules.

```bash
curl -X POST http://localhost:3000/api/evaluate \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "portfolio_name": "Client Model Q2 2026",
    "positions": [
      { "product_name": "S&P 500 Index Fund",    "weight": 50 },
      { "product_name": "2x Leveraged ETF",       "weight": 10 },
      { "product_name": "Crypto Index Fund",      "weight": 15 },
      { "product_name": "US Treasury Bond Fund",  "weight": 25 }
    ]
  }'
```

**Response**

```json
{
  "data": {
    "log_id": "abc123...",
    "verdict": "FAIL",
    "summary": "Portfolio failed: hard stop triggered by Leveraged/Inverse Hard Stop.",
    "triggered": [
      {
        "rule_id": "...",
        "rule_name": "Leveraged/Inverse Hard Stop",
        "rule_type": "HARD_STOP",
        "matched_position": "2x Leveraged ETF",
        "matched_keyword": "LEVERAGED",
        "position_weight": 10
      }
    ]
  }
}
```

Verdict logic:

- `FAIL` — at least one `HARD_STOP` rule triggered
- `WARN` — one or more `WARNING` rules triggered, no hard stops
- `PASS` — no rules triggered

### GET /api/rules

```bash
curl http://localhost:3000/api/rules \
  -H "x-api-key: YOUR_API_KEY"
```

Returns all rules (active and inactive).

### POST /api/rules

```bash
curl -X POST http://localhost:3000/api/rules \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "name": "Crypto Weight Warning",
    "type": "WARNING",
    "rule_kind": "KEYWORD_WEIGHT_THRESHOLD",
    "keywords": ["CRYPTO"],
    "match_mode": "ANY",
    "weight_op": "GT",
    "weight_pct": 10
  }'
```

### PUT /api/rules/:id

Partial update — only fields present in the body are changed.

```bash
curl -X PUT http://localhost:3000/api/rules/RULE_ID \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{ "weight_pct": 15, "active": true }'
```

### DELETE /api/rules/:id

Soft delete — sets `active: false`. The rule is retained for audit purposes.

```bash
curl -X DELETE http://localhost:3000/api/rules/RULE_ID \
  -H "x-api-key: YOUR_API_KEY"
```

---

## File Upload Formats

The `/evaluate` UI accepts `.csv` and `.json` files.

### CSV

Required columns (case-insensitive, flexible names):

| Accepted header names | Field |
|---|---|
| `product_name`, `name`, `security`, `description` | Position name |
| `weight`, `allocation`, `pct`, `percent` | Portfolio weight (0–100) |
| `ticker`, `symbol`, `cusip` | Ticker (optional) |

Weight values may include a `%` suffix — it is stripped automatically.

**Example**

```csv
product_name,ticker,weight
S&P 500 Index Fund,SPY,50
2x Leveraged ETF,SSO,10
Crypto Index Fund,,15
US Treasury Bond Fund,TLT,25
```

Quoted fields and comma-containing names are supported:

```csv
product_name,weight
"Vanguard, Inc. ETF",60
Short-Term Bond Fund,40
```

### JSON

Accepts either a bare array or a `{ positions: [...] }` wrapper.

**Bare array**

```json
[
  { "product_name": "S&P 500 Index Fund",   "weight": 50 },
  { "product_name": "2x Leveraged ETF",      "weight": 10, "ticker": "SSO" },
  { "product_name": "Crypto Index Fund",     "weight": 15 },
  { "product_name": "US Treasury Bond Fund", "weight": 25 }
]
```

**Wrapped object**

```json
{
  "positions": [
    { "product_name": "S&P 500 Index Fund", "weight": 50 },
    { "product_name": "Bond Fund",          "weight": 50 }
  ]
}
```

Each position requires:

| Field | Type | Required | Notes |
|---|---|---|---|
| `product_name` | string | Yes | Keyword matching is case-insensitive substring |
| `weight` | number | Yes | Percentage 0–100; string `"45%"` also accepted |
| `ticker` | string | No | Stored in audit log; not used for rule matching |

---

## Rule Kinds

| `rule_kind` | Trigger condition |
|---|---|
| `KEYWORD` | `product_name` contains keyword (case-insensitive substring) |
| `KEYWORD_WEIGHT_THRESHOLD` | keyword matches AND `weight` satisfies `weight_op weight_pct` |

`match_mode: ANY` — trigger if any keyword matches (default).  
`match_mode: ALL` — all keywords must match the same position.

Weight operators: `GT` (>), `GTE` (≥), `LT` (<), `LTE` (≤).

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript — strict mode |
| Database | PostgreSQL 16 via Prisma ORM |
| Styling | Tailwind CSS + shadcn/ui |
| Testing | Jest + ts-jest |
| Runtime | Node.js 20 Alpine (Docker) |
