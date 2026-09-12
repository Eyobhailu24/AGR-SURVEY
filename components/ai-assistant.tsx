'use client'

import { useEffect, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AlertTriangle, ArrowUp, Bot, Database, Eraser, Square, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

// Courtesy cap so an oversized question gets immediate feedback here
// rather than a 413 from the route after sending. The server enforces the
// real budget.
const MAX_QUESTION_CHARS = 2000

const SUGGESTED_QUESTIONS = [
  'Compare average NO3 between top and bottom leaves.',
  'What was the highest potassium reading, and where?',
  'Summarise what we have measured so far.',
  'Why do we measure nitrate in plant leaves?',
]

const TOOL_LABELS: Record<string, string> = {
  describeTab: 'Inspected tab structure',
  aggregateMeasurements: 'Queried measurements',
  compareByGroup: 'Compared groups',
  listMeasurements: 'Read individual rows',
  searchNotes: 'Searched notes',
}

function MessageText({ text }: { text: string }) {
  return (
    <div
      className={cn(
        'prose prose-sm dark:prose-invert max-w-none',
        // Tables can exceed the bubble on narrow screens; scroll the table,
        // never the page.
        'prose-table:block prose-table:overflow-x-auto',
        'prose-headings:font-serif prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-pre:bg-muted',
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  )
}

export function AiAssistant() {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const { messages, sendMessage, status, error, stop, setMessages, clearError } = useChat({
    transport: new DefaultChatTransport({ api: '/api/ai/chat' }),
  })

  const busy = status === 'submitted' || status === 'streaming'

  // Follow the tail of the conversation as tokens arrive.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, status])

  function submit(text: string) {
    const question = text.trim()
    if (!question || busy) return
    clearError()
    sendMessage({ text: question })
    setInput('')
  }

  return (
    <div className="flex h-[calc(100vh-13rem)] min-h-[32rem] flex-col rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-muted-foreground" />
          <div>
            <h2 className="font-serif text-base font-semibold leading-tight">Agriculture AI Assistant</h2>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Research support
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              stop()
              setMessages([])
              clearError()
            }}
          >
            <Eraser /> Clear
          </Button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {messages.length === 0 && (
          <div className="mx-auto max-w-xl py-8 text-center">
            <Bot className="mx-auto mb-3 size-7 text-muted-foreground" />
            <p className="mb-1 font-serif text-lg font-semibold">Ask about your research data</p>
            <p className="mb-6 text-sm text-muted-foreground">
              I can query your recorded measurements — averages, comparisons, trends and individual rows —
              and answer general agronomy questions. Every figure I quote comes from your database.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTED_QUESTIONS.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => submit(question)}
                  className="rounded-full border border-border px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => {
          const isUser = message.role === 'user'
          const text = message.parts
            .filter((part) => part.type === 'text')
            .map((part) => (part as { text: string }).text)
            .join('')

          // Tool parts arrive as `tool-<name>`. Surfacing them matters here:
          // the researcher should be able to see that an answer came from a
          // database lookup rather than from the model's memory.
          const toolNames = message.parts
            .filter((part) => part.type.startsWith('tool-'))
            .map((part) => TOOL_LABELS[part.type.slice(5)] ?? part.type.slice(5))

          return (
            <div key={message.id} className={cn('flex gap-3', isUser && 'justify-end')}>
              {!isUser && (
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-border">
                  <Bot className="size-3.5" />
                </span>
              )}
              <div
                className={cn(
                  'max-w-[min(42rem,85%)] rounded-xl px-4 py-2.5 text-sm',
                  isUser ? 'bg-primary text-primary-foreground' : 'bg-muted',
                )}
              >
                {isUser ? (
                  <p className="whitespace-pre-wrap">{text}</p>
                ) : (
                  <>
                    {toolNames.length > 0 && (
                      <ul className="mb-2 space-y-1 border-b border-border/60 pb-2">
                        {toolNames.map((label, index) => (
                          <li
                            key={`${label}-${index}`}
                            className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
                          >
                            <Database className="size-3" /> {label}
                          </li>
                        ))}
                      </ul>
                    )}
                    {text ? (
                      <MessageText text={text} />
                    ) : (
                      <p className="text-muted-foreground">Looking that up…</p>
                    )}
                  </>
                )}
              </div>
              {isUser && (
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-border">
                  <User className="size-3.5" />
                </span>
              )}
            </div>
          )
        })}

        {status === 'submitted' && (
          <div className="flex items-center gap-2 pl-10 text-sm text-muted-foreground">
            <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-current" />
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <p>{error.message || 'Something went wrong.'}</p>
              <Button variant="outline" size="xs" className="mt-2" onClick={() => clearError()}>
                Dismiss
              </Button>
            </div>
          </div>
        )}
      </div>

      <form
        className="border-t border-border p-3"
        onSubmit={(event) => {
          event.preventDefault()
          submit(input)
        }}
      >
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value.slice(0, MAX_QUESTION_CHARS))}
            placeholder="Ask about your farm data..."
            rows={1}
            className="max-h-40 min-h-9 flex-1 resize-none"
            onKeyDown={(event) => {
              // Enter sends, Shift+Enter newlines — the convention people
              // already expect from a chat box.
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                submit(input)
              }
            }}
          />
          {busy ? (
            <Button type="button" variant="outline" size="icon" aria-label="Stop generating" onClick={() => stop()}>
              <Square />
            </Button>
          ) : (
            <Button type="submit" size="icon" aria-label="Send" disabled={!input.trim()}>
              <ArrowUp />
            </Button>
          )}
        </div>
        <p className="mt-2 px-1 text-[11px] text-muted-foreground">
          Answers can be wrong. Verify anything that matters against your recorded data.
        </p>
      </form>
    </div>
  )
}
