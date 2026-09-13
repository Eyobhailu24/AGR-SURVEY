import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-guard'
import { getSidebarBySlug } from '@/lib/queries/sidebars'
import { listFindings } from '@/lib/queries/findings'
import { resolveView, sanitizeFilters } from '@/lib/sidebar-view'
import { listMeasurementTypes, listSampleTypes } from '@/lib/queries/lookups'
import { listTextRecords } from '@/lib/queries/text-records'
import { buildExportTable, buildTextRecordsExportTable, type ExportTable } from '@/lib/export/build-rows'
import { toCsv, toDocxBuffer, toXlsxBuffer } from '@/lib/export/formats'
import { createGoogleDoc, createGoogleSheet } from '@/lib/export/google'
import { getGoogleAccessToken } from '@/lib/google-token'
import { recordAudit } from '@/lib/audit'

// Findings tables are paginated at 15/page for browsing, but export always
// needs "everything matching the current view" (scope: 'view') or
// "everything, ignoring filters" (scope: 'all') — so this re-runs the same
// listFindings query the table uses, just unbounded (capped generously
// rather than truly unbounded, so one export request can't run away).
const ALL_ROWS_CAP = 20000

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireRole('reader')
  if (!ctx.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { slug } = await params
  const sidebar = await getSidebarBySlug(slug)
  if (!sidebar) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const format: string = body.format
  // Word and Google Doc are for the free-form text records (one entry per
  // date); CSV/Excel/Google Sheet are for the findings grid — see
  // components/export-menu.tsx, which only offers the matching subset per
  // trigger, but the server stays authoritative on the mapping.
  const kind: 'findings' | 'text-records' = format === 'docx' || format === 'google-doc' ? 'text-records' : 'findings'
  const scope: 'view' | 'all' = body.scope === 'all' ? 'all' : 'view'
  const sort = typeof body.sort === 'string' ? body.sort : null
  const dir: 'asc' | 'desc' = body.dir === 'asc' ? 'asc' : 'desc'
  // Findings filters follow the sidebar's own filterable columns; the date
  // range below is only the text-records list's filter.
  const filters = scope === 'view' ? sanitizeFilters(body.filters, resolveView(sidebar)) : []
  const dateFrom = body.dateFrom ? String(body.dateFrom) : null
  const dateTo = body.dateTo ? String(body.dateTo) : null

  let table: ExportTable
  if (kind === 'text-records') {
    if (!sidebar.includes_text_record) {
      return NextResponse.json({ error: 'This sidebar has no text records to export' }, { status: 400 })
    }
    // Text records only ever have one meaningful order (by date) — reuse
    // whichever direction the findings table is currently sorted in.
    const records = await listTextRecords(sidebar.id, dir, dateFrom, dateTo)
    table = buildTextRecordsExportTable(sidebar, records)
  } else {
    const page = await listFindings({ sidebar, limit: ALL_ROWS_CAP, sort, dir, filters })
    const [sampleTypes, measurementTypes] = await Promise.all([listSampleTypes(), listMeasurementTypes()])
    table = buildExportTable(sidebar, page.rows, sampleTypes, measurementTypes)
  }

  async function logExport(extra?: Record<string, unknown>) {
    await recordAudit({
      actorEmail: ctx.email,
      actorName: ctx.name,
      action: 'export',
      entityType: 'sidebar',
      entityId: sidebar!.id,
      diff: { format, kind, scope, rowCount: table.rows.length, sidebar: sidebar!.slug, ...extra },
    })
  }

  try {
    switch (format) {
      case 'csv': {
        await logExport()
        return new NextResponse(toCsv(table), {
          headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': `attachment; filename="${sidebar.slug}.csv"`,
          },
        })
      }
      case 'xlsx': {
        const buffer = await toXlsxBuffer(table)
        await logExport()
        return new NextResponse(buffer, {
          headers: {
            'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'content-disposition': `attachment; filename="${sidebar.slug}.xlsx"`,
          },
        })
      }
      case 'docx': {
        const buffer = await toDocxBuffer(table)
        await logExport()
        return new NextResponse(buffer, {
          headers: {
            'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'content-disposition': `attachment; filename="${sidebar.slug}.docx"`,
          },
        })
      }
      case 'google-sheet':
      case 'google-doc': {
        const accessToken = await getGoogleAccessToken(ctx.email!)
        const url =
          format === 'google-sheet' ? await createGoogleSheet(accessToken, table) : await createGoogleDoc(accessToken, table)
        await logExport({ url })
        return NextResponse.json({ url })
      }
      default:
        return NextResponse.json({ error: 'Unknown export format' }, { status: 400 })
    }
  } catch (error) {
    console.error('[export]', error)
    const message = error instanceof Error ? error.message : 'Export failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
