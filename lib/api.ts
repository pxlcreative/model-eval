import { NextRequest, NextResponse } from 'next/server'

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status })
}

export function err(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status })
}

export function requireApiKey(request: NextRequest): NextResponse | null {
  const key = request.headers.get('x-api-key')
  if (!key || key !== process.env.API_KEY) {
    return err('Unauthorized', 401)
  }
  return null
}
