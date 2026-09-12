import NextAuth from 'next-auth'
import { authConfig } from '@/auth.config'

// A separate, Edge-safe NextAuth instance built from the adapter-free
// config — see auth.config.ts for why this can't just re-export `auth`
// from auth.ts. Next.js's middleware convention expects a default function
// export, not a destructured named one, hence the two-step below.
const { auth } = NextAuth(authConfig)

export default auth

// Everything requires sign-in except the auth API itself, the login/pending
// pages, the public marketing/terms/privacy pages, and static/icon assets.
// The `authorized` callback in auth.config.ts is what actually decides
// pass/redirect; this just decides which paths it runs on.
//
// The trailing `.+` (not `.*`) is what makes the landing page at "/" public:
// for that path the captured remainder is empty, which `.*` would match and
// `.+` does not, so middleware never runs on it. Listing "/" in the negative
// lookahead instead would not work, for the same reason. Every other route
// still has at least one character after the slash and stays gated.
export const config = {
  matcher: [
    '/((?!api/auth|login|pending-approval|terms|privacy|_next/static|_next/image|favicon\\.ico|icon\\.svg|icon-light-32x32\\.png|icon-dark-32x32\\.png|apple-icon\\.png|placeholder.*).+)',
  ],
}
