import type { NextAuthConfig } from 'next-auth'
import Google from 'next-auth/providers/google'

// Kept separate from auth.ts on purpose: middleware.ts imports only this
// file, which must stay Edge-runtime-safe. auth.ts pulls in @auth/pg-adapter
// (and therefore `pg`, which needs Node.js APIs like node:util/types) — if
// middleware imported auth.ts directly, Next.js would bundle that into the
// Edge middleware chunk and crash at module-evaluation time. Verified this
// the hard way: see the git history / conversation for the exact error.

// Requested upfront (rather than incrementally later) so a refresh token is
// always captured at first sign-in and the export feature (Phase 4) can
// reuse this same OAuth grant for Drive/Docs/Sheets without a second consent
// screen.
const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/spreadsheets',
].join(' ')

export const authConfig = {
  trustHost: true,
  providers: [
    Google({
      // Explicit on purpose: Auth.js v5's auto-detect convention looks for
      // AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET, not the GOOGLE_CLIENT_ID/
      // GOOGLE_CLIENT_SECRET names this project's .env already uses.
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: { scope: GOOGLE_SCOPES, access_type: 'offline', prompt: 'consent' },
      },
    }),
  ],
  // Drives middleware.ts: only gates "is signed in at all". Role/approval
  // gating happens deeper in the app (see lib/auth-guard.ts) where a DB
  // call is safe to make (Node.js runtime).
  callbacks: {
    authorized({ auth }) {
      return Boolean(auth?.user?.email)
    },
  },
  pages: {
    signIn: '/login',
  },
} satisfies NextAuthConfig
