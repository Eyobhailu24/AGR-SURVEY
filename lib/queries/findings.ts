import { pool } from '@/lib/db'

export type Finding = {
  id: number
  finding_date: string
  sample_id: string
  sample_type_id: number | null
  measurement_type_id: number | null
  measurement_group: string
  values: Record<string, string>
  apparatus: string
  notes: string
  created_by: string | null
  updated_by: string | null
}

export type FindingsSort = 'finding_date' | 'sample_id'

export type FindingsQuery = {
  sidebarId: number
  limit: number
  cursor?: { value: string; id: number } | null
  sort?: FindingsSort
  dir?: 'asc' | 'desc'
  sampleTypeId?: number | null
  measurementTypeId?: number | null
  dateFrom?: string | null
  dateTo?: string | null
}

export type FindingsPage = { rows: Finding[]; nextCursor: string | null; totalCount: number }

const FINDING_COLUMNS =
  'id, finding_date, sample_id, sample_type_id, measurement_type_id, measurement_group, values, apparatus, notes, created_by, updated_by'

export function encodeFindingsCursor(row: Finding, sort: FindingsSort): string {
  const value = sort === 'sample_id' ? row.sample_id : row.finding_date
  return Buffer.from(JSON.stringify({ v: value, id: row.id })).toString('base64url')
}

export function decodeFindingsCursor(raw: string | null): { value: string; id: number } | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
    if (typeof parsed.v !== 'string' && typeof parsed.v !== 'number') return null
    return { value: String(parsed.v), id: Number(parsed.id) }
  } catch {
    return null
  }
}

// Keyset (not offset) pagination on purpose — stays index-backed no matter
// how deep you page, and doesn't skip/duplicate rows under concurrent
// inserts the way OFFSET does. Sorting is intentionally limited to
// finding_date and sample_id: both are indexed and not-null; sample_type_id
// / measurement_type_id are filters here rather than sortable columns,
// since they're nullable FKs and a null-safe keyset comparator for them
// isn't worth the complexity this data size doesn't need yet.
export async function listFindings(query: FindingsQuery): Promise<FindingsPage> {
  const sidebarId = query.sidebarId
  const limit = Math.min(Math.max(query.limit, 1), 100)
  const sort: FindingsSort = query.sort === 'sample_id' ? 'sample_id' : 'finding_date'
  const dir = query.dir === 'asc' ? 'asc' : 'desc'
  const sortColumn = sort === 'sample_id' ? 'sample_id' : 'finding_date'
  const compareOp = dir === 'asc' ? '>' : '<'

  const whereParts = ['sidebar_id = $1']
  const params: unknown[] = [sidebarId]

  if (query.sampleTypeId != null) {
    params.push(query.sampleTypeId)
    whereParts.push(`sample_type_id = $${params.length}`)
  }
  if (query.measurementTypeId != null) {
    params.push(query.measurementTypeId)
    whereParts.push(`measurement_type_id = $${params.length}`)
  }
  if (query.dateFrom) {
    params.push(query.dateFrom)
    whereParts.push(`finding_date >= $${params.length}`)
  }
  if (query.dateTo) {
    params.push(query.dateTo)
    whereParts.push(`finding_date <= $${params.length}`)
  }

  const countResult = await pool.query<{ count: string }>(
    `select count(*)::text as count from findings where ${whereParts.join(' and ')}`,
    params,
  )

  if (query.cursor) {
    params.push(query.cursor.value)
    const valueParamIndex = params.length
    params.push(query.cursor.id)
    const idParamIndex = params.length
    whereParts.push(`(${sortColumn}, id) ${compareOp} ($${valueParamIndex}, $${idParamIndex})`)
  }

  params.push(limit)
  const limitParamIndex = params.length

  const result = await pool.query<Finding>(
    `select ${FINDING_COLUMNS} from findings
     where ${whereParts.join(' and ')}
     order by ${sortColumn} ${dir}, id ${dir}
     limit $${limitParamIndex}`,
    params,
  )

  const rows = result.rows
  const last = rows[rows.length - 1]
  const nextCursor = rows.length === limit && last ? encodeFindingsCursor(last, sort) : null

  return { rows, nextCursor, totalCount: Number(countResult.rows[0].count) }
}

export async function createFinding(
  sidebarId: number,
  input: Omit<Finding, 'id' | 'created_by' | 'updated_by'>,
  actor: string,
) {
  const result = await pool.query<Finding>(
    `insert into findings
       (sidebar_id, finding_date, sample_id, sample_type_id, measurement_type_id, measurement_group, values, apparatus, notes, created_by, updated_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
     returning ${FINDING_COLUMNS}`,
    [
      sidebarId,
      input.finding_date,
      input.sample_id,
      input.sample_type_id,
      input.measurement_type_id,
      input.measurement_group,
      input.values,
      input.apparatus,
      input.notes,
      actor,
    ],
  )
  return result.rows[0]
}

export async function updateFinding(
  sidebarId: number,
  id: number,
  patch: Partial<Omit<Finding, 'id' | 'created_by' | 'updated_by'>>,
  actor: string,
) {
  const existing = await pool.query<Finding>(`select ${FINDING_COLUMNS} from findings where id = $1 and sidebar_id = $2`, [
    id,
    sidebarId,
  ])
  if (existing.rows.length === 0) return null
  const merged = { ...existing.rows[0], ...patch }
  const result = await pool.query<Finding>(
    `update findings set
       finding_date=$1, sample_id=$2, sample_type_id=$3, measurement_type_id=$4,
       measurement_group=$5, values=$6, apparatus=$7, notes=$8, updated_by=$9, updated_at=now()
     where id=$10 and sidebar_id=$11
     returning ${FINDING_COLUMNS}`,
    [
      merged.finding_date,
      merged.sample_id,
      merged.sample_type_id,
      merged.measurement_type_id,
      merged.measurement_group,
      merged.values,
      merged.apparatus,
      merged.notes,
      actor,
      id,
      sidebarId,
    ],
  )
  return { row: result.rows[0], before: existing.rows[0] }
}

export async function deleteFinding(sidebarId: number, id: number) {
  const existing = await pool.query<Finding>(`select ${FINDING_COLUMNS} from findings where id = $1 and sidebar_id = $2`, [
    id,
    sidebarId,
  ])
  if (existing.rows.length === 0) return null
  await pool.query('delete from findings where id = $1 and sidebar_id = $2', [id, sidebarId])
  return existing.rows[0]
}
