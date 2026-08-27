import { auth } from '@/auth'
import { getAppUserByEmail, type AppRole } from '@/lib/queries/app-users'

const RANK: Record<AppRole, number> = {
  revoked: -1,
  pending: 0,
  reader: 1,
  editor: 2,
  super_admin: 3,
}

/** Fresh, DB-backed session + role lookup. Node.js runtime only (uses `pg`) — call from Server Components/Route Handlers, never from middleware. */
export async function getSessionWithRole() {
  const session = await auth()
  const email = session?.user?.email ?? null
  if (!email) return { session: null, email: null, name: null as string | null, role: 'pending' as AppRole }
  const appUser = await getAppUserByEmail(email)
  return {
    session,
    email,
    name: session?.user?.name ?? appUser?.display_name ?? null,
    role: (appUser?.role ?? 'pending') as AppRole,
  }
}

/** Use in route handlers to gate a mutation: `const ctx = await requireRole('editor'); if (!ctx.ok) return 403`. */
export async function requireRole(minRole: AppRole) {
  const ctx = await getSessionWithRole()
  const ok = ctx.email !== null && RANK[ctx.role] >= RANK[minRole]
  return { ...ctx, ok }
}
