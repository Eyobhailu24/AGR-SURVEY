import { pool } from '@/lib/db'
import type { ColumnField } from '@/lib/queries/sidebars'

// Every number the assistant quotes is computed here, in SQL, from real
// rows. The LLM never does arithmetic and never writes SQL — it only picks
// a function and validated arguments.
//
// The central wrinkle: a `findings.values` cell is TEXT and, for the lab
// tabs, holds several replicate readings in one cell ("150, 170, 190").
// Casting the cell to numeric would throw. So every aggregate explodes the
// cell into individual replicates first and keeps only the ones that are
// actually numeric — blanks and stray text are skipped, never counted as
// zero.
const REPLICATES_JOIN = `
  cross join lateral (
    select trim(part)::numeric as value
    from unnest(string_to_array(f.values ->> $COLUMN_KEY$, ',')) as part
    where trim(part) ~ '^-?[0-9]+([.][0-9]+)?$'
  ) r`

export type AggregateOp = 'avg' | 'min' | 'max' | 'sum' | 'count' | 'stddev'

// Whitelisted, never interpolated from user or model input.
const OP_SQL: Record<AggregateOp, string> = {
  avg: 'round(avg(r.value), 4)',
  min: 'min(r.value)',
  max: 'max(r.value)',
  sum: 'sum(r.value)',
  count: 'count(r.value)',
  stddev: 'round(stddev_samp(r.value), 4)',
}

export type MeasurementFilters = {
  tabSlug: string
  columnKey: string
  measurementGroup?: string | null
  sampleId?: string | null
  dateFrom?: string | null
  dateTo?: string | null
}

/** Builds the shared WHERE clause and pushes params in order. $1 is always the column key. */
function buildFilters(filters: MeasurementFilters, params: unknown[]) {
  // $1 — referenced by REPLICATES_JOIN via the $COLUMN_KEY$ placeholder.
  params.push(filters.columnKey)
  const columnKeyParam = `$${params.length}`

  params.push(filters.tabSlug)
  const parts = [`s.slug = $${params.length}`]

  if (filters.measurementGroup) {
    params.push(filters.measurementGroup)
    parts.push(`f.measurement_group = $${params.length}`)
  }
  if (filters.sampleId) {
    params.push(filters.sampleId)
    parts.push(`f.sample_id = $${params.length}`)
  }
  if (filters.dateFrom) {
    params.push(filters.dateFrom)
    parts.push(`f.finding_date >= $${params.length}`)
  }
  if (filters.dateTo) {
    params.push(filters.dateTo)
    parts.push(`f.finding_date <= $${params.length}`)
  }

  return {
    where: parts.join(' and '),
    join: REPLICATES_JOIN.replace('$COLUMN_KEY$', columnKeyParam),
  }
}

export type TabDescription = {
  name: string
  slug: string
  description: string | null
  notesOnly: boolean
  columns: ColumnField[]
  measurementGroups: string[]
  sampleIds: string[]
  rowCount: number
  firstDate: string | null
  lastDate: string | null
}

/**
 * What can actually be asked of one tab: its columns, and the real
 * measurement_group / sample_id values present. The assistant needs this
 * before aggregating, because group names ("top", "bottom", "plant height")
 * are data, not schema — and guessing one returns an empty result.
 */
export async function describeTab(slug: string): Promise<TabDescription | null> {
  const tab = await pool.query<{
    name: string
    slug: string
    description: string | null
    notes_only: boolean
    column_schema: ColumnField[]
  }>(
    `select name, slug, description, notes_only, column_schema
     from sidebars where slug = $1 and is_archived = false`,
    [slug],
  )
  const row = tab.rows[0]
  if (!row) return null

  const facets = await pool.query<{
    measurement_groups: string[] | null
    sample_ids: string[] | null
    row_count: string
    first_date: string | null
    last_date: string | null
  }>(
    `select array_agg(distinct nullif(f.measurement_group, '')) as measurement_groups,
            array_agg(distinct nullif(f.sample_id, '')) as sample_ids,
            count(*)::text as row_count,
            min(f.finding_date)::text as first_date,
            max(f.finding_date)::text as last_date
     from findings f join sidebars s on f.sidebar_id = s.id
     where s.slug = $1`,
    [slug],
  )
  const facet = facets.rows[0]

  return {
    name: row.name,
    slug: row.slug,
    description: row.description,
    notesOnly: row.notes_only,
    columns: row.column_schema,
    measurementGroups: (facet?.measurement_groups ?? []).filter(Boolean).sort(),
    sampleIds: (facet?.sample_ids ?? []).filter(Boolean).sort(),
    rowCount: Number(facet?.row_count ?? 0),
    firstDate: facet?.first_date ?? null,
    lastDate: facet?.last_date ?? null,
  }
}

export type AggregateResult = {
  op: AggregateOp
  value: number | null
  replicateCount: number
  rowCount: number
  firstDate: string | null
  lastDate: string | null
}

/**
 * One aggregate over exploded replicates. `replicateCount` is how many
 * individual readings went in; `rowCount` is how many recorded findings
 * they came from. Both are reported so the assistant can state exactly what
 * a number is based on rather than implying more precision than exists.
 */
export async function aggregateMeasurements(
  filters: MeasurementFilters,
  op: AggregateOp,
): Promise<AggregateResult> {
  const params: unknown[] = []
  const { where, join } = buildFilters(filters, params)

  const result = await pool.query<{
    value: string | null
    replicate_count: string
    row_count: string
    first_date: string | null
    last_date: string | null
  }>(
    `select ${OP_SQL[op]}::text as value,
            count(r.value)::text as replicate_count,
            count(distinct f.id)::text as row_count,
            min(f.finding_date)::text as first_date,
            max(f.finding_date)::text as last_date
     from findings f
     join sidebars s on f.sidebar_id = s.id
     ${join}
     where ${where}`,
    params,
  )

  const row = result.rows[0]
  return {
    op,
    value: row?.value == null ? null : Number(row.value),
    replicateCount: Number(row?.replicate_count ?? 0),
    rowCount: Number(row?.row_count ?? 0),
    firstDate: row?.first_date ?? null,
    lastDate: row?.last_date ?? null,
  }
}

export type GroupBy = 'measurement_group' | 'sample_id' | 'finding_date'

export type GroupedResult = {
  group: string
  value: number | null
  replicateCount: number
  rowCount: number
}

const GROUP_SQL: Record<GroupBy, string> = {
  measurement_group: 'f.measurement_group',
  sample_id: 'f.sample_id',
  finding_date: 'f.finding_date::text',
}

/**
 * The same aggregate split by one axis — the comparison and trend workhorse.
 * Ordered by group so a date split reads chronologically.
 */
export async function aggregateGrouped(
  filters: MeasurementFilters,
  op: AggregateOp,
  groupBy: GroupBy,
  limit = 100,
): Promise<GroupedResult[]> {
  const params: unknown[] = []
  const { where, join } = buildFilters(filters, params)
  params.push(Math.min(Math.max(limit, 1), 200))

  const result = await pool.query<{
    group: string | null
    value: string | null
    replicate_count: string
    row_count: string
  }>(
    `select ${GROUP_SQL[groupBy]} as group,
            ${OP_SQL[op]}::text as value,
            count(r.value)::text as replicate_count,
            count(distinct f.id)::text as row_count
     from findings f
     join sidebars s on f.sidebar_id = s.id
     ${join}
     where ${where}
     group by ${GROUP_SQL[groupBy]}
     order by ${GROUP_SQL[groupBy]} asc
     limit $${params.length}`,
    params,
  )

  return result.rows.map((r) => ({
    group: r.group ?? '(blank)',
    value: r.value == null ? null : Number(r.value),
    replicateCount: Number(r.replicate_count),
    rowCount: Number(r.row_count),
  }))
}

export type MeasurementRow = {
  id: number
  date: string
  sampleId: string
  measurementGroup: string
  apparatus: string
  raw: string
  replicates: number[]
}

/**
 * Raw rows, hard-capped. Returns both the cell as written and the parsed
 * replicates, so the assistant can quote the original text rather than
 * silently normalising the researcher's own record.
 */
export async function listMeasurements(filters: MeasurementFilters, limit = 25): Promise<MeasurementRow[]> {
  const params: unknown[] = []
  params.push(filters.columnKey)
  const columnKeyParam = `$${params.length}`
  params.push(filters.tabSlug)
  const parts = [`s.slug = $${params.length}`]

  if (filters.measurementGroup) {
    params.push(filters.measurementGroup)
    parts.push(`f.measurement_group = $${params.length}`)
  }
  if (filters.sampleId) {
    params.push(filters.sampleId)
    parts.push(`f.sample_id = $${params.length}`)
  }
  if (filters.dateFrom) {
    params.push(filters.dateFrom)
    parts.push(`f.finding_date >= $${params.length}`)
  }
  if (filters.dateTo) {
    params.push(filters.dateTo)
    parts.push(`f.finding_date <= $${params.length}`)
  }
  params.push(Math.min(Math.max(limit, 1), 50))

  const result = await pool.query<{
    id: number
    date: string
    sample_id: string
    measurement_group: string
    apparatus: string
    raw: string | null
  }>(
    `select f.id, f.finding_date::text as date, f.sample_id, f.measurement_group, f.apparatus,
            f.values ->> ${columnKeyParam} as raw
     from findings f join sidebars s on f.sidebar_id = s.id
     where ${parts.join(' and ')}
     order by f.finding_date desc, f.id desc
     limit $${params.length}`,
    params,
  )

  return result.rows.map((r) => ({
    id: r.id,
    date: r.date,
    sampleId: r.sample_id,
    measurementGroup: r.measurement_group,
    apparatus: r.apparatus,
    raw: r.raw ?? '',
    replicates: (r.raw ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter((part) => /^-?\d+(\.\d+)?$/.test(part))
      .map(Number),
  }))
}

export type NoteHit = {
  source: 'text_record' | 'finding_note'
  tab: string
  date: string
  snippet: string
}

/**
 * Full-text over the researcher's own written records. findings.notes holds
 * sanitised rich-text HTML, so tags are stripped before both indexing and
 * display — otherwise a search for "hello" would match markup.
 */
export async function searchNotes(query: string, tabSlug: string | null, limit = 10): Promise<NoteHit[]> {
  const capped = Math.min(Math.max(limit, 1), 25)
  const params: unknown[] = [query, capped]
  const tabFilter = tabSlug ? 'and s.slug = $3' : ''
  if (tabSlug) params.push(tabSlug)

  const result = await pool.query<{
    source: 'text_record' | 'finding_note'
    tab: string
    date: string
    snippet: string
  }>(
    `with stripped as (
       select 'text_record'::text as source, s.name as tab, tr.record_date::text as date,
              regexp_replace(tr.body, '<[^>]*>', ' ', 'g') as body
       from text_records tr join sidebars s on tr.sidebar_id = s.id
       where tr.body <> '' ${tabFilter}
       union all
       select 'finding_note'::text, s.name, f.finding_date::text,
              regexp_replace(f.notes, '<[^>]*>', ' ', 'g')
       from findings f join sidebars s on f.sidebar_id = s.id
       where f.notes <> '' ${tabFilter}
     )
     select source, tab, date, left(body, 400) as snippet
     from stripped
     where to_tsvector('english', body) @@ websearch_to_tsquery('english', $1)
     order by ts_rank(to_tsvector('english', body), websearch_to_tsquery('english', $1)) desc
     limit $2`,
    params,
  )
  return result.rows
}
