/**
 * Ticker and CUSIP → fund name resolution.
 *
 * Sources (both free, no API key required):
 *   - Yahoo Finance v7 quote API   — tickers (1–5 char symbols)
 *   - OpenFIGI mapping API          — CUSIPs (9-char alphanumeric)
 *
 * All lookups time out after 6 s and fail silently — the original ticker
 * is returned unchanged so evaluation can still proceed.
 */

export type ResolvedName = {
  name: string
  source: 'yahoo' | 'openfigi' | 'unresolved'
}

// A CUSIP is exactly 9 alphanumeric characters.
function isCUSIP(id: string): boolean {
  return /^[A-Z0-9]{9}$/i.test(id)
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// ---------------------------------------------------------------------------
// Yahoo Finance — batch quote endpoint
// ---------------------------------------------------------------------------

async function resolveViaYahoo(symbols: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (symbols.length === 0) return result

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
  }

  // Yahoo supports many symbols per request but we batch at 20 to be polite
  for (const batch of chunk(symbols, 20)) {
    const url =
      `https://query1.finance.yahoo.com/v8/finance/quote?symbols=${batch.map(encodeURIComponent).join(',')}`
    console.log('[ticker-lookup] Yahoo request:', url)
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) })
      console.log('[ticker-lookup] Yahoo response status:', res.status)
      if (!res.ok) {
        const text = await res.text()
        console.warn('[ticker-lookup] Yahoo non-OK body:', text.slice(0, 300))
        continue
      }
      const data = await res.json() as {
        quoteResponse?: { result?: Array<{ symbol: string; longName?: string; shortName?: string }> }
      }
      const quotes = data.quoteResponse?.result ?? []
      console.log('[ticker-lookup] Yahoo quotes received:', quotes.map((q) => ({ symbol: q.symbol, longName: q.longName, shortName: q.shortName })))
      for (const q of quotes) {
        const name = q.longName ?? q.shortName
        if (q.symbol && name) {
          result.set(q.symbol.toUpperCase(), name)
        }
      }
    } catch (e) {
      console.error('[ticker-lookup] Yahoo fetch error:', e)
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// OpenFIGI — CUSIP mapping
// ---------------------------------------------------------------------------

type FIGIResult = {
  data?: Array<{ name?: string; ticker?: string; exchCode?: string }>
  error?: string
}

async function resolveViaOpenFIGI(cusips: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (cusips.length === 0) return result

  // OpenFIGI caps requests at 100 items; no API key needed for basic use
  for (const batch of chunk(cusips, 100)) {
    console.log('[ticker-lookup] OpenFIGI request for CUSIPs:', batch)
    try {
      const res = await fetch('https://api.openfigi.com/v3/mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch.map((c) => ({ idType: 'ID_CUSIP', idValue: c }))),
        signal: AbortSignal.timeout(6000),
      })
      console.log('[ticker-lookup] OpenFIGI response status:', res.status)
      if (!res.ok) {
        const text = await res.text()
        console.warn('[ticker-lookup] OpenFIGI non-OK body:', text.slice(0, 300))
        continue
      }
      const rows: FIGIResult[] = await res.json()
      console.log('[ticker-lookup] OpenFIGI rows:', JSON.stringify(rows).slice(0, 500))
      for (let i = 0; i < batch.length; i++) {
        const name = rows[i]?.data?.[0]?.name
        if (name) result.set(batch[i].toUpperCase(), name)
      }
    } catch (e) {
      console.error('[ticker-lookup] OpenFIGI fetch error:', e)
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve a list of ticker symbols and/or CUSIPs to human-readable fund names.
 *
 * Returns a Map from the original identifier (uppercased) to a ResolvedName.
 * Identifiers that could not be resolved have source = 'unresolved' and
 * name = the original identifier.
 */
export async function resolveTickerNames(ids: string[]): Promise<Map<string, ResolvedName>> {
  const upper = ids.map((id) => id.toUpperCase())
  const cusips = upper.filter(isCUSIP)
  const tickers = upper.filter((id) => !isCUSIP(id))
  console.log('[ticker-lookup] resolveTickerNames called — tickers:', tickers, 'cusips:', cusips)

  const [yahooMap, figiMap] = await Promise.all([
    resolveViaYahoo(tickers),
    resolveViaOpenFIGI(cusips),
  ])

  const out = new Map<string, ResolvedName>()
  for (const id of upper) {
    if (yahooMap.has(id)) {
      out.set(id, { name: yahooMap.get(id)!, source: 'yahoo' })
    } else if (figiMap.has(id)) {
      out.set(id, { name: figiMap.get(id)!, source: 'openfigi' })
    } else {
      out.set(id, { name: id, source: 'unresolved' })
    }
  }
  console.log('[ticker-lookup] final resolution:', Object.fromEntries(Array.from(out.entries()).map(([k, v]) => [k, v])))
  return out
}
