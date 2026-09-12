// Deliberately in-memory: this is a small internal research tool, and a
// per-instance counter is enough to stop a stuck client or an accidental
// loop from hammering the provider. It is NOT a security control — it
// resets on deploy and is per-instance, so a multi-instance deployment
// enforces the limit per instance. If that ever matters, move the counter
// into Postgres; the call site won't change.
const WINDOW_MS = 60_000
const MAX_REQUESTS_PER_WINDOW = 15

const hits = new Map<string, { count: number; resetAt: number }>()

export function checkRateLimit(key: string) {
  const now = Date.now()
  const entry = hits.get(key)

  if (!entry || now >= entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return { ok: true as const, retryAfterSeconds: 0 }
  }

  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    return { ok: false as const, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) }
  }

  entry.count += 1
  // Opportunistic sweep so the map can't grow without bound on a
  // long-lived instance; cheap because it only runs on a limited request.
  if (hits.size > 500) {
    for (const [k, v] of hits) if (now >= v.resetAt) hits.delete(k)
  }
  return { ok: true as const, retryAfterSeconds: 0 }
}
