'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const LS_KEY = 'api_docs_key'

type EndpointDef = {
  id: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  hasId: boolean
  hasBody: boolean
  defaultBody?: string
}

const ENDPOINTS: EndpointDef[] = [
  {
    id: 'evaluate',
    method: 'POST',
    path: '/api/evaluate',
    hasId: false,
    hasBody: true,
    defaultBody: JSON.stringify(
      {
        portfolio_name: 'My Test Portfolio',
        positions: [
          { product_name: '2x Leveraged S&P ETF', weight: 10 },
          { product_name: 'US Treasury Bond Fund', weight: 50 },
          { product_name: 'Crypto Index Fund', weight: 15 },
          { product_name: 'Global Equity Index', weight: 25 },
        ],
      },
      null,
      2,
    ),
  },
  {
    id: 'rules-list',
    method: 'GET',
    path: '/api/rules',
    hasId: false,
    hasBody: false,
  },
  {
    id: 'rules-create',
    method: 'POST',
    path: '/api/rules',
    hasId: false,
    hasBody: true,
    defaultBody: JSON.stringify(
      {
        name: 'New Test Rule',
        type: 'WARNING',
        rule_kind: 'KEYWORD',
        keywords: ['SPECULATIVE'],
        match_mode: 'ANY',
      },
      null,
      2,
    ),
  },
  {
    id: 'rules-update',
    method: 'PUT',
    path: '/api/rules/[id]',
    hasId: true,
    hasBody: true,
    defaultBody: JSON.stringify({ active: false }, null, 2),
  },
  {
    id: 'rules-delete',
    method: 'DELETE',
    path: '/api/rules/[id]',
    hasId: true,
    hasBody: false,
  },
]

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  POST: 'bg-blue-100 text-blue-700 border-blue-200',
  PUT: 'bg-amber-100 text-amber-700 border-amber-200',
  DELETE: 'bg-red-100 text-red-700 border-red-200',
}

type ResponseState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; status: number; body: string; durationMs: number }
  | { kind: 'error'; message: string }

export default function TryItPanel() {
  const [apiKey, setApiKey] = useState('')
  const [selectedId, setSelectedId] = useState('evaluate')
  const [pathId, setPathId] = useState('')
  const [body, setBody] = useState(ENDPOINTS[0].defaultBody ?? '')
  const [response, setResponse] = useState<ResponseState>({ kind: 'idle' })

  const endpoint = ENDPOINTS.find((e) => e.id === selectedId)!

  // Persist API key
  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY)
    if (stored) setApiKey(stored)
  }, [])
  useEffect(() => {
    localStorage.setItem(LS_KEY, apiKey)
  }, [apiKey])

  function handleEndpointChange(id: string | null) {
    if (!id) return
    setSelectedId(id)
    setResponse({ kind: 'idle' })
    const ep = ENDPOINTS.find((e) => e.id === id)!
    setBody(ep.defaultBody ?? '')
  }

  async function handleSend() {
    const ep = endpoint
    let url = ep.path
    if (ep.hasId) {
      if (!pathId.trim()) {
        setResponse({ kind: 'error', message: 'Rule ID is required for this endpoint.' })
        return
      }
      url = url.replace('[id]', pathId.trim())
    }

    let parsedBody: unknown = undefined
    if (ep.hasBody && body.trim()) {
      try {
        parsedBody = JSON.parse(body)
      } catch {
        setResponse({ kind: 'error', message: 'Request body is not valid JSON.' })
        return
      }
    }

    setResponse({ kind: 'loading' })
    const start = performance.now()

    try {
      const res = await fetch(url, {
        method: ep.method,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        ...(parsedBody !== undefined ? { body: JSON.stringify(parsedBody) } : {}),
      })
      const durationMs = Math.round(performance.now() - start)
      let text: string
      try {
        const json = await res.json()
        text = JSON.stringify(json, null, 2)
      } catch {
        text = await res.text()
      }
      setResponse({ kind: 'done', status: res.status, body: text, durationMs })
    } catch (e) {
      setResponse({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Network error.',
      })
    }
  }

  const statusColor =
    response.kind === 'done'
      ? response.status < 300
        ? 'text-emerald-600'
        : response.status < 500
          ? 'text-amber-600'
          : 'text-red-600'
      : ''

  return (
    <Card id="try-it">
      <CardHeader>
        <CardTitle className="text-base">Try It</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {/* API Key */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            API Key
          </Label>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste your x-api-key value"
            className="font-mono text-sm"
          />
        </div>

        {/* Endpoint selector */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Endpoint
          </Label>
          <Select value={selectedId} onValueChange={handleEndpointChange}>
            <SelectTrigger className="font-mono text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ENDPOINTS.map((ep) => (
                <SelectItem key={ep.id} value={ep.id} className="font-mono text-sm">
                  <span className={`mr-2 text-xs font-bold ${METHOD_COLORS[ep.method].split(' ')[1]}`}>
                    {ep.method}
                  </span>
                  {ep.path}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Path ID input */}
        {endpoint.hasId && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Rule ID
            </Label>
            <Input
              value={pathId}
              onChange={(e) => setPathId(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="font-mono text-sm"
            />
          </div>
        )}

        {/* Request body */}
        {endpoint.hasBody && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Request Body
            </Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="font-mono text-xs resize-none"
              rows={10}
              spellCheck={false}
            />
          </div>
        )}

        <Button onClick={handleSend} disabled={response.kind === 'loading'}>
          {response.kind === 'loading' ? 'Sending…' : 'Send Request'}
        </Button>

        {/* Response */}
        {response.kind !== 'idle' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Response
              </Label>
              {response.kind === 'done' && (
                <>
                  <span className={`text-sm font-mono font-bold ${statusColor}`}>
                    {response.status}
                  </span>
                  <span className="text-xs text-muted-foreground">{response.durationMs} ms</span>
                </>
              )}
              {response.kind === 'error' && (
                <span className="text-xs text-destructive">{response.message}</span>
              )}
            </div>
            {response.kind === 'done' && (
              <pre className="rounded-md bg-zinc-950 text-zinc-100 text-xs font-mono p-4 overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap break-words">
                {response.body}
              </pre>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
