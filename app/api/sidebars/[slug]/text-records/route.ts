import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-guard'
import { getSidebarBySlug } from '@/lib/queries/sidebars'
import { deleteTextRecords, getTextRecord, listTextRecords, upsertTextRecord } from '@/lib/queries/text-records'
import { recordAudit } from '@/lib/audit'
import { sanitizeRichText } from '@/lib/sanitize-html'

const MAX_BULK_IDS = 5000

// With no `date`, returns every record for this sidebar (used by the
// cards list). With `date`, returns just that one (a lighter lookup for
// callers that only need a single day).
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireRole('reader')
  if (!ctx.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { slug } = await params
  const sidebar = await getSidebarBySlug(slug)
  if (!sidebar) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const searchParams = new URL(request.url).searchParams
  const date = searchParams.get('date')
  if (!date) {
    const dir = searchParams.get('dir') === 'asc' ? 'asc' : 'desc'
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    return NextResponse.json(await listTextRecords(sidebar.id, dir, dateFrom, dateTo))
  }
  const record = await getTextRecord(sidebar.id, date)
  return NextResponse.json(record ?? { id: null, record_date: date, body: '', updated_by: null })
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireRole('editor')
  if (!ctx.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { slug } = await params
  const sidebar = await getSidebarBySlug(slug)
  if (!sidebar) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  if (!body?.record_date) return NextResponse.json({ error: 'record_date is required' }, { status: 400 })

  const record = await upsertTextRecord(sidebar.id, body.record_date, sanitizeRichText(body.body ?? ''), ctx.email!)
  await recordAudit({
    actorEmail: ctx.email,
    actorName: ctx.name,
    action: 'text_record.upsert',
    entityType: 'text_record',
    entityId: record.id,
    diff: { after: record, sidebar: sidebar.slug },
  })
  return NextResponse.json(record)
}

// Bulk delete of the records ticked in the cards list: body { ids }.
export async function DELETE(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireRole('editor')
  if (!ctx.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { slug } = await params
  const sidebar = await getSidebarBySlug(slug)
  if (!sidebar) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => null)
  const ids = Array.isArray(body?.ids) ? [...new Set((body.ids as unknown[]).map(Number))] : []
  if (ids.length === 0 || ids.length > MAX_BULK_IDS || !ids.every((id) => Number.isSafeInteger(id) && id > 0)) {
    return NextResponse.json({ error: `ids must be a list of 1–${MAX_BULK_IDS} text record ids` }, { status: 400 })
  }

  const deleted = await deleteTextRecords(sidebar.id, ids)
  if (deleted.length > 0) {
    await recordAudit({
      actorEmail: ctx.email,
      actorName: ctx.name,
      action: 'text_record.bulk_delete',
      entityType: 'sidebar',
      entityId: sidebar.id,
      diff: { sidebar: sidebar.slug, mode: 'selected', count: deleted.length, before: deleted },
    })
  }
  return NextResponse.json({ deletedCount: deleted.length })
}
