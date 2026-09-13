import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-guard'
import { archiveSidebar, getSidebarBySlug, listUsedValueKeys, updateSidebar } from '@/lib/queries/sidebars'
import { buildSidebarLayout } from '@/lib/sidebar-view'
import { recordAudit } from '@/lib/audit'

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireRole('reader')
  if (!ctx.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { slug } = await params
  const sidebar = await getSidebarBySlug(slug)
  if (!sidebar) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(sidebar)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireRole('editor')
  if (!ctx.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { slug } = await params
  const sidebar = await getSidebarBySlug(slug)
  if (!sidebar || sidebar.is_archived) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => null)
  if (typeof body?.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  const notesOnly = Boolean(body.notesOnly)

  // Switching to notes-only just hides the findings grid — the column layout
  // is left untouched so switching back restores it.
  let columnSchema = sidebar.column_schema
  let viewConfig = sidebar.view_config
  if (!notesOnly) {
    const layout = buildSidebarLayout(body, {
      existingSchema: sidebar.column_schema,
      reservedKeys: await listUsedValueKeys(sidebar.id),
    })
    if (!layout.ok) return NextResponse.json({ error: layout.error }, { status: 400 })
    columnSchema = layout.columnSchema
    viewConfig = layout.viewConfig
  }

  const updated = await updateSidebar(sidebar.id, {
    name: body.name.trim(),
    description: typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null,
    includesTextRecord: Boolean(body.includesTextRecord),
    notesOnly,
    columnSchema,
    viewConfig,
  })
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await recordAudit({
    actorEmail: ctx.email,
    actorName: ctx.name,
    action: 'sidebar.update',
    entityType: 'sidebar',
    entityId: sidebar.id,
    diff: { before: sidebar, after: updated, sidebar: sidebar.slug },
  })
  return NextResponse.json(updated)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireRole('editor')
  if (!ctx.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { slug } = await params
  const sidebar = await getSidebarBySlug(slug)
  if (!sidebar) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await archiveSidebar(slug)
  await recordAudit({
    actorEmail: ctx.email,
    actorName: ctx.name,
    action: 'sidebar.archive',
    entityType: 'sidebar',
    entityId: sidebar.id,
    diff: { before: sidebar },
  })
  return NextResponse.json({ ok: true })
}
