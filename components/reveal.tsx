'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Reveals its children once they scroll into view.
 *
 * Motion is opt-in per user: the hidden state is behind `motion-safe:`, so
 * anyone with prefers-reduced-motion set sees the content immediately and
 * nothing ever moves. The `reveal` class is also targeted by a <noscript>
 * override on the page, so content is never trapped invisible if the
 * observer never runs.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode
  delay?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    if (typeof IntersectionObserver === 'undefined') {
      setShown(true)
      return
    }

    // Already in view on first paint (above the fold, or a restored scroll
    // position) — reveal without waiting for a scroll event.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          setShown(true)
          observer.disconnect()
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      {...rest}
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        'reveal transition-[opacity,transform] duration-700 ease-out',
        'motion-safe:translate-y-4 motion-safe:opacity-0',
        shown && 'motion-safe:translate-y-0 motion-safe:opacity-100',
        className,
      )}
    >
      {children}
    </div>
  )
}
