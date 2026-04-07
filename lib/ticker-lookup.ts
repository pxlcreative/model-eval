/**
 * Ticker and CUSIP → fund name resolution.
 *
 * Source (free, no API key required):
 *   - OpenFIGI mapping API — both tickers (TICKER + exchCode US) and CUSIPs (ID_CUSIP)
 *
 * All lookups time out after 6 s and fail silently — the original ticker
 * is returned unchanged so evaluation can still proceed.
 */

export type ResolvedName = {
  name: string
  source: 'openfigi' | 'unresolved'
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
// OpenFIGI — batch mapping for both tickers and CUSIPs
// ---------------------------------------------------------------------------

type FIGIResult = {
  data?: Array<{ name?: string; ticker?: string; exchCode?: string }>
  error?: string
}

type FIGIRequest =
  | { idType: 'TICKER'; idValue: string; exchCode: 'US' }
  | { idType: 'ID_CUSIP'; idValue: string }

async function resolveViaOpenFIGI(
  items: FIGIRequest[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (items.length === 0) return result

  // OpenFIGI caps requests at 10 items without an API key
  for (const batch of chunk(items, 10)) {
    console.log('[ticker-lookup] OpenFIGI request:', batch.map((i) => `${i.idType}:${i.idValue}`))
    try {
      const res = await fetch('https://api.openfigi.com/v3/mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
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
        if (name) result.set(batch[i].idValue.toUpperCase(), name)
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

  const requests: FIGIRequest[] = [
    ...tickers.map((t): FIGIRequest => ({ idType: 'TICKER', idValue: t, exchCode: 'US' })),
    ...cusips.map((c): FIGIRequest => ({ idType: 'ID_CUSIP', idValue: c })),
  ]

  const figiMap = await resolveViaOpenFIGI(requests)

  const out = new Map<string, ResolvedName>()
  for (const id of upper) {
    if (figiMap.has(id)) {
      out.set(id, { name: figiMap.get(id)!, source: 'openfigi' })
    } else {
      out.set(id, { name: id, source: 'unresolved' })
    }
  }
  console.log('[ticker-lookup] final resolution:', Object.fromEntries(Array.from(out.entries()).map(([k, v]) => [k, v])))
  return out
}
