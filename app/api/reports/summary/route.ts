import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-guard'
import { getReportSummary } from '@/lib/queries/reports'

export async function GET(request: Request) {
  const ctx = await requireRole('reader')
  if (!ctx.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = new URL(request.url).searchParams
  const sidebarId = params.get('sidebarId')
  const sampleTypeId = params.get('sampleTypeId')
  const measurementTypeId = params.get('measurementTypeId')

  const summary = await getReportSummary({
    sidebarId: sidebarId ? Number(sidebarId) : null,
    sampleTypeId: sampleTypeId ? Number(sampleTypeId) : null,
    measurementTypeId: measurementTypeId ? Number(measurementTypeId) : null,
    dateFrom: params.get('dateFrom'),
    dateTo: params.get('dateTo'),
  })
  return NextResponse.json(summary)
}
