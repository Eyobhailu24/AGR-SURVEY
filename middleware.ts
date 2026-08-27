import NextAuth from 'next-auth'
import { authConfig } from '@/auth.config'

// A separate, Edge-safe NextAuth instance built from the adapter-free
// config — see auth.config.ts for why this can't just re-export `auth`
// from auth.ts. Next.js's middleware convention expects a default function
// export, not a destructured named one, hence the two-step below.
const { auth } = NextAuth(authConfig)

export default auth

// Everything requires sign-in except the auth API itself, the login/pending
// pages, the public terms/privacy pages, and static/icon assets. The
// `authorized` callback in auth.config.ts is what actually decides
// pass/redirect; this just decides which paths it runs on.
export const config = {
  matcher: [
    '/((?!api/auth|login|pending-approval|terms|privacy|_next/static|_next/image|favicon\\.ico|icon\\.svg|icon-light-32x32\\.png|icon-dark-32x32\\.png|apple-icon\\.png|placeholder.*).*)',
  ],
}
