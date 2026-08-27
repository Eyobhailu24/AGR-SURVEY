import { pool } from '@/lib/db'

export type TextRecord = { id: number; record_date: string; body: string; updated_by: string | null }

export async function getTextRecord(sidebarId: number, date: string) {
  const result = await pool.query<TextRecord>(
    'select id, record_date, body, updated_by from text_records where sidebar_id = $1 and record_date = $2',
    [sidebarId, date],
  )
  return result.rows[0] ?? null
}

export async function listTextRecords(
  sidebarId: number,
  dir: 'asc' | 'desc' = 'desc',
  dateFrom?: string | null,
  dateTo?: string | null,
) {
  const whereParts = ['sidebar_id = $1']
  const params: unknown[] = [sidebarId]
  if (dateFrom) {
    params.push(dateFrom)
    whereParts.push(`record_date >= $${params.length}`)
  }
  if (dateTo) {
    params.push(dateTo)
    whereParts.push(`record_date <= $${params.length}`)
  }
  const result = await pool.query<TextRecord>(
    `select id, record_date, body, updated_by from text_records
     where ${whereParts.join(' and ')}
     order by record_date ${dir === 'asc' ? 'asc' : 'desc'}`,
    params,
  )
  return result.rows
}

export async function upsertTextRecord(sidebarId: number, date: string, body: string, actor: string) {
  const result = await pool.query<TextRecord>(
    `insert into text_records (sidebar_id, record_date, body, created_by, updated_by)
     values ($1,$2,$3,$4,$4)
     on conflict (sidebar_id, record_date) do update set body = excluded.body, updated_by = excluded.updated_by, updated_at = now()
     returning id, record_date, body, updated_by`,
    [sidebarId, date, body, actor],
  )
  return result.rows[0]
}

export async function deleteTextRecord(sidebarId: number, date: string) {
  const existing = await pool.query<TextRecord>(
    'select id, record_date, body, updated_by from text_records where sidebar_id = $1 and record_date = $2',
    [sidebarId, date],
  )
  if (existing.rows.length === 0) return null
  await pool.query('delete from text_records where sidebar_id = $1 and record_date = $2', [sidebarId, date])
  return existing.rows[0]
}
