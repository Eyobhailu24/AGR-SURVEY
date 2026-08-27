import { pool } from '@/lib/db'

export type LookupRow = { id: number; key: string; label: string; unit?: string | null }

export async function listSampleTypes() {
  const result = await pool.query<LookupRow>('select id, key, label from sample_types order by sort_order asc, id asc')
  return result.rows
}

export async function listMeasurementTypes() {
  const result = await pool.query<LookupRow>(
    'select id, key, label, unit from measurement_types order by sort_order asc, id asc',
  )
  return result.rows
}

function slugKey(label: string) {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '') || 'value'
}

export async function createSampleType(label: string, createdBy: string) {
  const key = slugKey(label)
  const result = await pool.query<LookupRow>(
    `insert into sample_types (key, label, sort_order, created_by)
     values ($1, $2, (select coalesce(max(sort_order), 0) + 1 from sample_types), $3)
     on conflict (key) do update set label = excluded.label
     returning id, key, label`,
    [key, label, createdBy],
  )
  return result.rows[0]
}

export async function createMeasurementType(label: string, unit: string | null, createdBy: string) {
  const key = slugKey(label)
  const result = await pool.query<LookupRow>(
    `insert into measurement_types (key, label, unit, sort_order, created_by)
     values ($1, $2, $3, (select coalesce(max(sort_order), 0) + 1 from measurement_types), $4)
     on conflict (key) do update set label = excluded.label, unit = excluded.unit
     returning id, key, label, unit`,
    [key, label, unit, createdBy],
  )
  return result.rows[0]
}
