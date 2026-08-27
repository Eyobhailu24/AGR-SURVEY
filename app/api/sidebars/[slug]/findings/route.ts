import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-guard'
import { getSidebarBySlug } from '@/lib/queries/sidebars'
import { createFinding, decodeFindingsCursor, listFindings, type FindingsSort } from '@/lib/queries/findings'
import { recordAudit } from '@/lib/audit'
import { sanitizeRichText } from '@/lib/sanitize-html'

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireRole('reader')
  if (!ctx.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { slug } = await params
  const sidebar = await getSidebarBySlug(slug)
  if (!sidebar) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const url = new URL(request.url)
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 15, 1), 100)
  const sort: FindingsSort = url.searchParams.get('sort') === 'sample_id' ? 'sample_id' : 'finding_date'
  const dir = url.searchParams.get('dir') === 'asc' ? 'asc' : 'desc'
  const cursor = decodeFindingsCursor(url.searchParams.get('cursor'))
  const sampleTypeId = url.searchParams.get('sampleTypeId')
  const measurementTypeId = url.searchParams.get('measurementTypeId')
  const dateFrom = url.searchParams.get('dateFrom')
  const dateTo = url.searchParams.get('dateTo')

  const page = await listFindings({
    sidebarId: sidebar.id,
    limit,
    cursor,
    sort,
    dir,
    sampleTypeId: sampleTypeId ? Number(sampleTypeId) : null,
    measurementTypeId: measurementTypeId ? Number(measurementTypeId) : null,
    dateFrom,
    dateTo,
  })
  return NextResponse.json(page)
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireRole('editor')
  if (!ctx.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { slug } = await params
  const sidebar = await getSidebarBySlug(slug)
  if (!sidebar) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  if (!body?.finding_date) return NextResponse.json({ error: 'finding_date is required' }, { status: 400 })

  const finding = await createFinding(
    sidebar.id,
    {
      finding_date: body.finding_date,
      sample_id: body.sample_id ?? '',
      sample_type_id: body.sample_type_id ?? null,
      measurement_type_id: body.measurement_type_id ?? null,
      measurement_group: body.measurement_group ?? '',
      values: body.values ?? {},
      apparatus: body.apparatus ?? '',
      notes: sanitizeRichText(body.notes ?? ''),
    },
    ctx.email!,
  )
  await recordAudit({
    actorEmail: ctx.email,
    actorName: ctx.name,
    action: 'finding.create',
    entityType: 'finding',
    entityId: finding.id,
    diff: { after: finding, sidebar: sidebar.slug },
  })
  return NextResponse.json(finding, { status: 201 })
}
