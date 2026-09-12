import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

// The one and only place this app talks to an AI provider. Everything —
// the research assistant and the notebook-photo extractor — goes through
// xKiro, an OpenAI-compatible gateway, so there is a single key, a single
// base URL, and a single place to change models. This replaces the previous
// Vercel AI Gateway integration (AI_GATEWAY_API_KEY), which is gone.
const BASE_URL = process.env.XKIRO_BASE_URL ?? 'https://api.xkiro.com/v1'

// Model ids are env-driven, never inlined at call sites. xKiro's free tier
// moves around — DeepSeek returned service_unavailable for every model when
// this was built — so swapping to whatever is healthy must not require a
// code change. Defaults verified against GET /v1/models: mistral-large-2512
// is free tier, supports tools *and* vision (so it serves both the chat and
// the image-import route), 256k context, 16k max output.
export const CHAT_MODEL = process.env.AI_MODEL ?? 'mistralai/mistral-large-2512'
export const FALLBACK_MODEL = process.env.AI_FALLBACK_MODEL ?? 'mistralai/mistral-small-2603'
export const VISION_MODEL = process.env.AI_VISION_MODEL ?? CHAT_MODEL

/** Keeps a runaway answer from burning the request budget. Well under the model's 16384 ceiling. */
export const MAX_OUTPUT_TOKENS = 4096

export function isAiConfigured() {
  return Boolean(process.env.XKIRO_API_KEY)
}

// Model fallback implemented at the HTTP layer rather than around
// streamText(): by the time the SDK surfaces a stream error the response
// headers are already committed, so a retry there can't be transparent.
// Swapping the model in the request body and re-issuing the fetch works
// identically for streaming and non-streaming calls, and the SDK never
// sees the failed attempt. Only one retry, and only for errors that a
// different model could plausibly survive (5xx = capacity, 429 = that
// model's rate limit).
const fetchWithModelFallback: typeof fetch = async (input, init) => {
  const first = await fetch(input, init)
  if (first.ok) return first
  if (!FALLBACK_MODEL || FALLBACK_MODEL === CHAT_MODEL) return first
  if (first.status < 500 && first.status !== 429) return first
  if (typeof init?.body !== 'string') return first

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(init.body)
  } catch {
    return first
  }
  if (typeof payload.model !== 'string' || payload.model === FALLBACK_MODEL) return first

  console.warn(`[ai] ${payload.model} returned ${first.status}; retrying on ${FALLBACK_MODEL}`)
  return fetch(input, { ...init, body: JSON.stringify({ ...payload, model: FALLBACK_MODEL }) })
}

export const xkiro = createOpenAICompatible({
  name: 'xkiro',
  baseURL: BASE_URL,
  // Read lazily at call time rather than captured at module scope so a
  // missing key surfaces as a handled 503 in the route, not a crash on
  // first import.
  apiKey: process.env.XKIRO_API_KEY ?? '',
  includeUsage: true,
  fetch: fetchWithModelFallback,
})
