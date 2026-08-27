import NextAuth from 'next-auth'
import PostgresAdapter from '@auth/pg-adapter'
import { pool } from '@/lib/db'
import { getOrCreateAppUser } from '@/lib/queries/app-users'
import { authConfig } from '@/auth.config'

// Full, Node.js-runtime config (adapter + events need `pg`). Used by the
// API route handler and everywhere else in the app (Server Components,
// Route Handlers all default to the Node.js runtime). middleware.ts does
// NOT import this file — see auth.config.ts for why.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PostgresAdapter(pool),
  // JWT sessions on purpose: keeps the session cookie self-contained so
  // middleware's auth check (via auth.config.ts) never needs a DB round
  // trip. Role is deliberately NOT cached in the JWT — every place that
  // needs it (the (app) layout, route handlers) reads app_users fresh via
  // lib/auth-guard.ts, so an admin's approval/role change takes effect
  // immediately, with no stale-token/re-login gap.
  session: { strategy: 'jwt' },
  events: {
    // Fires exactly once, the first time the adapter creates a `users` row
    // for this person — never on subsequent sign-ins, so an admin's later
    // role changes are never clobbered by a re-login.
    async createUser({ user }) {
      if (user.email) await getOrCreateAppUser(user.email, user.name ?? null)
    },
  },
})
