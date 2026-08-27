import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-guard'
import { listAuditLog } from '@/lib/queries/audit'

export async function GET(request: Request) {
  const ctx = await requireRole('super_admin')
  if (!ctx.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(request.url)
  const beforeCreatedAt = url.searchParams.get('beforeCreatedAt')
  const beforeId = url.searchParams.get('beforeId')
  const before = beforeCreatedAt && beforeId ? { createdAt: beforeCreatedAt, id: Number(beforeId) } : undefined

  return NextResponse.json(await listAuditLog({ before }))
}
