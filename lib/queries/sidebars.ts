import { pool } from '@/lib/db'

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
  column_schema: ColumnField[]
  is_archived: boolean
  sort_order: number
}

const SIDEBAR_COLUMNS =
  'id, name, slug, icon, description, includes_text_record, column_schema, is_archived, sort_order'

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
  columnSchema: ColumnField[]
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
  const result = await pool.query<Sidebar>(
    `insert into sidebars (name, slug, description, includes_text_record, column_schema, sort_order, created_by)
     values ($1,$2,$3,$4,$5,$6,$7)
     returning ${SIDEBAR_COLUMNS}`,
    [
      input.name,
      slug,
      input.description ?? null,
      input.includesTextRecord,
      JSON.stringify(input.columnSchema),
      nextOrder,
      input.createdBy,
    ],
  )
  return result.rows[0]
}

export async function archiveSidebar(slug: string) {
  await pool.query('update sidebars set is_archived = true, updated_at = now() where slug = $1', [slug])
}
