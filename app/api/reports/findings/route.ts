import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-guard'
import { decodeReportCursor, listReportFindings } from '@/lib/queries/reports'
import type { FindingsSort } from '@/lib/queries/findings'

export async function GET(request: Request) {
  const ctx = await requireRole('reader')
  if (!ctx.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = new URL(request.url).searchParams
  const limit = Math.min(Math.max(Number(params.get('limit')) || 15, 1), 100)
  const sort: FindingsSort = params.get('sort') === 'sample_id' ? 'sample_id' : 'finding_date'
  const dir = params.get('dir') === 'asc' ? 'asc' : 'desc'
  const cursor = decodeReportCursor(params.get('cursor'))
  const sidebarId = params.get('sidebarId')
  const sampleTypeId = params.get('sampleTypeId')
  const measurementTypeId = params.get('measurementTypeId')

  const page = await listReportFindings(
    {
      sidebarId: sidebarId ? Number(sidebarId) : null,
      sampleTypeId: sampleTypeId ? Number(sampleTypeId) : null,
      measurementTypeId: measurementTypeId ? Number(measurementTypeId) : null,
      dateFrom: params.get('dateFrom'),
      dateTo: params.get('dateTo'),
    },
    { limit, cursor, sort, dir },
  )
  return NextResponse.json(page)
}
