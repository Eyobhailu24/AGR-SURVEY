import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-guard'
import { createMeasurementType, createSampleType, listMeasurementTypes, listSampleTypes } from '@/lib/queries/lookups'
import { recordAudit } from '@/lib/audit'

export async function GET() {
  const ctx = await requireRole('reader')
  if (!ctx.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const [sampleTypes, measurementTypes] = await Promise.all([listSampleTypes(), listMeasurementTypes()])
  return NextResponse.json({ sampleTypes, measurementTypes })
}

export async function POST(request: Request) {
  const ctx = await requireRole('editor')
  if (!ctx.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  if (body?.kind === 'sample_type' && typeof body.label === 'string' && body.label.trim()) {
    const row = await createSampleType(body.label.trim(), ctx.email!)
    await recordAudit({
      actorEmail: ctx.email,
      actorName: ctx.name,
      action: 'sample_type.create',
      entityType: 'sample_type',
      entityId: row.id,
      diff: { after: row },
    })
    return NextResponse.json(row, { status: 201 })
  }
  if (body?.kind === 'measurement_type' && typeof body.label === 'string' && body.label.trim()) {
    const row = await createMeasurementType(body.label.trim(), body.unit || null, ctx.email!)
    await recordAudit({
      actorEmail: ctx.email,
      actorName: ctx.name,
      action: 'measurement_type.create',
      entityType: 'measurement_type',
      entityId: row.id,
      diff: { after: row },
    })
    return NextResponse.json(row, { status: 201 })
  }
  return NextResponse.json({ error: 'kind must be sample_type or measurement_type, with a non-empty label' }, { status: 400 })
}
