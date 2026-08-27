import { pool } from '@/lib/db'
import type { FindingsSort } from '@/lib/queries/findings'

export type ReportFilters = {
  sidebarId?: number | null
  sampleTypeId?: number | null
  measurementTypeId?: number | null
  dateFrom?: string | null
  dateTo?: string | null
}

export type ReportSummary = {
  totalFindings: number
  totalTextRecords: number
  dateRange: { min: string | null; max: string | null }
  bySidebar: { id: number; name: string; count: number }[]
  bySampleType: { id: number; label: string; count: number }[]
  byMeasurementType: { id: number; label: string; count: number }[]
  overTime: { date: string; count: number }[]
  overTimeBySidebar: { series: { id: number; name: string }[]; points: Record<string, string | number>[] }
}

// Every findings-bearing (non notes-only) sidebar, joined in so counts can be
// broken down and labeled by test name. All real data — nothing here is
// seeded or hardcoded beyond the WHERE clause built from the filters below.
function buildFindingsWhere(filters: ReportFilters, params: unknown[]) {
  const parts = ['s.notes_only = false', 's.is_archived = false']
  if (filters.sidebarId != null) {
    params.push(filters.sidebarId)
    parts.push(`f.sidebar_id = $${params.length}`)
  }
  if (filters.sampleTypeId != null) {
    params.push(filters.sampleTypeId)
    parts.push(`f.sample_type_id = $${params.length}`)
  }
  if (filters.measurementTypeId != null) {
    params.push(filters.measurementTypeId)
    parts.push(`f.measurement_type_id = $${params.length}`)
  }
  if (filters.dateFrom) {
    params.push(filters.dateFrom)
    parts.push(`f.finding_date >= $${params.length}`)
  }
  if (filters.dateTo) {
    params.push(filters.dateTo)
    parts.push(`f.finding_date <= $${params.length}`)
  }
  return parts.join(' and ')
}

// Text records don't have sample/measurement type, so only the
// sidebar/date-range part of the filter applies to this count.
async function countTextRecords(filters: ReportFilters) {
  const params: unknown[] = []
  const parts = ['s.notes_only = false', 's.is_archived = false']
  if (filters.sidebarId != null) {
    params.push(filters.sidebarId)
    parts.push(`tr.sidebar_id = $${params.length}`)
  }
  if (filters.dateFrom) {
    params.push(filters.dateFrom)
    parts.push(`tr.record_date >= $${params.length}`)
  }
  if (filters.dateTo) {
    params.push(filters.dateTo)
    parts.push(`tr.record_date <= $${params.length}`)
  }
  const result = await pool.query<{ count: string }>(
    `select count(*)::text as count from text_records tr join sidebars s on tr.sidebar_id = s.id where ${parts.join(' and ')}`,
    params,
  )
  return Number(result.rows[0]?.count ?? 0)
}

export async function getReportSummary(filters: ReportFilters): Promise<ReportSummary> {
  const params: unknown[] = []
  const where = buildFindingsWhere(filters, params)

  const [totalResult, dateRangeResult, bySidebarResult, bySampleTypeResult, byMeasurementTypeResult, overTimeResult, overTimeBySidebarResult, totalTextRecords] =
    await Promise.all([
      pool.query<{ count: string }>(
        `select count(*)::text as count from findings f join sidebars s on f.sidebar_id = s.id where ${where}`,
        params,
      ),
      pool.query<{ min: string | null; max: string | null }>(
        `select min(f.finding_date)::text as min, max(f.finding_date)::text as max
         from findings f join sidebars s on f.sidebar_id = s.id where ${where}`,
        params,
      ),
      pool.query<{ id: number; name: string; count: string }>(
        `select s.id, s.name, count(*)::text as count
         from findings f join sidebars s on f.sidebar_id = s.id where ${where}
         group by s.id, s.name order by count(*) desc`,
        params,
      ),
      pool.query<{ id: number; label: string; count: string }>(
        `select st.id, st.label, count(*)::text as count
         from findings f join sidebars s on f.sidebar_id = s.id join sample_types st on f.sample_type_id = st.id
         where ${where} group by st.id, st.label order by count(*) desc`,
        params,
      ),
      pool.query<{ id: number; label: string; count: string }>(
        `select mt.id, mt.label, count(*)::text as count
         from findings f join sidebars s on f.sidebar_id = s.id join measurement_types mt on f.measurement_type_id = mt.id
         where ${where} group by mt.id, mt.label order by count(*) desc`,
        params,
      ),
      pool.query<{ date: string; count: string }>(
        `select f.finding_date::text as date, count(*)::text as count
         from findings f join sidebars s on f.sidebar_id = s.id where ${where}
         group by f.finding_date order by f.finding_date asc`,
        params,
      ),
      pool.query<{ date: string; sidebar_id: number; sidebar_name: string; count: string }>(
        `select f.finding_date::text as date, s.id as sidebar_id, s.name as sidebar_name, count(*)::text as count
         from findings f join sidebars s on f.sidebar_id = s.id where ${where}
         group by f.finding_date, s.id, s.name order by f.finding_date asc`,
        params,
      ),
      countTextRecords(filters),
    ])

  // Pivot the per-sidebar-per-day counts into one row per date with a column
  // per sidebar, which is the shape Recharts wants for a multi-line chart.
  const seriesMap = new Map<number, string>()
  const pointsByDate = new Map<string, Record<string, string | number>>()
  for (const row of overTimeBySidebarResult.rows) {
    seriesMap.set(row.sidebar_id, row.sidebar_name)
    const point = pointsByDate.get(row.date) ?? { date: row.date }
    point[String(row.sidebar_id)] = Number(row.count)
    pointsByDate.set(row.date, point)
  }
  const series = Array.from(seriesMap.entries()).map(([id, name]) => ({ id, name }))
  const points = Array.from(pointsByDate.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)))

  return {
    totalFindings: Number(totalResult.rows[0]?.count ?? 0),
    totalTextRecords,
    dateRange: { min: dateRangeResult.rows[0]?.min ?? null, max: dateRangeResult.rows[0]?.max ?? null },
    bySidebar: bySidebarResult.rows.map((r) => ({ id: r.id, name: r.name, count: Number(r.count) })),
    bySampleType: bySampleTypeResult.rows.map((r) => ({ id: r.id, label: r.label, count: Number(r.count) })),
    byMeasurementType: byMeasurementTypeResult.rows.map((r) => ({ id: r.id, label: r.label, count: Number(r.count) })),
    overTime: overTimeResult.rows.map((r) => ({ date: r.date, count: Number(r.count) })),
    overTimeBySidebar: { series, points },
  }
}

export type ReportFinding = {
  id: number
  finding_date: string
  sample_id: string
  sample_type_id: number | null
  sample_type_label: string | null
  measurement_type_id: number | null
  measurement_type_label: string | null
  measurement_group: string
  apparatus: string
  sidebar_id: number
  sidebar_name: string
  sidebar_slug: string
}

export type ReportFindingsPage = { rows: ReportFinding[]; nextCursor: string | null; totalCount: number }

export function encodeReportCursor(row: ReportFinding, sort: FindingsSort): string {
  const value = sort === 'sample_id' ? row.sample_id : row.finding_date
  return Buffer.from(JSON.stringify({ v: value, id: row.id })).toString('base64url')
}
export function decodeReportCursor(raw: string | null): { value: string; id: number } | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
    if (typeof parsed.v !== 'string' && typeof parsed.v !== 'number') return null
    return { value: String(parsed.v), id: Number(parsed.id) }
  } catch {
    return null
  }
}

// The cross-sidebar equivalent of lib/queries/findings.ts#listFindings: same
// keyset pagination (findings.id is a single global sequence, so a cursor
// stays valid across sidebars), but scoped by the report filters instead of
// one fixed sidebar_id.
export async function listReportFindings(
  filters: ReportFilters,
  opts: { limit: number; cursor?: { value: string; id: number } | null; sort?: FindingsSort; dir?: 'asc' | 'desc' },
): Promise<ReportFindingsPage> {
  const limit = Math.min(Math.max(opts.limit, 1), 100)
  const sort: FindingsSort = opts.sort === 'sample_id' ? 'sample_id' : 'finding_date'
  const dir = opts.dir === 'asc' ? 'asc' : 'desc'
  const sortColumn = sort === 'sample_id' ? 'f.sample_id' : 'f.finding_date'
  const compareOp = dir === 'asc' ? '>' : '<'

  const params: unknown[] = []
  const where = buildFindingsWhere(filters, params)
  const whereParts = [where]

  const countResult = await pool.query<{ count: string }>(
    `select count(*)::text as count from findings f join sidebars s on f.sidebar_id = s.id where ${whereParts.join(' and ')}`,
    params,
  )

  if (opts.cursor) {
    params.push(opts.cursor.value)
    const valueParamIndex = params.length
    params.push(opts.cursor.id)
    const idParamIndex = params.length
    whereParts.push(`(${sortColumn}, f.id) ${compareOp} ($${valueParamIndex}, $${idParamIndex})`)
  }

  params.push(limit)
  const limitParamIndex = params.length

  const result = await pool.query<{
    id: number
    finding_date: string
    sample_id: string
    sample_type_id: number | null
    sample_type_label: string | null
    measurement_type_id: number | null
    measurement_type_label: string | null
    measurement_group: string
    apparatus: string
    sidebar_id: number
    sidebar_name: string
    sidebar_slug: string
  }>(
    `select f.id, f.finding_date::text as finding_date, f.sample_id, f.sample_type_id, st.label as sample_type_label,
            f.measurement_type_id, mt.label as measurement_type_label, f.measurement_group, f.apparatus,
            s.id as sidebar_id, s.name as sidebar_name, s.slug as sidebar_slug
     from findings f
     join sidebars s on f.sidebar_id = s.id
     left join sample_types st on f.sample_type_id = st.id
     left join measurement_types mt on f.measurement_type_id = mt.id
     where ${whereParts.join(' and ')}
     order by ${sortColumn} ${dir}, f.id ${dir}
     limit $${limitParamIndex}`,
    params,
  )

  const rows = result.rows
  const last = rows[rows.length - 1]
  const nextCursor = rows.length === limit && last ? encodeReportCursor(last as unknown as ReportFinding, sort) : null

  return { rows, nextCursor, totalCount: Number(countResult.rows[0]?.count ?? 0) }
}
