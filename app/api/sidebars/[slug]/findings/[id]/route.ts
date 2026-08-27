import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-guard'
import { getSidebarBySlug } from '@/lib/queries/sidebars'
import { deleteFinding, updateFinding } from '@/lib/queries/findings'
import { recordAudit } from '@/lib/audit'
import { sanitizeRichText } from '@/lib/sanitize-html'

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const ctx = await requireRole('editor')
  if (!ctx.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { slug, id } = await params
  const sidebar = await getSidebarBySlug(slug)
  if (!sidebar) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  if (typeof body.notes === 'string') body.notes = sanitizeRichText(body.notes)
  const result = await updateFinding(sidebar.id, Number(id), body, ctx.email!)
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await recordAudit({
    actorEmail: ctx.email,
    actorName: ctx.name,
    action: 'finding.update',
    entityType: 'finding',
    entityId: id,
    diff: { before: result.before, after: result.row, sidebar: sidebar.slug },
  })
  return NextResponse.json(result.row)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const ctx = await requireRole('editor')
  if (!ctx.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { slug, id } = await params
  const sidebar = await getSidebarBySlug(slug)
  if (!sidebar) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const deleted = await deleteFinding(sidebar.id, Number(id))
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await recordAudit({
    actorEmail: ctx.email,
    actorName: ctx.name,
    action: 'finding.delete',
    entityType: 'finding',
    entityId: id,
    diff: { before: deleted, sidebar: sidebar.slug },
  })
  return NextResponse.json({ ok: true })
}
