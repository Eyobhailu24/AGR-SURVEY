import { pool } from '@/lib/db'

type GoogleAccountRow = {
  userId: number
  access_token: string | null
  refresh_token: string | null
  expires_at: number | null
}

async function getGoogleAccountRow(email: string): Promise<GoogleAccountRow | null> {
  const result = await pool.query<GoogleAccountRow>(
    `select a."userId" as "userId", a.access_token, a.refresh_token, a.expires_at
     from accounts a
     join users u on u.id = a."userId"
     where u.email = $1 and a.provider = 'google'`,
    [email],
  )
  return result.rows[0] ?? null
}

async function refreshGoogleAccessToken(refreshToken: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Google token refresh failed (${response.status}): ${body.slice(0, 200)}`)
  }
  return (await response.json()) as { access_token: string; expires_in: number }
}

/**
 * Returns a valid Google OAuth access token for this signed-in user,
 * refreshing it first if expired. Relies on the drive.file/documents/
 * spreadsheets scopes requested at login (auth.config.ts) and the
 * access_token/refresh_token/expires_at the Postgres adapter already
 * stored in `accounts` at sign-in time.
 */
export async function getGoogleAccessToken(email: string): Promise<string> {
  const account = await getGoogleAccountRow(email)
  if (!account) {
    throw new Error('No linked Google account found for this session — please sign out and back in')
  }

  const nowSeconds = Math.floor(Date.now() / 1000)
  const isExpired = !account.expires_at || account.expires_at - 60 < nowSeconds

  if (!isExpired && account.access_token) {
    return account.access_token
  }
  if (!account.refresh_token) {
    throw new Error('Your Google session expired and no refresh token is available — please sign out and back in')
  }

  const refreshed = await refreshGoogleAccessToken(account.refresh_token)
  const newExpiresAt = nowSeconds + refreshed.expires_in

  await pool.query(`update accounts set access_token=$1, expires_at=$2 where "userId"=$3 and provider='google'`, [
    refreshed.access_token,
    newExpiresAt,
    account.userId,
  ])

  return refreshed.access_token
}
