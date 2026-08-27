import { pool } from '@/lib/db'

export type AuditInput = {
  actorEmail?: string | null
  actorName?: string | null
  action: string
  entityType: string
  entityId?: string | number | null
  diff?: unknown
}

/**
 * Call this from every mutating route/server action, after the write
 * succeeds. Actor is always resolved server-side from the session by the
 * caller — never trust a client-supplied actor.
 */
export async function recordAudit(input: AuditInput) {
  await pool.query(
    `insert into audit_log (actor_email, actor_name, action, entity_type, entity_id, diff)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      input.actorEmail ?? null,
      input.actorName ?? null,
      input.action,
      input.entityType,
      input.entityId != null ? String(input.entityId) : null,
      input.diff != null ? JSON.stringify(input.diff) : null,
    ],
  )
}
