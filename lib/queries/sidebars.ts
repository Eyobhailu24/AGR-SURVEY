import { pool } from '@/lib/db'
import type { SidebarViewConfig } from '@/lib/sidebar-view'

export type ColumnField = {
  key: string
  label: string
  type: 'text' | 'number' | 'date' | 'select'
  options?: string[]
  required?: boolean
  unit?: string
}

export type Sidebar = {
  id: number
  name: string
  slug: string
  icon: string | null
  description: string | null
  includes_text_record: boolean
  notes_only: boolean
  column_schema: ColumnField[]
  /** null = the pre-configurable default layout; always read through resolveView(). */
  view_config: SidebarViewConfig | null
  is_archived: boolean
  sort_order: number
}

const SIDEBAR_COLUMNS =
  'id, name, slug, icon, description, includes_text_record, notes_only, column_schema, view_config, is_archived, sort_order'

export async function listSidebars(includeArchived = false) {
  const result = await pool.query<Sidebar>(
    `select ${SIDEBAR_COLUMNS} from sidebars
     ${includeArchived ? '' : 'where is_archived = false'}
     order by sort_order asc, id asc`,
  )
  return result.rows
}

export async function getSidebarBySlug(slug: string) {
  const result = await pool.query<Sidebar>(`select ${SIDEBAR_COLUMNS} from sidebars where slug = $1`, [slug])
  return result.rows[0] ?? null
}

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'sidebar'
  )
}

export async function createSidebar(input: {
  name: string
  description?: string | null
  includesTextRecord: boolean
  notesOnly?: boolean
  columnSchema: ColumnField[]
  viewConfig: SidebarViewConfig | null
  createdBy: string
}) {
  const base = slugify(input.name)
  let slug = base
  let attempt = 1
  while (await getSidebarBySlug(slug)) {
    attempt += 1
    slug = `${base}-${attempt}`
  }
  const maxOrder = await pool.query<{ max: number | null }>('select max(sort_order) as max from sidebars')
  const nextOrder = (maxOrder.rows[0]?.max ?? 0) + 1
  // A notes-only sidebar has no findings grid, so its text-record section
  // is the whole page — always on for it, regardless of what was passed.
  const notesOnly = Boolean(input.notesOnly)
  const includesTextRecord = notesOnly || input.includesTextRecord
  const result = await pool.query<Sidebar>(
    `insert into sidebars (name, slug, description, includes_text_record, notes_only, column_schema, view_config, sort_order, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     returning ${SIDEBAR_COLUMNS}`,
    [
      input.name,
      slug,
      input.description ?? null,
      includesTextRecord,
      notesOnly,
      JSON.stringify(notesOnly ? [] : input.columnSchema),
      notesOnly || !input.viewConfig ? null : JSON.stringify(input.viewConfig),
      nextOrder,
      input.createdBy,
    ],
  )
  return result.rows[0]
}

/** The slug is left alone on rename so existing links and bookmarks keep working. */
export async function updateSidebar(
  id: number,
  input: {
    name: string
    description: string | null
    includesTextRecord: boolean
    notesOnly: boolean
    columnSchema: ColumnField[]
    viewConfig: SidebarViewConfig | null
  },
) {
  const result = await pool.query<Sidebar>(
    `update sidebars set
       name=$1, description=$2, includes_text_record=$3, notes_only=$4,
       column_schema=$5, view_config=$6, updated_at=now()
     where id=$7
     returning ${SIDEBAR_COLUMNS}`,
    [
      input.name,
      input.description,
      input.notesOnly || input.includesTextRecord,
      input.notesOnly,
      JSON.stringify(input.columnSchema),
      input.viewConfig ? JSON.stringify(input.viewConfig) : null,
      id,
    ],
  )
  return result.rows[0] ?? null
}

/** Every `values` key that has data in this sidebar's findings, including keys of columns that were since deleted. */
export async function listUsedValueKeys(sidebarId: number) {
  const result = await pool.query<{ key: string }>(
    `select distinct jsonb_object_keys(f.values) as key
     from findings f
     where f.sidebar_id = $1 and jsonb_typeof(f.values) = 'object'`,
    [sidebarId],
  )
  return result.rows.map((r) => r.key)
}

export async function archiveSidebar(slug: string) {
  await pool.query('update sidebars set is_archived = true, updated_at = now() where slug = $1', [slug])
}
