# CLAUDE.md — Model Portfolio Evaluator

This file defines conventions, architecture decisions, and working rules for Claude Code
sessions on this project. Read this before writing any code.

---

## Project Purpose

A self-hosted portfolio rules engine that evaluates investment model portfolios against
a configurable set of hard stop and warning rules. Surfaces: a rules admin UI, a
drag-and-drop evaluator UI, a REST API for external model database integrations, and
an API documentation page. Runs entirely inside Docker.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript — strict mode, no `any` |
| Database | PostgreSQL 16 (Docker) via Prisma ORM |
| Styling | Tailwind CSS + shadcn/ui |
| Testing | Jest + ts-jest (rules engine unit tests) |
| Runtime | Node.js 20 (Alpine Docker image) |
| Orchestration | Docker Compose (3 services: db, migrate, app) |

---

## Repository Structure

```
/
├── app/
│   ├── page.tsx                  # Landing page with links to all surfaces
│   ├── evaluate/
│   │   └── page.tsx              # File drop evaluator UI
│   ├── admin/
│   │   └── rules/
│   │       └── page.tsx          # Rules CRUD admin UI
│   ├── api-docs/
│   │   └── page.tsx              # API documentation + live tester
│   └── api/
│       ├── evaluate/
│       │   └── route.ts          # POST /api/evaluate
│       └── rules/
│           ├── route.ts          # GET, POST /api/rules
│           └── [id]/
│               └── route.ts      # PUT, DELETE /api/rules/[id]
├── components/                   # Shared React components
├── lib/
│   ├── rules-engine.ts           # Core evaluation logic (pure function, no DB calls)
│   ├── rules-engine.test.ts      # Unit tests
│   └── parsers.ts                # CSV and JSON input parsers
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts                   # Seed with example rules
├── public/
├── Dockerfile                    # Multi-stage build
├── docker-compose.yml            # db + migrate + app services
├── next.config.js                # output: 'standalone' required
├── .env.example
└── CLAUDE.md
```

---

## Docker Architecture

Three compose services, always in this startup order:

1. **db** — PostgreSQL 16 Alpine with a named volume (`pgdata`) for persistence.
   Health-checked via `pg_isready` before dependents start.

2. **migrate** — Runs `prisma migrate deploy && prisma db seed` once then exits.
   Uses `service_completed_successfully` as the condition for the app service.

3. **app** — Next.js production server on port 3000. Only starts after migrate
   completes successfully.

Internal database URL (used by both migrate and app services):
```
postgresql://postgres:postgres@db:5432/portfolio_evaluator
```

To start: `docker compose up --build`
To reset DB: `docker compose down -v && docker compose up --build`

---

## Data Model

### Rule

```prisma
model Rule {
  id          String      @id @default(uuid())
  name        String
  type        RuleType    // HARD_STOP | WARNING
  rule_kind   RuleKind    // KEYWORD | KEYWORD_WEIGHT_THRESHOLD
  keywords    String[]    // matched case-insensitively, substring match
  match_mode  MatchMode   @default(ANY) // ANY | ALL
  weight_op   WeightOp?   // GT | GTE | LT | LTE — only for KEYWORD_WEIGHT_THRESHOLD
  weight_pct  Decimal?    // 0–100 scale
  description String?
  active      Boolean     @default(true)
  created_at  DateTime    @default(now())
  updated_at  DateTime    @updatedAt
}
```

### EvaluationLog

```prisma
model EvaluationLog {
  id              String        @id @default(uuid())
  source          EvalSource    // UI | API
  portfolio_name  String?
  positions       Json          // raw input snapshot
  result          EvalResult    // PASS | WARN | FAIL
  triggered_rules Json          // TriggeredRule[]
  evaluated_at    DateTime      @default(now())
}
```

EvaluationLog is **append-only**. Never update records. Used for audit trail only.

---

## Core Types

Define these in `/lib/rules-engine.ts` and import everywhere. Do not redefine inline.

```typescript
export type Position = {
  product_name: string
  ticker?: string
  weight: number        // always 0–100, normalized by parsers
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
```

---

## Rules Engine Conventions

File: `/lib/rules-engine.ts`

- **Pure function** — no database calls, no side effects, no async
- Signature: `evaluate(positions: Position[], rules: Rule[]): EvaluationResult`
- Keyword matching: **case-insensitive, substring** — "LEVERAGED" matches "2x Leveraged ETF"
- Weight scale: always **0–100** — parsers must normalize before passing in
- Verdict logic:
  - Any triggered HARD_STOP → `FAIL`
  - Only WARNING(s) triggered → `WARN`
  - Nothing triggered → `PASS`
- Only evaluate rules where `active === true`
- For `KEYWORD_WEIGHT_THRESHOLD` rules: keyword must match AND weight condition must be true
- For `match_mode: ALL`: every keyword in the array must appear in the product name

---

## Parser Conventions

File: `/lib/parsers.ts`

### CSV (`parseCSV`)
- Accept flexible column names, case-insensitive:
  - Product name column: `product_name`, `name`, `security`, `description`
  - Weight column: `weight`, `allocation`, `pct`, `percent`
- Strip `%` signs from weight values before converting to number
- Throw a descriptive `ParseError` if required columns are missing

### JSON (`parseJSON`)
- Accept either a bare `Position[]` array or `{ positions: Position[] }` wrapper
- Validate shape: each item must have `product_name` (string) and `weight` (number)
- Throw `ParseError` with field-level detail on missing/invalid fields

---

## API Conventions

### Authentication
All `/api/*` routes require the header:
```
x-api-key: <value of API_KEY env variable>
```
Return `401` with `{ error: 'Unauthorized' }` if missing or invalid.

### Response Envelope
All routes return:
```typescript
{ data: T }           // success
{ error: string }     // failure
```
with appropriate HTTP status codes (200, 201, 400, 401, 404, 500).

### POST /api/evaluate
```typescript
// Request body
{
  portfolio_name?: string
  positions: Position[]
}

// Response (200)
{
  data: {
    log_id: string
    verdict: 'PASS' | 'WARN' | 'FAIL'
    triggered: TriggeredRule[]
    summary: string
  }
}
```

### Rules CRUD
- `GET /api/rules` — returns all rules (active and inactive)
- `POST /api/rules` — creates a rule, returns created record
- `PUT /api/rules/[id]` — updates rule fields, returns updated record
- `DELETE /api/rules/[id]` — soft delete: sets `active = false`, returns updated record

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Set automatically in compose; override for local dev |
| `API_KEY` | Yes | Shared secret for API authentication |
| `NODE_ENV` | Yes | `production` in compose, `development` locally |

`.env.example`:
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/portfolio_evaluator
API_KEY=change-me-before-deploying
NODE_ENV=development
```

---

## Seed Data

`prisma/seed.ts` must create these three example rules on first run:

1. **Leveraged/Inverse Hard Stop** — HARD_STOP, KEYWORD, keywords: `["LEVERAGED", "INVERSE"]`, match_mode: ANY
2. **Crypto Weight Warning** — WARNING, KEYWORD_WEIGHT_THRESHOLD, keywords: `["CRYPTO"]`, weight_op: GT, weight_pct: 10
3. **Private Equity Hard Stop** — HARD_STOP, KEYWORD, keywords: `["PRIVATE EQUITY"]`, match_mode: ANY

Seed is idempotent — use `upsert` with the rule name as the unique key so re-running
doesn't duplicate records.

---

## Testing

File: `/lib/rules-engine.test.ts`

Required test cases:
- KEYWORD rule triggers on substring match → FAIL
- KEYWORD rule does not trigger on no match → PASS
- KEYWORD_WEIGHT_THRESHOLD triggers when keyword matches AND weight exceeds threshold → WARN
- KEYWORD_WEIGHT_THRESHOLD does not trigger when keyword matches but weight is below threshold → PASS
- Multiple rules: one WARNING, one HARD_STOP → FAIL (not WARN)
- Inactive rules are ignored
- match_mode ALL: only triggers when all keywords present

Run with: `npm test`

---

## Next.js Config Requirements

`next.config.js` must include:
```js
module.exports = {
  output: 'standalone',   // required for Docker multi-stage build
}
```

---

## Coding Conventions

- All components are React Server Components by default; add `'use client'` only when needed
- No `any` types — use `unknown` + type guards if shape is uncertain
- All Prisma calls go in API route handlers or server actions, never in client components
- Error boundaries: wrap each page surface in a top-level error boundary
- Do not add dependencies without a clear reason — prefer native or already-included libs
- shadcn/ui components are the default for all UI primitives (buttons, inputs, badges, drawers, tables)
- Verdict colors: PASS = green, WARN = amber, FAIL = red — use Tailwind semantic classes consistently

---

## Out of Scope (Do Not Build)

- User authentication / multi-user accounts
- Rule versioning or history
- nginx reverse proxy (can be added later)
- Email or webhook notifications
- Any cloud provider integrations
