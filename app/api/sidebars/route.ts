import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-guard'
import { createSidebar, listSidebars, type ColumnField } from '@/lib/queries/sidebars'
import { buildSidebarLayout, type SidebarViewConfig } from '@/lib/sidebar-view'
import { recordAudit } from '@/lib/audit'

export async function GET() {
  const ctx = await requireRole('reader')
  if (!ctx.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await listSidebars())
}

export async function POST(request: Request) {
  const ctx = await requireRole('editor')
  if (!ctx.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null)
  if (typeof body?.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  const notesOnly = Boolean(body.notesOnly)

  let columnSchema: ColumnField[] = []
  let viewConfig: SidebarViewConfig | null = null
  if (!notesOnly) {
    const layout = buildSidebarLayout(body, { existingSchema: [] })
    if (!layout.ok) return NextResponse.json({ error: layout.error }, { status: 400 })
    columnSchema = layout.columnSchema
    viewConfig = layout.viewConfig
  }

  const sidebar = await createSidebar({
    name: body.name.trim(),
    description: typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null,
    includesTextRecord: Boolean(body.includesTextRecord),
    notesOnly,
    columnSchema,
    viewConfig,
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
