import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-guard'
import { getSidebarBySlug } from '@/lib/queries/sidebars'
import { listMeasurementTypes, listSampleTypes } from '@/lib/queries/lookups'
import { createFinding } from '@/lib/queries/findings'
import { resolveImportRows } from '@/lib/import/resolve-rows'
import { recordAudit } from '@/lib/audit'

// Two-phase on purpose: commit:false only validates and returns a per-row
// report (never writes), commit:true actually inserts. The client always
// calls with commit:false first and shows the report before letting the
// user confirm — see components/import-csv-dialog.tsx.
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireRole('editor')
  if (!ctx.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { slug } = await params
  const sidebar = await getSidebarBySlug(slug)
  if (!sidebar) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const commit: boolean = Boolean(body.commit)
  const rawRows: unknown[] = Array.isArray(body.rows) ? body.rows : []
  if (rawRows.length === 0) return NextResponse.json({ error: 'No rows to import' }, { status: 400 })
  if (rawRows.length > 5000) return NextResponse.json({ error: 'Too many rows in one import (max 5000)' }, { status: 400 })

  const [sampleTypes, measurementTypes] = await Promise.all([listSampleTypes(), listMeasurementTypes()])
  const results = resolveImportRows(sidebar, rawRows, sampleTypes, measurementTypes)

  if (!commit) {
    return NextResponse.json({
      validCount: results.filter((r) => r.ok).length,
      invalidCount: results.filter((r) => !r.ok).length,
      results,
    })
  }

  const validRows = results.filter((r) => r.ok)
  const inserted = []
  for (const r of validRows) {
    if (r.ok) inserted.push(await createFinding(sidebar.id, r.row, ctx.email!))
  }

  await recordAudit({
    actorEmail: ctx.email,
    actorName: ctx.name,
    action: 'import.csv',
    entityType: 'sidebar',
    entityId: sidebar.id,
    diff: { insertedCount: inserted.length, skippedCount: results.length - inserted.length, sidebar: sidebar.slug },
  })
  return NextResponse.json({ insertedCount: inserted.length })
}
