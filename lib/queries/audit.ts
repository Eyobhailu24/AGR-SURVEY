import { pool } from '@/lib/db'

export type AuditEntry = {
  id: number
  actor_email: string | null
  actor_name: string | null
  action: string
  entity_type: string
  entity_id: string | null
  diff: unknown
  created_at: string
}

const PAGE_SIZE = 50

export async function listAuditLog(options: { limit?: number; before?: { createdAt: string; id: number } } = {}) {
  const limit = Math.min(options.limit ?? PAGE_SIZE, 200)
  if (options.before) {
    const result = await pool.query<AuditEntry>(
      `select id, actor_email, actor_name, action, entity_type, entity_id, diff, created_at
       from audit_log
       where (created_at, id) < ($1, $2)
       order by created_at desc, id desc
       limit $3`,
      [options.before.createdAt, options.before.id, limit],
    )
    return result.rows
  }
  const result = await pool.query<AuditEntry>(
    `select id, actor_email, actor_name, action, entity_type, entity_id, diff, created_at
     from audit_log
     order by created_at desc, id desc
     limit $1`,
    [limit],
  )
  return result.rows
}
