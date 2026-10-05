import { decodeJwt } from 'jose'
import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const claims = decodeJwt(request.cookies.get('sb-token')?.value ?? '')
  if (claims.role !== 'admin') return NextResponse.redirect(new URL('/', request.url))
}
