import type { ColumnField, Sidebar } from '@/lib/queries/sidebars'

// A sidebar's table layout: which columns show and in what order, which can
// be sorted/filtered, and the default sort. Pure and client-safe (no DB
// access) — the workspace, the config form, the findings query, export and
// the API routes all resolve columns through here so they can't drift.
//
// Column ids are either a built-in finding field ("finding_date", ...) or
// "values.<key>" for an entry in the sidebar's column_schema — the same
// "values." convention the CSV import mapping already uses.

export type ColumnKind = 'date' | 'number' | 'text' | 'select' | 'lookup'
export type SortDir = 'asc' | 'desc'

export const BUILTIN_COLUMNS = {
  finding_date: { label: 'Date', kind: 'date' },
  sample_id: { label: 'Sample', kind: 'text' },
  sample_type: { label: 'Sample type', kind: 'lookup' },
  measurement_type: { label: 'Measurement type', kind: 'lookup' },
  measurement_group: { label: 'Group', kind: 'text' },
  apparatus: { label: 'Apparatus', kind: 'text' },
  notes: { label: 'Notes', kind: 'text' },
} as const satisfies Record<string, { label: string; kind: ColumnKind }>

export type BuiltinId = keyof typeof BUILTIN_COLUMNS
export const BUILTIN_IDS = Object.keys(BUILTIN_COLUMNS) as BuiltinId[]

// Paging, text records and the assistant all key off the finding date, so
// it's the one column a sidebar can never drop.
export const DATE_COLUMN_ID: BuiltinId = 'finding_date'

export const CUSTOM_COLUMN_TYPES: ColumnField['type'][] = ['text', 'number', 'date', 'select']
export const COLUMN_TYPE_LABELS: Record<ColumnField['type'], string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  select: 'Choice',
}

export function sortDirectionLabel(kind: ColumnKind, dir: SortDir) {
  if (kind === 'date') return dir === 'asc' ? 'Oldest first' : 'Newest first'
  if (kind === 'number') return dir === 'asc' ? 'Smallest first' : 'Largest first'
  return dir === 'asc' ? 'A → Z' : 'Z → A'
}

export type SidebarViewConfig = {
  columns: string[]
  sortable: string[]
  filterable: string[]
  defaultSort: { column: string; dir: SortDir }
}

export type ViewColumn = {
  id: string
  label: string
  kind: ColumnKind
  builtin: BuiltinId | null
  field: ColumnField | null
  sortable: boolean
  filterable: boolean
}

export type ResolvedView = { columns: ViewColumn[]; defaultSort: { column: string; dir: SortDir } }

export function isBuiltinId(id: unknown): id is BuiltinId {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(BUILTIN_COLUMNS, id)
}

export function customColumnId(key: string) {
  return `values.${key}`
}

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const NUMBER_RE = /^-?\d+(\.\d+)?$/

// What every sidebar looked like before layouts were configurable.
function legacyConfig(schema: ColumnField[]): SidebarViewConfig {
  return {
    columns: [
      'finding_date',
      'sample_id',
      'sample_type',
      'measurement_type',
      'measurement_group',
      ...schema.map((c) => customColumnId(c.key)),
      'apparatus',
      'notes',
    ],
    sortable: ['finding_date', 'sample_id'],
    filterable: ['finding_date', 'sample_type', 'measurement_type'],
    defaultSort: { column: 'finding_date', dir: 'desc' },
  }
}

/** Reconciles the stored config with the current column_schema, so a stale or hand-edited config can never reference a column that doesn't exist. */
export function resolveView(sidebar: Pick<Sidebar, 'column_schema' | 'view_config'>): ResolvedView {
  const schema = sidebar.column_schema ?? []
  const config = sidebar.view_config ?? legacyConfig(schema)
  const fields = new Map(schema.map((field) => [customColumnId(field.key), field]))

  const order: string[] = []
  for (const id of config.columns ?? []) {
    if (!order.includes(id) && (isBuiltinId(id) || fields.has(id))) order.push(id)
  }
  // A custom column missing from the order still has data — show it at the
  // end rather than hide it.
  for (const id of fields.keys()) if (!order.includes(id)) order.push(id)
  if (!order.includes(DATE_COLUMN_ID)) order.unshift(DATE_COLUMN_ID)

  let defaultSort = config.defaultSort
  if (!defaultSort || !order.includes(defaultSort.column)) defaultSort = { column: DATE_COLUMN_ID, dir: 'desc' }
  const sortable = new Set([...(config.sortable ?? []), defaultSort.column])
  const filterable = new Set(config.filterable ?? [])

  const columns = order.map((id): ViewColumn => {
    const builtin = isBuiltinId(id) ? id : null
    const field = fields.get(id) ?? null
    return {
      id,
      builtin,
      field,
      label: builtin ? BUILTIN_COLUMNS[builtin].label : field!.label,
      kind: builtin ? BUILTIN_COLUMNS[builtin].kind : field!.type,
      sortable: sortable.has(id),
      filterable: filterable.has(id),
    }
  })

  return { columns, defaultSort: { column: defaultSort.column, dir: defaultSort.dir === 'asc' ? 'asc' : 'desc' } }
}

// ---------------------------------------------------------------------------
// Filters

/** `value` for text/choice/lookup columns; `from`/`to` for date and number ranges. */
export type FindingsFilter = { column: string; value?: string; from?: string; to?: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Keeps only filters on filterable columns, with values of the right shape — so the SQL layer never sees an uncastable value. */
export function sanitizeFilters(raw: unknown, view: ResolvedView): FindingsFilter[] {
  if (!Array.isArray(raw)) return []
  const str = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 200) : '')
  const result: FindingsFilter[] = []

  for (const item of raw) {
    if (!isRecord(item)) continue
    const column = view.columns.find((c) => c.id === item.column && c.filterable)
    if (!column || result.some((f) => f.column === column.id)) continue
    const value = str(item.value)
    const from = str(item.from)
    const to = str(item.to)

    if (column.kind === 'date' || column.kind === 'number') {
      const valid = column.kind === 'date' ? ISO_DATE_RE : NUMBER_RE
      const range: FindingsFilter = { column: column.id }
      if (valid.test(from)) range.from = from
      if (valid.test(to)) range.to = to
      if (range.from || range.to) result.push(range)
    } else if (column.kind === 'lookup') {
      if (/^\d+$/.test(value)) result.push({ column: column.id, value })
    } else if (value) {
      result.push({ column: column.id, value })
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Building a config from the Add/Edit sidebar form

export type SidebarColumnInput = {
  builtin?: string | null
  key?: string | null
  label?: string
  type?: string
  options?: string[]
  sortable?: boolean
  filterable?: boolean
}

export type SidebarLayoutInput = {
  columns: SidebarColumnInput[]
  defaultSort: { index: number; dir: SortDir }
}

const MAX_COLUMNS = 60

function slugKey(label: string) {
  return (
    label
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/(^_|_$)/g, '') || 'column'
  )
}

/**
 * Server-authoritative: turns the form's ordered column list into
 * column_schema + view_config. Existing custom columns keep their key (so
 * their saved values stay attached through renames and type changes); new
 * ones get a key derived from the name that collides with neither a current
 * column nor `reservedKeys` — keys that still have data from a deleted
 * column, so re-adding a column with the same name starts empty.
 */
export function buildSidebarLayout(
  input: unknown,
  opts: { existingSchema: ColumnField[]; reservedKeys?: Iterable<string> },
): { ok: true; columnSchema: ColumnField[]; viewConfig: SidebarViewConfig } | { ok: false; error: string } {
  if (!isRecord(input) || !Array.isArray(input.columns)) return { ok: false, error: 'columns are required' }
  const rawColumns = input.columns.filter(isRecord) as SidebarColumnInput[]
  if (rawColumns.length > MAX_COLUMNS) return { ok: false, error: `A sidebar can have at most ${MAX_COLUMNS} columns` }

  const existingByKey = new Map(opts.existingSchema.map((field) => [field.key, field]))
  const keptKeys = new Set<string>()
  for (const column of rawColumns) {
    if (!isBuiltinId(column.builtin) && typeof column.key === 'string' && existingByKey.has(column.key)) {
      keptKeys.add(column.key)
    }
  }
  const usedKeys = new Set([...(opts.reservedKeys ?? []), ...keptKeys])
  const assignedKeys = new Set<string>()

  const columnSchema: ColumnField[] = []
  const ids: string[] = []
  const sortable: string[] = []
  const filterable: string[] = []
  const labels = new Set<string>()
  // rawColumns index -> the column id that entry produced, for defaultSort.index.
  const idByIndex: (string | undefined)[] = []

  for (let index = 0; index < rawColumns.length; index++) {
    const column = rawColumns[index]
    let id: string
    let label: string
    if (isBuiltinId(column.builtin)) {
      id = column.builtin
      label = BUILTIN_COLUMNS[column.builtin].label
    } else {
      label = typeof column.label === 'string' ? column.label.trim().slice(0, 80) : ''
      if (!label) return { ok: false, error: 'Every column needs a name' }
      const type = CUSTOM_COLUMN_TYPES.includes(column.type as ColumnField['type'])
        ? (column.type as ColumnField['type'])
        : 'text'

      let key: string
      if (typeof column.key === 'string' && keptKeys.has(column.key) && !assignedKeys.has(column.key)) {
        key = column.key
      } else {
        const base = slugKey(label)
        key = base
        for (let n = 2; usedKeys.has(key); n++) key = `${base}_${n}`
        usedKeys.add(key)
      }
      assignedKeys.add(key)

      const field: ColumnField = { ...existingByKey.get(key), key, label, type }
      if (type === 'select') {
        const options = [
          ...new Set((Array.isArray(column.options) ? column.options : []).map((o) => String(o).trim()).filter(Boolean)),
        ]
        if (options.length === 0) return { ok: false, error: `Add at least one option to the "${label}" choice column` }
        field.options = options
      } else {
        delete field.options
      }
      columnSchema.push(field)
      id = customColumnId(key)
    }

    idByIndex[index] = id
    if (ids.includes(id)) continue
    const normalizedLabel = label.toLowerCase()
    if (labels.has(normalizedLabel)) return { ok: false, error: `Two columns are named "${label}" — give each a different name` }
    labels.add(normalizedLabel)

    ids.push(id)
    if (column.sortable) sortable.push(id)
    if (column.filterable) filterable.push(id)
  }

  if (!ids.includes(DATE_COLUMN_ID)) {
    ids.unshift(DATE_COLUMN_ID)
    sortable.push(DATE_COLUMN_ID)
    filterable.push(DATE_COLUMN_ID)
  }

  const rawSort = isRecord(input.defaultSort) ? input.defaultSort : {}
  const sortId = typeof rawSort.index === 'number' ? idByIndex[rawSort.index] : undefined
  const defaultSort = {
    column: sortId && ids.includes(sortId) ? sortId : DATE_COLUMN_ID,
    dir: (rawSort.dir === 'asc' ? 'asc' : 'desc') as SortDir,
  }
  if (!sortable.includes(defaultSort.column)) sortable.push(defaultSort.column)

  return { ok: true, columnSchema, viewConfig: { columns: ids, sortable, filterable, defaultSort } }
}
