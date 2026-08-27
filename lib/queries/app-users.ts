import { pool } from '@/lib/db'

export type AppRole = 'pending' | 'reader' | 'editor' | 'super_admin' | 'revoked'

export type AppUser = {
  email: string
  display_name: string | null
  role: AppRole
  approved_by: string | null
  approved_at: string | null
  created_at: string
}

function superAdminEmails() {
  return (process.env.SUPER_ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

/** Called once, from the Auth.js `createUser` event — never overwrites an existing row. */
export async function getOrCreateAppUser(email: string, displayName: string | null) {
  const normalized = email.toLowerCase()
  const role: AppRole = superAdminEmails().includes(normalized) ? 'super_admin' : 'pending'
  const inserted = await pool.query<AppUser>(
    `insert into app_users (email, display_name, role, approved_by, approved_at)
     values ($1, $2, $3, case when $3 = 'super_admin' then 'system:bootstrap' end, case when $3 = 'super_admin' then now() end)
     on conflict (email) do nothing
     returning *`,
    [normalized, displayName, role],
  )
  return inserted.rows[0] ?? getAppUserByEmail(normalized)
}

export async function getAppUserByEmail(email: string) {
  const result = await pool.query<AppUser>('select * from app_users where email = $1', [email.toLowerCase()])
  return result.rows[0] ?? null
}

export async function listAppUsers() {
  const result = await pool.query<AppUser>(
    `select * from app_users order by (role = 'pending') desc, created_at desc`,
  )
  return result.rows
}

export async function setAppUserRole(email: string, role: AppRole, approvedBy: string) {
  const result = await pool.query<AppUser>(
    `update app_users set role = $2, approved_by = $3, approved_at = now() where email = $1 returning *`,
    [email.toLowerCase(), role, approvedBy],
  )
  return result.rows[0] ?? null
}

// Pre-provisions someone before their first sign-in: when they do sign in
// via Google, Auth.js's createUser event calls getOrCreateAppUser, whose
// `on conflict (email) do nothing` leaves this row (and the role already
// set here) untouched rather than resetting them to 'pending'.
export async function createAppUser(email: string, role: AppRole, displayName: string | null, approvedBy: string) {
  const result = await pool.query<AppUser>(
    `insert into app_users (email, display_name, role, approved_by, approved_at)
     values ($1, $2, $3, $4, now())
     returning *`,
    [email.toLowerCase().trim(), displayName, role, approvedBy],
  )
  return result.rows[0]
}

export async function deleteAppUser(email: string) {
  const normalized = email.toLowerCase().trim()
  const existing = await getAppUserByEmail(normalized)
  if (!existing) return null
  await pool.query('delete from app_users where email = $1', [normalized])
  return existing
}
