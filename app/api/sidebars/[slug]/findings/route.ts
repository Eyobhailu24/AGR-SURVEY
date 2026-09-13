import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-guard'
import { getSidebarBySlug } from '@/lib/queries/sidebars'
import { createFinding, decodeFindingsCursor, listFindings } from '@/lib/queries/findings'
import { resolveView, sanitizeFilters } from '@/lib/sidebar-view'
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
  const dirParam = url.searchParams.get('dir')
  const cursor = decodeFindingsCursor(url.searchParams.get('cursor'))
  // `filters` is a JSON array of { column, value?, from?, to? } — see
  // sanitizeFilters for what survives.
  let rawFilters: unknown = []
  try {
    rawFilters = JSON.parse(url.searchParams.get('filters') ?? '[]')
  } catch {
    // Malformed filters are ignored rather than failing the whole page.
  }

  const page = await listFindings({
    sidebar,
    limit,
    cursor,
    sort: url.searchParams.get('sort'),
    dir: dirParam === 'asc' || dirParam === 'desc' ? dirParam : null,
    filters: sanitizeFilters(rawFilters, resolveView(sidebar)),
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
