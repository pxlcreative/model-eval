import type { Metadata } from 'next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import TryItPanel from './TryItPanel'

export const metadata: Metadata = {
  title: 'API Docs — Model Portfolio Evaluator',
}

// ---------------------------------------------------------------------------
// Primitive components
// ---------------------------------------------------------------------------

function MethodBadge({ method }: { method: 'GET' | 'POST' | 'PUT' | 'DELETE' }) {
  const styles = {
    GET: 'bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
    POST: 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100',
    PUT: 'bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100',
    DELETE: 'bg-red-100 text-red-700 border-red-200 hover:bg-red-100',
  }
  return (
    <Badge className={`font-mono font-bold text-xs ${styles[method]}`}>{method}</Badge>
  )
}

function Code({ children }: { children: string }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">{children}</code>
  )
}

function CodeBlock({ children, lang = '' }: { children: string; lang?: string }) {
  return (
    <pre
      data-lang={lang}
      className="rounded-md bg-zinc-950 text-zinc-100 text-xs font-mono p-4 overflow-x-auto leading-relaxed"
    >
      {children.trim()}
    </pre>
  )
}

function EndpointHeading({
  method,
  path,
  description,
}: {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  description: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <MethodBadge method={method} />
        <code className="text-sm font-mono font-semibold">{path}</code>
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

function SectionCard({
  title,
  id,
  children,
}: {
  title: string
  id: string
  children: React.ReactNode
}) {
  return (
    <Card id={id} className="scroll-mt-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">{children}</CardContent>
    </Card>
  )
}

function Field({
  name,
  type,
  required,
  description,
}: {
  name: string
  type: string
  required?: boolean
  description: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <code className="text-sm font-mono font-medium">{name}</code>
        <span className="text-xs text-muted-foreground font-mono">{type}</span>
        {required && (
          <span className="text-xs text-destructive font-medium">required</span>
        )}
      </div>
      <p className="text-sm text-muted-foreground pl-0.5">{description}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Example payloads
// ---------------------------------------------------------------------------

const EVALUATE_REQUEST = `{
  "portfolio_name": "Client Model Q2 2026",
  "positions": [
    { "product_name": "S&P 500 Index Fund",    "weight": 50 },
    { "product_name": "US Treasury Bond Fund", "weight": 30 },
    { "product_name": "Crypto Index Fund",     "weight": 12 },
    { "product_name": "Global Equity ETF",     "weight": 8  }
  ]
}`

const EVALUATE_PASS = `{
  "data": {
    "log_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "verdict": "PASS",
    "triggered": [],
    "summary": "Portfolio passed all rules."
  }
}`

const EVALUATE_WARN = `{
  "data": {
    "log_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    "verdict": "WARN",
    "triggered": [
      {
        "rule_id":           "r1r1r1r1-...",
        "rule_name":         "Crypto Weight Warning",
        "rule_type":         "WARNING",
        "matched_positions": ["Crypto Index Fund", "Bitcoin Crypto ETF"],
        "matched_keyword":   "CRYPTO",
        "total_weight":      12
      }
    ],
    "summary": "Portfolio has warnings: Crypto Weight Warning."
  }
}`

const EVALUATE_FAIL = `{
  "data": {
    "log_id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
    "verdict": "FAIL",
    "triggered": [
      {
        "rule_id":           "r2r2r2r2-...",
        "rule_name":         "Leveraged/Inverse Hard Stop",
        "rule_type":         "HARD_STOP",
        "matched_positions": ["2x Leveraged S&P ETF"],
        "matched_keyword":   "LEVERAGED",
        "total_weight":      10
      }
    ],
    "summary": "Portfolio failed: hard stop triggered by Leveraged/Inverse Hard Stop."
  }
}`

const EVALUATE_CURL = `curl -X POST http://localhost:3000/api/evaluate \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d '{
    "portfolio_name": "My Portfolio",
    "positions": [
      { "product_name": "S&P 500 Index Fund", "weight": 60 },
      { "product_name": "Bond Fund",          "weight": 40 }
    ]
  }'`

const RULE_CREATE_BODY = `{
  "name":        "Tech Concentration Warning",
  "type":        "WARNING",
  "rule_kind":   "KEYWORD_WEIGHT_THRESHOLD",
  "keywords":    ["TECH", "TECHNOLOGY"],
  "match_mode":  "ANY",
  "weight_op":   "GT",
  "weight_pct":  25,
  "description": "Warn when tech exposure exceeds 25%"
}`

const RULE_UPDATE_BODY = `{
  "keywords":    ["TECH", "TECHNOLOGY", "SOFTWARE"],
  "weight_pct":  30
}`

const RULE_RESPONSE = `{
  "data": {
    "id":          "d4e5f6a7-b8c9-0123-defa-234567890123",
    "name":        "Tech Concentration Warning",
    "type":        "WARNING",
    "rule_kind":   "KEYWORD_WEIGHT_THRESHOLD",
    "keywords":    ["TECH", "TECHNOLOGY"],
    "match_mode":  "ANY",
    "weight_op":   "GT",
    "weight_pct":  "25",
    "description": "Warn when tech exposure exceeds 25%",
    "active":      true,
    "created_at":  "2026-04-06T12:00:00.000Z",
    "updated_at":  "2026-04-06T12:00:00.000Z"
  }
}`

const ERROR_401 = `{ "error": "Unauthorized" }`
const ERROR_400 = `{ "error": "Request body must include a \\"positions\\" array." }`
const ERROR_404 = `{ "error": "Rule \\"d4e5f6...\\" not found." }`

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="mb-10">
          <h1 className="text-2xl font-semibold tracking-tight">API Reference</h1>
          <p className="text-sm text-muted-foreground mt-1">
            REST API for evaluating portfolios and managing rules programmatically.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 items-start">

          {/* Left column — docs */}
          <div className="flex flex-col gap-8">

            {/* Authentication */}
            <SectionCard title="Authentication & Base URL" id="auth">
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  All endpoints require the <Code>x-api-key</Code> header. Set the key via the{' '}
                  <Code>API_KEY</Code> environment variable.
                </p>
                <CodeBlock>{`x-api-key: your-api-key-here`}</CodeBlock>
              </div>
              <Separator />
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Base URL</p>
                <CodeBlock>{`http://localhost:3000   # local dev
http://your-host:3000  # Docker / production`}</CodeBlock>
              </div>
              <Separator />
              <div className="flex flex-col gap-3">
                <p className="text-sm font-medium">Response envelope</p>
                <p className="text-sm text-muted-foreground">
                  All responses use a consistent wrapper. HTTP status codes follow standard
                  semantics (200, 201, 400, 401, 404, 500).
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <p className="text-xs text-muted-foreground font-medium">Success</p>
                    <CodeBlock>{`{ "data": { ... } }`}</CodeBlock>
                  </div>
                  <div className="flex flex-col gap-1">
                    <p className="text-xs text-muted-foreground font-medium">Error</p>
                    <CodeBlock>{`{ "error": "message" }`}</CodeBlock>
                  </div>
                </div>
              </div>
            </SectionCard>

            {/* POST /api/evaluate */}
            <SectionCard title="Evaluate a Portfolio" id="evaluate">
              <EndpointHeading
                method="POST"
                path="/api/evaluate"
                description="Run a portfolio against all active rules. Writes an audit log entry and returns the verdict."
              />

              <Separator />

              <div className="flex flex-col gap-3">
                <p className="text-sm font-medium">Request body</p>
                <div className="flex flex-col gap-2">
                  <Field
                    name="portfolio_name"
                    type="string"
                    description="Optional display name stored in the audit log."
                  />
                  <Field
                    name="positions"
                    type="Position[]"
                    required
                    description="Array of portfolio positions. Each must have product_name (string) and weight (number, 0–100)."
                  />
                  <div className="pl-4 border-l-2 border-border flex flex-col gap-2">
                    <Field
                      name="positions[].product_name"
                      type="string"
                      required
                      description="Full name of the holding. Keyword matching is case-insensitive substring."
                    />
                    <Field
                      name="positions[].weight"
                      type="number"
                      required
                      description="Portfolio weight as a percentage (0–100). Must be pre-normalised."
                    />
                    <Field
                      name="positions[].ticker"
                      type="string"
                      description="Optional ticker symbol. Stored in the log but not used for rule matching."
                    />
                  </div>
                </div>
                <CodeBlock lang="json">{EVALUATE_REQUEST}</CodeBlock>
              </div>

              <Separator />

              <div className="flex flex-col gap-3">
                <p className="text-sm font-medium">cURL example</p>
                <CodeBlock lang="bash">{EVALUATE_CURL}</CodeBlock>
              </div>

              <Separator />

              <div className="flex flex-col gap-4">
                <p className="text-sm font-medium">Responses</p>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-emerald-600">200</span>
                    <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-green-100 text-green-800 border-green-200">PASS</span>
                    <span className="text-xs text-muted-foreground">No rules triggered</span>
                  </div>
                  <CodeBlock lang="json">{EVALUATE_PASS}</CodeBlock>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-emerald-600">200</span>
                    <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 border-amber-200">WARN</span>
                    <span className="text-xs text-muted-foreground">Only WARNING rules triggered</span>
                  </div>
                  <CodeBlock lang="json">{EVALUATE_WARN}</CodeBlock>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-emerald-600">200</span>
                    <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-red-100 text-red-800 border-red-200">FAIL</span>
                    <span className="text-xs text-muted-foreground">At least one HARD_STOP triggered</span>
                  </div>
                  <CodeBlock lang="json">{EVALUATE_FAIL}</CodeBlock>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-amber-600">401</span>
                    <span className="text-xs text-muted-foreground">Missing or invalid API key</span>
                  </div>
                  <CodeBlock lang="json">{ERROR_401}</CodeBlock>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-amber-600">400</span>
                    <span className="text-xs text-muted-foreground">Invalid request body</span>
                  </div>
                  <CodeBlock lang="json">{ERROR_400}</CodeBlock>
                </div>
              </div>
            </SectionCard>

            {/* Rules API */}
            <SectionCard title="Rules API" id="rules">

              {/* GET */}
              <EndpointHeading
                method="GET"
                path="/api/rules"
                description="Return all rules (active and inactive), ordered by creation date descending."
              />
              <CodeBlock lang="bash">{`curl http://localhost:3000/api/rules \\
  -H "x-api-key: YOUR_API_KEY"`}
              </CodeBlock>

              <Separator />

              {/* POST */}
              <EndpointHeading
                method="POST"
                path="/api/rules"
                description="Create a new rule. Returns the created record with HTTP 201."
              />
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                  <Field name="name" type="string" required description="Unique display name." />
                  <Field name="type" type='"HARD_STOP" | "WARNING"' required description="Determines verdict contribution: HARD_STOP → FAIL, WARNING → WARN." />
                  <Field name="rule_kind" type='"KEYWORD" | "KEYWORD_WEIGHT_THRESHOLD"' required description="KEYWORD matches on product name only. KEYWORD_WEIGHT_THRESHOLD additionally checks the position weight." />
                  <Field name="keywords" type="string[]" required description="One or more keywords. Matching is case-insensitive substring." />
                  <Field name="match_mode" type='"ANY" | "ALL"' description='ANY (default): trigger if any keyword matches. ALL: every keyword must match the same position.' />
                  <Field name="weight_op" type='"GT" | "GTE" | "LT" | "LTE"' description="Required when rule_kind is KEYWORD_WEIGHT_THRESHOLD." />
                  <Field name="weight_pct" type="number" description="Threshold percentage (0–100). Required with weight_op." />
                  <Field name="description" type="string" description="Optional human-readable description." />
                </div>
                <CodeBlock lang="json">{RULE_CREATE_BODY}</CodeBlock>
                <p className="text-xs text-muted-foreground">Response: 201 with the created rule object.</p>
                <CodeBlock lang="json">{RULE_RESPONSE}</CodeBlock>
              </div>

              <Separator />

              {/* PUT */}
              <EndpointHeading
                method="PUT"
                path="/api/rules/[id]"
                description="Partially update a rule. Only fields included in the request body are modified."
              />
              <CodeBlock lang="json">{RULE_UPDATE_BODY}</CodeBlock>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-amber-600">404</span>
                  <span className="text-xs text-muted-foreground">Rule not found</span>
                </div>
                <CodeBlock lang="json">{ERROR_404}</CodeBlock>
              </div>

              <Separator />

              {/* DELETE */}
              <EndpointHeading
                method="DELETE"
                path="/api/rules/[id]"
                description="Soft-delete a rule by setting active = false. The rule remains in the database for audit purposes but is excluded from all future evaluations."
              />
              <CodeBlock lang="bash">{`curl -X DELETE http://localhost:3000/api/rules/RULE_ID \\
  -H "x-api-key: YOUR_API_KEY"`}
              </CodeBlock>
              <p className="text-sm text-muted-foreground">
                Returns 200 with the updated rule object (active: false).
              </p>
            </SectionCard>

          </div>

          {/* Right column — sticky Try It */}
          <div className="lg:sticky lg:top-6">
            <TryItPanel />
          </div>

        </div>
      </div>
    </div>
  )
}
