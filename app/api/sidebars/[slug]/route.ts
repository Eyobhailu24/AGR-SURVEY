import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-guard'
import { archiveSidebar, getSidebarBySlug } from '@/lib/queries/sidebars'
import { recordAudit } from '@/lib/audit'

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireRole('reader')
  if (!ctx.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { slug } = await params
  const sidebar = await getSidebarBySlug(slug)
  if (!sidebar) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(sidebar)
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
