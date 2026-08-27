import { pool } from '@/lib/db'

export type TextRecord = { id: number; record_date: string; body: string; updated_by: string | null }

export async function getTextRecord(sidebarId: number, date: string) {
  const result = await pool.query<TextRecord>(
    'select id, record_date, body, updated_by from text_records where sidebar_id = $1 and record_date = $2',
    [sidebarId, date],
  )
  return result.rows[0] ?? null
}

export async function listTextRecords(sidebarId: number) {
  const result = await pool.query<TextRecord>(
    'select id, record_date, body, updated_by from text_records where sidebar_id = $1 order by record_date desc',
    [sidebarId],
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
