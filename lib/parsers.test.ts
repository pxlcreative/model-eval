import { parseCSV, parseJSON, ParseError } from './parsers'

// ---------------------------------------------------------------------------
// parseCSV — column name aliases
// ---------------------------------------------------------------------------

describe('parseCSV — column name aliases', () => {
  test('accepts product_name + weight headers', () => {
    const csv = 'product_name,weight\nS&P 500 Index,60\nUS Treasuries,40'
    const { positions, hasTickerFallback } = parseCSV(csv)
    expect(hasTickerFallback).toBe(false)
    expect(positions).toEqual([
      { product_name: 'S&P 500 Index', weight: 60 },
      { product_name: 'US Treasuries', weight: 40 },
    ])
  })

  test('accepts name + allocation headers (case-insensitive)', () => {
    const { positions } = parseCSV('Name,Allocation\nGlobal Equity,50\nFixed Income,50')
    expect(positions[0].product_name).toBe('Global Equity')
    expect(positions[0].weight).toBe(50)
  })

  test('accepts security + pct headers', () => {
    const { positions } = parseCSV('security,pct\nNasdaq ETF,30\nBond Fund,70')
    expect(positions[0].product_name).toBe('Nasdaq ETF')
  })

  test('accepts description + percent headers', () => {
    const { positions } = parseCSV('description,percent\nReal Estate Fund,25.5\nCash,74.5')
    expect(positions[0].product_name).toBe('Real Estate Fund')
    expect(positions[0].weight).toBeCloseTo(25.5)
  })
})

// ---------------------------------------------------------------------------
// parseCSV — weight normalisation
// ---------------------------------------------------------------------------

describe('parseCSV — weight normalisation', () => {
  test('strips % sign from weight values', () => {
    const { positions } = parseCSV('product_name,weight\nEquity Fund,60%\nBond Fund,40%')
    expect(positions[0].weight).toBe(60)
    expect(positions[1].weight).toBe(40)
  })

  test('handles decimal weights', () => {
    const { positions } = parseCSV('product_name,weight\nEquity Fund,33.33\nBond Fund,66.67')
    expect(positions[0].weight).toBeCloseTo(33.33)
  })
})

// ---------------------------------------------------------------------------
// parseCSV — quoted fields
// ---------------------------------------------------------------------------

describe('parseCSV — quoted fields', () => {
  test('handles quoted field containing a comma', () => {
    const { positions } = parseCSV('product_name,weight\n"Vanguard, Inc. ETF",55\nCash,45')
    expect(positions[0].product_name).toBe('Vanguard, Inc. ETF')
    expect(positions[0].weight).toBe(55)
  })

  test('handles escaped double-quotes inside a quoted field', () => {
    const { positions } = parseCSV('product_name,weight\n"Fund ""Alpha""",50\nOther,50')
    expect(positions[0].product_name).toBe('Fund "Alpha"')
  })
})

// ---------------------------------------------------------------------------
// parseCSV — optional ticker column
// ---------------------------------------------------------------------------

describe('parseCSV — optional ticker column', () => {
  test('extracts ticker when present alongside product_name', () => {
    const { positions } = parseCSV('product_name,ticker,weight\nS&P 500,SPY,100')
    expect(positions[0].ticker).toBe('SPY')
  })

  test('omits ticker property when column is absent', () => {
    const { positions } = parseCSV('product_name,weight\nS&P 500,100')
    expect(positions[0].ticker).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// parseCSV — ticker-only fallback (no product_name column)
// ---------------------------------------------------------------------------

describe('parseCSV — ticker-only fallback', () => {
  test('accepts ticker + weight when no product_name column, sets hasTickerFallback', () => {
    const csv = 'ticker,weight\nSPY,60\nAGG,40'
    const { positions, hasTickerFallback } = parseCSV(csv)
    expect(hasTickerFallback).toBe(true)
    expect(positions).toHaveLength(2)
    expect(positions[0].product_name).toBe('SPY')
    expect(positions[0].ticker).toBe('SPY')
    expect(positions[0].weight).toBe(60)
  })

  test('accepts symbol + weight', () => {
    const { positions, hasTickerFallback } = parseCSV('symbol,weight\nQQQ,50\nIWM,50')
    expect(hasTickerFallback).toBe(true)
    expect(positions[0].product_name).toBe('QQQ')
  })

  test('accepts cusip + weight', () => {
    const { positions, hasTickerFallback } = parseCSV('cusip,weight\n78462F103,60\n02523TXQ8,40')
    expect(hasTickerFallback).toBe(true)
    expect(positions[0].product_name).toBe('78462F103')
  })

  test('hasTickerFallback is false when product_name column is present', () => {
    const { hasTickerFallback } = parseCSV('product_name,ticker,weight\nS&P 500 ETF,SPY,100')
    expect(hasTickerFallback).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// parseCSV — CRLF line endings
// ---------------------------------------------------------------------------

describe('parseCSV — CRLF line endings', () => {
  test('parses Windows-style CRLF files', () => {
    const csv = 'product_name,weight\r\nEquity,60\r\nBond,40'
    const { positions } = parseCSV(csv)
    expect(positions).toHaveLength(2)
    expect(positions[0].product_name).toBe('Equity')
  })
})

// ---------------------------------------------------------------------------
// parseCSV — errors
// ---------------------------------------------------------------------------

describe('parseCSV — errors', () => {
  test('throws ParseError on empty input', () => {
    expect(() => parseCSV('')).toThrow(ParseError)
    expect(() => parseCSV('   \n  ')).toThrow(ParseError)
  })

  test('throws ParseError with column names when no name or ticker column', () => {
    const csv = 'isin,weight\nUS78462F1030,100'
    expect(() => parseCSV(csv)).toThrow(ParseError)
    expect(() => parseCSV(csv)).toThrow(/product name column/)
  })

  test('throws ParseError with column names when weight column is missing', () => {
    const csv = 'product_name,cusip\nEquity Fund,123456'
    expect(() => parseCSV(csv)).toThrow(ParseError)
    expect(() => parseCSV(csv)).toThrow(/weight column/)
  })

  test('throws ParseError when a weight value is not numeric', () => {
    const csv = 'product_name,weight\nEquity Fund,N/A'
    expect(() => parseCSV(csv)).toThrow(ParseError)
    expect(() => parseCSV(csv)).toThrow(/not a valid number/)
  })

  test('throws ParseError when a row has an empty product name', () => {
    const csv = 'product_name,weight\n,50'
    expect(() => parseCSV(csv)).toThrow(ParseError)
    expect(() => parseCSV(csv)).toThrow(/product name is empty/)
  })

  test('throws ParseError when there are no data rows', () => {
    const csv = 'product_name,weight'
    expect(() => parseCSV(csv)).toThrow(ParseError)
    expect(() => parseCSV(csv)).toThrow(/no data rows/)
  })
})

// ---------------------------------------------------------------------------
// parseJSON — valid input shapes
// ---------------------------------------------------------------------------

describe('parseJSON — valid input shapes', () => {
  test('accepts a bare Position array', () => {
    const json = JSON.stringify([
      { product_name: 'Equity Fund', weight: 60 },
      { product_name: 'Bond Fund', weight: 40 },
    ])
    const { positions, hasTickerFallback } = parseJSON(json)
    expect(hasTickerFallback).toBe(false)
    expect(positions).toHaveLength(2)
    expect(positions[0].product_name).toBe('Equity Fund')
  })

  test('accepts a { positions: [...] } wrapper', () => {
    const json = JSON.stringify({ positions: [{ product_name: 'Equity Fund', weight: 60 }] })
    const { positions } = parseJSON(json)
    expect(positions[0].product_name).toBe('Equity Fund')
  })

  test('extracts optional ticker field', () => {
    const json = JSON.stringify([{ product_name: 'S&P 500', ticker: 'SPY', weight: 100 }])
    const { positions } = parseJSON(json)
    expect(positions[0].ticker).toBe('SPY')
  })
})

// ---------------------------------------------------------------------------
// parseJSON — ticker-only fallback
// ---------------------------------------------------------------------------

describe('parseJSON — ticker-only fallback', () => {
  test('accepts ticker + weight without product_name, sets hasTickerFallback', () => {
    const json = JSON.stringify([
      { ticker: 'SPY', weight: 60 },
      { ticker: 'AGG', weight: 40 },
    ])
    const { positions, hasTickerFallback } = parseJSON(json)
    expect(hasTickerFallback).toBe(true)
    expect(positions[0].product_name).toBe('SPY')
    expect(positions[0].ticker).toBe('SPY')
  })

  test('handles mixed positions (some with product_name, some ticker-only)', () => {
    const json = JSON.stringify([
      { product_name: 'S&P 500 Index Fund', weight: 60 },
      { ticker: 'AGG', weight: 40 },
    ])
    const { positions, hasTickerFallback } = parseJSON(json)
    expect(hasTickerFallback).toBe(true)
    expect(positions[0].product_name).toBe('S&P 500 Index Fund')
    expect(positions[1].product_name).toBe('AGG')
  })
})

// ---------------------------------------------------------------------------
// parseJSON — weight normalisation
// ---------------------------------------------------------------------------

describe('parseJSON — weight normalisation', () => {
  test('strips % from string weight values', () => {
    const { positions } = parseJSON(JSON.stringify([{ product_name: 'Fund', weight: '45%' }]))
    expect(positions[0].weight).toBe(45)
  })

  test('accepts numeric string weight without %', () => {
    const { positions } = parseJSON(JSON.stringify([{ product_name: 'Fund', weight: '33.5' }]))
    expect(positions[0].weight).toBe(33.5)
  })
})

// ---------------------------------------------------------------------------
// parseJSON — errors
// ---------------------------------------------------------------------------

describe('parseJSON — errors', () => {
  test('throws ParseError on invalid JSON', () => {
    expect(() => parseJSON('not json')).toThrow(ParseError)
    expect(() => parseJSON('not json')).toThrow(/Invalid JSON/)
  })

  test('throws ParseError when root is a non-positions object', () => {
    expect(() => parseJSON(JSON.stringify({ rules: [] }))).toThrow(/\"positions\"/)
  })

  test('throws ParseError when root is a primitive', () => {
    expect(() => parseJSON('42')).toThrow(ParseError)
    expect(() => parseJSON('"hello"')).toThrow(ParseError)
  })

  test('throws ParseError when positions array is empty', () => {
    expect(() => parseJSON('[]')).toThrow(ParseError)
    expect(() => parseJSON(JSON.stringify({ positions: [] }))).toThrow(ParseError)
  })

  test('throws ParseError with index when product_name is missing and no ticker', () => {
    const json = JSON.stringify([{ weight: 50 }])
    expect(() => parseJSON(json)).toThrow(ParseError)
    expect(() => parseJSON(json)).toThrow(/positions\[0\].*product_name/)
  })

  test('throws ParseError with index when weight is missing', () => {
    const json = JSON.stringify([{ product_name: 'Fund' }])
    expect(() => parseJSON(json)).toThrow(ParseError)
    expect(() => parseJSON(json)).toThrow(/positions\[0\].*weight/)
  })

  test('throws ParseError with correct index for second invalid item', () => {
    const json = JSON.stringify([
      { product_name: 'Good Fund', weight: 50 },
      { product_name: 'Bad Fund', weight: 'oops' },
    ])
    expect(() => parseJSON(json)).toThrow(/positions\[1\]/)
  })
})
