import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-guard'
import { getSidebarBySlug } from '@/lib/queries/sidebars'
import { deleteTextRecord } from '@/lib/queries/text-records'
import { recordAudit } from '@/lib/audit'

export async function DELETE(_request: Request, { params }: { params: Promise<{ slug: string; date: string }> }) {
  const ctx = await requireRole('editor')
  if (!ctx.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { slug, date } = await params
  const sidebar = await getSidebarBySlug(slug)
  if (!sidebar) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const deleted = await deleteTextRecord(sidebar.id, date)
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await recordAudit({
    actorEmail: ctx.email,
    actorName: ctx.name,
    action: 'text_record.delete',
    entityType: 'text_record',
    entityId: deleted.id,
    diff: { before: deleted, sidebar: sidebar.slug },
  })
  return NextResponse.json({ ok: true })
}
