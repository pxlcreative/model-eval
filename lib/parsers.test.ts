import { parseCSV, parseJSON, ParseError } from './parsers'

// ---------------------------------------------------------------------------
// parseCSV
// ---------------------------------------------------------------------------

describe('parseCSV — column name aliases', () => {
  test('accepts product_name + weight headers', () => {
    const csv = 'product_name,weight\nS&P 500 Index,60\nUS Treasuries,40'
    const result = parseCSV(csv)
    expect(result).toEqual([
      { product_name: 'S&P 500 Index', weight: 60 },
      { product_name: 'US Treasuries', weight: 40 },
    ])
  })

  test('accepts name + allocation headers (case-insensitive)', () => {
    const csv = 'Name,Allocation\nGlobal Equity,50\nFixed Income,50'
    const result = parseCSV(csv)
    expect(result[0].product_name).toBe('Global Equity')
    expect(result[0].weight).toBe(50)
  })

  test('accepts security + pct headers', () => {
    const csv = 'security,pct\nNasdaq ETF,30\nBond Fund,70'
    const result = parseCSV(csv)
    expect(result[0].product_name).toBe('Nasdaq ETF')
    expect(result[0].weight).toBe(30)
  })

  test('accepts description + percent headers', () => {
    const csv = 'description,percent\nReal Estate Fund,25.5\nCash,74.5'
    const result = parseCSV(csv)
    expect(result[0].product_name).toBe('Real Estate Fund')
    expect(result[0].weight).toBe(25.5)
  })
})

describe('parseCSV — weight normalisation', () => {
  test('strips % sign from weight values', () => {
    const csv = 'product_name,weight\nEquity Fund,60%\nBond Fund,40%'
    const result = parseCSV(csv)
    expect(result[0].weight).toBe(60)
    expect(result[1].weight).toBe(40)
  })

  test('handles decimal weights', () => {
    const csv = 'product_name,weight\nEquity Fund,33.33\nBond Fund,66.67'
    const result = parseCSV(csv)
    expect(result[0].weight).toBeCloseTo(33.33)
  })
})

describe('parseCSV — quoted fields', () => {
  test('handles quoted field containing a comma', () => {
    const csv = 'product_name,weight\n"Vanguard, Inc. ETF",55\nCash,45'
    const result = parseCSV(csv)
    expect(result[0].product_name).toBe('Vanguard, Inc. ETF')
    expect(result[0].weight).toBe(55)
  })

  test('handles escaped double-quotes inside a quoted field', () => {
    const csv = 'product_name,weight\n"Fund ""Alpha""",50\nOther,50'
    const result = parseCSV(csv)
    expect(result[0].product_name).toBe('Fund "Alpha"')
  })
})

describe('parseCSV — optional ticker column', () => {
  test('extracts ticker when present', () => {
    const csv = 'product_name,ticker,weight\nS&P 500,SPY,100'
    const result = parseCSV(csv)
    expect(result[0].ticker).toBe('SPY')
  })

  test('omits ticker property when column is absent', () => {
    const csv = 'product_name,weight\nS&P 500,100'
    const result = parseCSV(csv)
    expect(result[0].ticker).toBeUndefined()
  })
})

describe('parseCSV — CRLF line endings', () => {
  test('parses Windows-style CRLF files', () => {
    const csv = 'product_name,weight\r\nEquity,60\r\nBond,40'
    const result = parseCSV(csv)
    expect(result).toHaveLength(2)
    expect(result[0].product_name).toBe('Equity')
  })
})

describe('parseCSV — errors', () => {
  test('throws ParseError on empty input', () => {
    expect(() => parseCSV('')).toThrow(ParseError)
    expect(() => parseCSV('   \n  ')).toThrow(ParseError)
  })

  test('throws ParseError with column names when product name column is missing', () => {
    const csv = 'ticker,weight\nSPY,100'
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
// parseJSON
// ---------------------------------------------------------------------------

describe('parseJSON — valid input shapes', () => {
  test('accepts a bare Position array', () => {
    const json = JSON.stringify([
      { product_name: 'Equity Fund', weight: 60 },
      { product_name: 'Bond Fund', weight: 40 },
    ])
    const result = parseJSON(json)
    expect(result).toHaveLength(2)
    expect(result[0].product_name).toBe('Equity Fund')
    expect(result[0].weight).toBe(60)
  })

  test('accepts a { positions: [...] } wrapper', () => {
    const json = JSON.stringify({
      positions: [{ product_name: 'Equity Fund', weight: 60 }],
    })
    const result = parseJSON(json)
    expect(result[0].product_name).toBe('Equity Fund')
  })

  test('extracts optional ticker field', () => {
    const json = JSON.stringify([{ product_name: 'S&P 500', ticker: 'SPY', weight: 100 }])
    const result = parseJSON(json)
    expect(result[0].ticker).toBe('SPY')
  })

  test('omits ticker when not present in object', () => {
    const json = JSON.stringify([{ product_name: 'Fund', weight: 100 }])
    expect(parseJSON(json)[0].ticker).toBeUndefined()
  })
})

describe('parseJSON — weight normalisation', () => {
  test('strips % from string weight values', () => {
    const json = JSON.stringify([{ product_name: 'Fund', weight: '45%' }])
    const result = parseJSON(json)
    expect(result[0].weight).toBe(45)
  })

  test('accepts numeric string weight without %', () => {
    const json = JSON.stringify([{ product_name: 'Fund', weight: '33.5' }])
    expect(parseJSON(json)[0].weight).toBe(33.5)
  })
})

describe('parseJSON — errors', () => {
  test('throws ParseError on invalid JSON', () => {
    expect(() => parseJSON('not json')).toThrow(ParseError)
    expect(() => parseJSON('not json')).toThrow(/Invalid JSON/)
  })

  test('throws ParseError when root is a non-positions object', () => {
    const json = JSON.stringify({ rules: [] })
    expect(() => parseJSON(json)).toThrow(ParseError)
    expect(() => parseJSON(json)).toThrow(/"positions"/)
  })

  test('throws ParseError when root is a primitive', () => {
    expect(() => parseJSON('42')).toThrow(ParseError)
    expect(() => parseJSON('"hello"')).toThrow(ParseError)
  })

  test('throws ParseError when positions array is empty', () => {
    expect(() => parseJSON('[]')).toThrow(ParseError)
    expect(() => parseJSON(JSON.stringify({ positions: [] }))).toThrow(ParseError)
  })

  test('throws ParseError with index when product_name is missing', () => {
    const json = JSON.stringify([{ weight: 50 }])
    expect(() => parseJSON(json)).toThrow(ParseError)
    expect(() => parseJSON(json)).toThrow(/positions\[0\].*product_name/)
  })

  test('throws ParseError with index when product_name is empty string', () => {
    const json = JSON.stringify([{ product_name: '  ', weight: 50 }])
    expect(() => parseJSON(json)).toThrow(ParseError)
    expect(() => parseJSON(json)).toThrow(/positions\[0\]/)
  })

  test('throws ParseError with index when weight is missing', () => {
    const json = JSON.stringify([{ product_name: 'Fund' }])
    expect(() => parseJSON(json)).toThrow(ParseError)
    expect(() => parseJSON(json)).toThrow(/positions\[0\].*weight/)
  })

  test('throws ParseError with index when weight is wrong type', () => {
    const json = JSON.stringify([{ product_name: 'Fund', weight: true }])
    expect(() => parseJSON(json)).toThrow(ParseError)
    expect(() => parseJSON(json)).toThrow(/positions\[0\]/)
  })

  test('throws ParseError with correct index for second invalid item', () => {
    const json = JSON.stringify([
      { product_name: 'Good Fund', weight: 50 },
      { product_name: 'Bad Fund', weight: 'oops' },
    ])
    expect(() => parseJSON(json)).toThrow(/positions\[1\]/)
  })

  test('throws ParseError when a position is not an object', () => {
    const json = JSON.stringify([42])
    expect(() => parseJSON(json)).toThrow(ParseError)
    expect(() => parseJSON(json)).toThrow(/positions\[0\].*object/)
  })
})
