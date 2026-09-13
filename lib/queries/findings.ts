import { pool } from '@/lib/db'
import type { Sidebar } from '@/lib/queries/sidebars'
import {
  ISO_DATE_RE,
  NUMBER_RE,
  resolveView,
  type FindingsFilter,
  type SortDir,
  type ViewColumn,
} from '@/lib/sidebar-view'

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

/** The cross-sidebar Reports page still sorts on these two fixed fields (see lib/queries/reports.ts). */
export type FindingsSort = 'finding_date' | 'sample_id'

export type FindingsCursor = { value: string; blank: number; id: number }

export type FindingsQuery = {
  sidebar: Pick<Sidebar, 'id' | 'column_schema' | 'view_config'>
  limit: number
  cursor?: FindingsCursor | null
  /** A column id from the sidebar's view; anything not sortable falls back to the view's default sort. */
  sort?: string | null
  dir?: SortDir | null
  filters?: FindingsFilter[]
}

export type FindingsPage = { rows: Finding[]; nextCursor: string | null; totalCount: number }

const FINDING_COLUMNS =
  'id, finding_date, sample_id, sample_type_id, measurement_type_id, measurement_group, values, apparatus, notes, created_by, updated_by'
const FINDING_COLUMNS_F = FINDING_COLUMNS.split(', ')
  .map((column) => `f.${column}`)
  .join(', ')

// Route handlers clamp their own page size; this only stops one export
// request from running away.
const MAX_LIMIT = 20000

export function encodeFindingsCursor(cursor: FindingsCursor): string {
  return Buffer.from(JSON.stringify({ v: cursor.value, b: cursor.blank, id: cursor.id })).toString('base64url')
}

export function decodeFindingsCursor(raw: string | null): FindingsCursor | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
    if (typeof parsed.v !== 'string' || !Number.isInteger(parsed.id)) return null
    return { value: parsed.v, blank: parsed.b === 1 ? 1 : 0, id: parsed.id }
  } catch {
    return null
  }
}

type Push = (value: unknown) => string

// Same "several replicates in one cell" convention as lib/queries/measurements.ts:
// a number cell like "150, 170, 190" sorts and filters by its first reading,
// and anything non-numeric counts as blank rather than failing the cast.
function firstNumber(raw: string) {
  const first = `trim(split_part(${raw}, ',', 1))`
  return `(case when ${first} ~ '^-?[0-9]+([.][0-9]+)?$' then ${first}::numeric end)`
}

function customRaw(column: ViewColumn, push: Push) {
  return `coalesce(f.values ->> ${push(column.field!.key)}, '')`
}

function lookupLabel(builtin: 'sample_type' | 'measurement_type') {
  return builtin === 'sample_type'
    ? `coalesce((select st.label from sample_types st where st.id = f.sample_type_id), '')`
    : `coalesce((select mt.label from measurement_types mt where mt.id = f.measurement_type_id), '')`
}

/**
 * `value` is what rows are ordered by; `blank` (0/1) sorts empty cells after
 * filled ones in both directions. Both are non-null so the keyset
 * comparison below stays exact.
 */
function sortExpression(column: ViewColumn, push: Push): { value: string; blank: string; cast: 'date' | 'numeric' | 'text' } {
  switch (column.builtin) {
    case 'finding_date':
      // Cast, not a bare `0`: ORDER BY reads a bare integer literal as a column position.
      return { value: 'f.finding_date', blank: '0::int', cast: 'date' }
    case 'sample_type':
    case 'measurement_type': {
      const label = lookupLabel(column.builtin)
      return { value: label, blank: `(${label} = '')::int`, cast: 'text' }
    }
    case 'sample_id':
    case 'measurement_group':
    case 'apparatus':
    case 'notes':
      return { value: `f.${column.builtin}`, blank: `(f.${column.builtin} = '')::int`, cast: 'text' }
  }
  const raw = customRaw(column, push)
  if (column.kind === 'number') {
    const num = firstNumber(raw)
    return { value: `coalesce(${num}, 0)`, blank: `(${num} is null)::int`, cast: 'numeric' }
  }
  return { value: `trim(${raw})`, blank: `(trim(${raw}) = '')::int`, cast: 'text' }
}

function likePattern(value: string) {
  return `%${value.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
}

function filterClauses(column: ViewColumn, filter: FindingsFilter, push: Push): string[] {
  const parts: string[] = []
  switch (column.builtin) {
    case 'finding_date':
      if (filter.from) parts.push(`f.finding_date >= ${push(filter.from)}::date`)
      if (filter.to) parts.push(`f.finding_date <= ${push(filter.to)}::date`)
      return parts
    case 'sample_type':
      return filter.value ? [`f.sample_type_id = ${push(Number(filter.value))}`] : []
    case 'measurement_type':
      return filter.value ? [`f.measurement_type_id = ${push(Number(filter.value))}`] : []
    case 'sample_id':
    case 'measurement_group':
    case 'apparatus':
    case 'notes':
      return filter.value ? [`f.${column.builtin} ilike ${push(likePattern(filter.value))}`] : []
  }

  const raw = customRaw(column, push)
  if (column.kind === 'number') {
    const num = firstNumber(raw)
    if (filter.from) parts.push(`${num} >= ${push(filter.from)}::numeric`)
    if (filter.to) parts.push(`${num} <= ${push(filter.to)}::numeric`)
  } else if (column.kind === 'date') {
    // Date cells are stored as YYYY-MM-DD text, which compares correctly as text.
    if (filter.from) parts.push(`nullif(trim(${raw}), '') >= ${push(filter.from)}`)
    if (filter.to) parts.push(`nullif(trim(${raw}), '') <= ${push(filter.to)}`)
  } else if (column.kind === 'select') {
    if (filter.value) parts.push(`trim(${raw}) = ${push(filter.value)}`)
  } else if (filter.value) {
    parts.push(`${raw} ilike ${push(likePattern(filter.value))}`)
  }
  return parts
}

function cursorMatches(cursor: FindingsCursor, cast: 'date' | 'numeric' | 'text') {
  if (cast === 'date') return ISO_DATE_RE.test(cursor.value)
  if (cast === 'numeric') return NUMBER_RE.test(cursor.value)
  return true
}

/** The WHERE clause for one sidebar's findings under the table's filters — shared by listing and "delete all matching". */
function filteredWhere(sidebarId: number, view: ReturnType<typeof resolveView>, filters: FindingsFilter[] = []) {
  const params: unknown[] = [sidebarId]
  const push: Push = (value) => {
    params.push(value)
    return `$${params.length}`
  }
  const whereParts = ['f.sidebar_id = $1']
  for (const filter of filters) {
    const column = view.columns.find((c) => c.id === filter.column && c.filterable)
    if (column) whereParts.push(...filterClauses(column, filter, push))
  }
  return { params, push, whereParts }
}

/** Deletes the given findings — only ones that belong to this sidebar — and returns the deleted rows. */
export async function deleteFindings(sidebarId: number, ids: number[]) {
  const result = await pool.query<Finding>(
    `delete from findings where sidebar_id = $1 and id = any($2::bigint[]) returning ${FINDING_COLUMNS}`,
    [sidebarId, ids],
  )
  return result.rows
}

/**
 * Deletes every finding matching the filters (every finding in the sidebar
 * when there are none) — but only if that is still exactly the
 * `expectedCount` rows the user confirmed. The matching rows are locked
 * first and deleted by id, so a row added or removed in the meantime turns
 * into a conflict instead of being deleted unseen.
 */
export async function deleteMatchingFindings(
  sidebar: FindingsQuery['sidebar'],
  filters: FindingsFilter[],
  expectedCount: number,
): Promise<{ ok: true; rows: Finding[] } | { ok: false; count: number }> {
  const { params, whereParts } = filteredWhere(sidebar.id, resolveView(sidebar), filters)
  const client = await pool.connect()
  try {
    await client.query('begin')
    const matching = await client.query<{ id: string }>(
      `select f.id from findings f where ${whereParts.join(' and ')} for update`,
      params,
    )
    if (matching.rows.length !== expectedCount) {
      await client.query('rollback')
      return { ok: false, count: matching.rows.length }
    }
    const result = await client.query<Finding>(
      `delete from findings where sidebar_id = $1 and id = any($2::bigint[]) returning ${FINDING_COLUMNS}`,
      [sidebar.id, matching.rows.map((r) => r.id)],
    )
    await client.query('commit')
    return { ok: true, rows: result.rows }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

// Keyset (not offset) pagination on purpose — doesn't skip/duplicate rows
// under concurrent inserts the way OFFSET does, and the default date sort
// stays index-backed. Sort and filter columns come only from the sidebar's
// resolved view (never from raw input), and every value — including jsonb
// keys — is passed as a bind parameter.
export async function listFindings(query: FindingsQuery): Promise<FindingsPage> {
  const view = resolveView(query.sidebar)
  const limit = Math.min(Math.max(query.limit, 1), MAX_LIMIT)
  const requested = view.columns.find((c) => c.id === query.sort && c.sortable)
  const sortColumn = requested ?? view.columns.find((c) => c.id === view.defaultSort.column)!
  const dir: SortDir = requested && query.dir ? query.dir : view.defaultSort.dir

  const { params, push, whereParts } = filteredWhere(query.sidebar.id, view, query.filters)

  const countResult = await pool.query<{ count: string }>(
    `select count(*)::text as count from findings f where ${whereParts.join(' and ')}`,
    [...params],
  )

  const expr = sortExpression(sortColumn, push)
  if (query.cursor && cursorMatches(query.cursor, expr.cast)) {
    const blank = push(query.cursor.blank)
    const value = push(query.cursor.value)
    const id = push(query.cursor.id)
    const op = dir === 'asc' ? '>' : '<'
    whereParts.push(
      `(${expr.blank} > ${blank}::int or (${expr.blank} = ${blank}::int and (${expr.value}, f.id) ${op} (${value}::${expr.cast}, ${id}::bigint)))`,
    )
  }
  const limitParam = push(limit)

  const result = await pool.query<Finding & { sort_value: string; sort_blank: number }>(
    `select ${FINDING_COLUMNS_F}, (${expr.value})::text as sort_value, ${expr.blank} as sort_blank
     from findings f
     where ${whereParts.join(' and ')}
     order by ${expr.blank} asc, ${expr.value} ${dir}, f.id ${dir}
     limit ${limitParam}`,
    params,
  )

  const last = result.rows[result.rows.length - 1]
  const nextCursor =
    result.rows.length === limit && last
      ? encodeFindingsCursor({ value: last.sort_value, blank: Number(last.sort_blank), id: Number(last.id) })
      : null
  const rows = result.rows.map(({ sort_value: _value, sort_blank: _blank, ...row }) => row)

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
