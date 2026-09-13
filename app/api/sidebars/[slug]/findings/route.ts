import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-guard'
import { getSidebarBySlug } from '@/lib/queries/sidebars'
import {
  createFinding,
  decodeFindingsCursor,
  deleteFindings,
  deleteMatchingFindings,
  listFindings,
  type Finding,
} from '@/lib/queries/findings'
import { resolveView, sanitizeFilters, type FindingsFilter } from '@/lib/sidebar-view'
import { recordAudit } from '@/lib/audit'
import { sanitizeRichText } from '@/lib/sanitize-html'

const MAX_BULK_IDS = 5000

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

function parseIds(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null
  const ids = [...new Set(raw.map(Number))]
  if (ids.length === 0 || ids.length > MAX_BULK_IDS) return null
  return ids.every((id) => Number.isSafeInteger(id) && id > 0) ? ids : null
}

// Bulk delete. The body is either { ids } — rows ticked in the table — or
// { allMatching: true, filters, expectedCount } for "select all N matching",
// where expectedCount is the number the user confirmed.
export async function DELETE(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireRole('editor')
  if (!ctx.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { slug } = await params
  const sidebar = await getSidebarBySlug(slug)
  if (!sidebar) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => null)
  let deleted: Finding[]
  let filters: FindingsFilter[] = []
  const mode = body?.allMatching === true ? 'all-matching' : 'selected'

  if (mode === 'all-matching') {
    const expectedCount = Number(body.expectedCount)
    if (!Number.isSafeInteger(expectedCount) || expectedCount < 1) {
      return NextResponse.json({ error: 'expectedCount is required' }, { status: 400 })
    }
    filters = sanitizeFilters(body.filters, resolveView(sidebar))
    const result = await deleteMatchingFindings(sidebar, filters, expectedCount)
    if (!result.ok) {
      return NextResponse.json(
        {
          error: `Nothing was deleted: ${result.count} findings match now, not the ${expectedCount} you confirmed. The table has been refreshed — check it and try again.`,
        },
        { status: 409 },
      )
    }
    deleted = result.rows
  } else {
    const ids = parseIds(body?.ids)
    if (!ids) return NextResponse.json({ error: `ids must be a list of 1–${MAX_BULK_IDS} finding ids` }, { status: 400 })
    deleted = await deleteFindings(sidebar.id, ids)
  }

  if (deleted.length > 0) {
    await recordAudit({
      actorEmail: ctx.email,
      actorName: ctx.name,
      action: 'finding.bulk_delete',
      entityType: 'sidebar',
      entityId: sidebar.id,
      // The deleted rows themselves are kept here, so a mistaken bulk delete
      // can still be reconstructed from the audit log.
      diff: { sidebar: sidebar.slug, mode, filters, count: deleted.length, before: deleted },
    })
  }
  return NextResponse.json({ deletedCount: deleted.length })
}
