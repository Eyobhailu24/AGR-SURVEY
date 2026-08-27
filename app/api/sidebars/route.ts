import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-guard'
import { createSidebar, listSidebars, type ColumnField } from '@/lib/queries/sidebars'
import { recordAudit } from '@/lib/audit'

export async function GET() {
  const ctx = await requireRole('reader')
  if (!ctx.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await listSidebars())
}

export async function POST(request: Request) {
  const ctx = await requireRole('editor')
  if (!ctx.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  if (!body?.name || typeof body.name !== 'string') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  const columnSchema: ColumnField[] = Array.isArray(body.columnSchema) ? body.columnSchema : []

  const sidebar = await createSidebar({
    name: body.name,
    description: body.description ?? null,
    includesTextRecord: Boolean(body.includesTextRecord),
    columnSchema,
    createdBy: ctx.email!,
  })
  await recordAudit({
    actorEmail: ctx.email,
    actorName: ctx.name,
    action: 'sidebar.create',
    entityType: 'sidebar',
    entityId: sidebar.id,
    diff: { after: sidebar },
  })
  return NextResponse.json(sidebar, { status: 201 })
}
