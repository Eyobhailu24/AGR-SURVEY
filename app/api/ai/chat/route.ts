import { NextResponse } from 'next/server'
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from 'ai'
import { z } from 'zod'
import { requireRole } from '@/lib/auth-guard'
import { recordAudit } from '@/lib/audit'
import { CHAT_MODEL, MAX_OUTPUT_TOKENS, isAiConfigured, xkiro } from '@/lib/ai/provider'
import { buildSystemPrompt } from '@/lib/ai/system-prompt'
import { researchTools } from '@/lib/ai/tools'
import { checkRateLimit } from '@/lib/ai/rate-limit'

// Streaming keeps us clear of xKiro's 95s non-streaming timeout and gives
// the UI tokens as they arrive. 60s is Vercel's practical ceiling here.
export const maxDuration = 60

// Cost control (MASTERPROMPT §19): a conversation can't grow without bound
// and a single question can't be a pasted novel. Enforced server-side —
// the client caps too, but that's a convenience, not a guarantee.
const MAX_MESSAGES = 40
const MAX_TOTAL_CHARS = 24_000

const bodySchema = z.object({
  messages: z
    .array(
      z.looseObject({
        id: z.string().optional(),
        role: z.enum(['system', 'user', 'assistant']),
        parts: z.array(z.looseObject({ type: z.string() })).max(50),
      }),
    )
    .min(1)
    .max(MAX_MESSAGES),
})

function lastUserQuestion(messages: { role: string; parts: { type: string }[] }[]) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (message.role !== 'user') continue
    return message.parts
      .filter((part) => part.type === 'text')
      .map((part) => String((part as { text?: unknown }).text ?? ''))
      .join(' ')
  }
  return ''
}

function totalChars(messages: { parts: { type: string }[] }[]) {
  let sum = 0
  for (const message of messages) {
    for (const part of message.parts) {
      const text = (part as { text?: unknown }).text
      if (part.type === 'text' && typeof text === 'string') sum += text.length
    }
  }
  return sum
}

export async function POST(request: Request) {
  const ctx = await requireRole('reader')
  if (!ctx.ok || !ctx.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!isAiConfigured()) {
    console.error('[ai/chat] XKIRO_API_KEY is not set')
    return NextResponse.json({ error: 'The AI assistant is not configured. Contact an administrator.' }, { status: 503 })
  }

  const limit = checkRateLimit(ctx.email)
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Too many questions in a short time. Try again in ${limit.retryAfterSeconds}s.` },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    )
  }

  const raw = await request.json().catch(() => null)
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })

  if (totalChars(parsed.data.messages) > MAX_TOTAL_CHARS) {
    return NextResponse.json(
      { error: 'This conversation is too long. Clear the chat and ask again.' },
      { status: 413 },
    )
  }

  try {
    const system = await buildSystemPrompt()

    const result = streamText({
      model: xkiro(CHAT_MODEL),
      system,
      // Async in AI SDK v7 — it can resolve file/data parts, so it returns
      // a promise rather than a plain array.
      messages: await convertToModelMessages(parsed.data.messages as UIMessage[]),
      tools: researchTools,
      // Enough steps to inspect a tab, run an aggregate, then answer —
      // with room for a follow-up query — but bounded so a confused model
      // can't loop through the database on the user's budget.
      stopWhen: stepCountIs(6),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      // Low but not zero: this is an analysis assistant, and we want
      // consistent, literal readings of the data rather than variety.
      temperature: 0.2,
      maxRetries: 2,
      onError({ error }) {
        console.error('[ai/chat] stream error', error)
      },
      // Audited after the fact so the log records what actually happened —
      // which tools ran and what it cost — rather than just that a question
      // was asked. Never blocks or fails the response.
      async onFinish({ usage, steps }) {
        try {
          await recordAudit({
            actorEmail: ctx.email,
            actorName: ctx.name,
            action: 'ai.chat',
            entityType: 'ai_conversation',
            diff: {
              question: lastUserQuestion(parsed.data.messages).slice(0, 500),
              model: CHAT_MODEL,
              tools: steps.flatMap((step) => step.toolCalls.map((call) => call.toolName)),
              inputTokens: usage.inputTokens ?? null,
              outputTokens: usage.outputTokens ?? null,
            },
          })
        } catch (error) {
          console.error('[ai/chat] audit failed', error)
        }
      },
    })

    return result.toUIMessageStreamResponse({
      // The provider's raw error text can carry model ids, upstream URLs
      // and key-shaped fragments — none of which belong in a browser.
      // Detail is logged above instead.
      onError: () => 'The assistant could not answer that just now. Please try again.',
    })
  } catch (error) {
    console.error('[ai/chat]', error)
    return NextResponse.json({ error: 'The assistant is unavailable right now.' }, { status: 502 })
  }
}
