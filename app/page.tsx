import Link from 'next/link'
import type { Metadata } from 'next'
import {
  ArrowRight,
  BarChart3,
  Bot,
  FileDown,
  Layers,
  Library,
  NotebookPen,
  ScrollText,
  ShieldCheck,
  Upload,
  Users,
} from 'lucide-react'
import { auth } from '@/auth'
import { buttonVariants } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
import { Reveal } from '@/components/reveal'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Sudan Grass Research Dashboard',
  description:
    'A private research workspace for Sudan grass greenhouse and lab trials — record measurements and notes, report across tests, and ask an assistant grounded in your own data.',
}

const STAGES = [
  {
    icon: NotebookPen,
    title: 'Record',
    body: 'Tabs and columns you define yourself, with dated notes alongside every measurement. Import from a CSV, or from a photograph of the notebook page.',
  },
  {
    icon: BarChart3,
    title: 'Analyze',
    body: 'Filter and chart across every test at once. Send the result to Google Sheets or Docs when it needs to leave the system.',
  },
  {
    icon: Bot,
    title: 'Ask',
    body: 'Put a question in plain language. Answers come from the database itself, with the rows and dates behind every figure.',
  },
]

const CAPABILITIES = [
  {
    icon: Layers,
    title: 'Tabs you define',
    body: 'Each test gets its own tab, its own columns and its own units. Add a new one the week you need it — nothing is hard-coded.',
  },
  {
    icon: Upload,
    title: 'Import without retyping',
    body: 'Bring readings in from a spreadsheet, or photograph a handwritten page and have the rows extracted for you to review before they are saved.',
  },
  {
    icon: BarChart3,
    title: 'Reports across tests',
    body: 'Counts, date ranges and trends over every tab at once, filtered by sample type, measurement type or period.',
  },
  {
    icon: FileDown,
    title: 'Export where you work',
    body: 'Findings and notes go out to Google Sheets and Docs, or download as CSV, Excel and Word.',
  },
]

const ASSURANCES = [
  { icon: ShieldCheck, label: 'Invite-only access' },
  { icon: Users, label: 'Reader, Editor and Admin roles' },
  { icon: ScrollText, label: 'Every change written to an audit log' },
]

export default async function LandingPage() {
  const session = await auth()
  const signedIn = Boolean(session?.user?.email)
  const ctaLabel = signedIn ? 'Open dashboard' : 'Sign in'

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Keeps revealed content readable if the observer never runs. */}
      <noscript>
        <style>{`.reveal { opacity: 1 !important; transform: none !important; }`}</style>
      </noscript>

      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <Link href="/" className="group">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
              Field notebook / 2026
            </p>
            <p className="font-serif text-base font-semibold leading-tight">Sudan Grass Research</p>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/dashboard" className={cn(buttonVariants({ size: 'lg' }), 'group gap-1.5')}>
              {ctaLabel}
              <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ---------------------------------------------------------------- Hero */}
        <section className="mx-auto max-w-6xl px-5 pb-20 pt-20 lg:px-8 lg:pb-28 lg:pt-28">
          <div className="mx-auto max-w-3xl text-center">
            <p className="animate-in fade-in-0 slide-in-from-bottom-2 font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground duration-700">
              Greenhouse &amp; lab research
            </p>
            <h1 className="animate-in fade-in-0 slide-in-from-bottom-3 mt-4 text-balance font-serif text-4xl font-semibold leading-[1.1] tracking-tight duration-700 sm:text-5xl lg:text-6xl">
              Research data that keeps its provenance.
            </h1>
            <p className="animate-in fade-in-0 slide-in-from-bottom-3 mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground delay-100 duration-700 fill-mode-backwards sm:text-lg">
              A private workspace for Sudan grass forage trials. Record measurements and dated notes in tabs you
              define, report across every test, and ask questions that are answered from your own records — with
              the rows, dates and counts behind each number.
            </p>
            <div className="animate-in fade-in-0 slide-in-from-bottom-3 mt-9 flex flex-col items-center gap-3 delay-200 duration-700 fill-mode-backwards">
              <Link
                href="/dashboard"
                className={cn(buttonVariants({ size: 'lg' }), 'group h-11 gap-2 px-6 text-sm')}
              >
                {ctaLabel}
                <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
              <p className="text-xs text-muted-foreground">
                Access is invite-only. New sign-ins wait for administrator approval.
              </p>
            </div>
          </div>

          {/* Three stages, revealed in sequence. Connectors are decorative and
              hidden from assistive tech. */}
          <div className="mt-20 lg:mt-24">
            <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:items-stretch lg:gap-0">
              {STAGES.map((stage, index) => (
                <div key={stage.title} className="contents">
                  {index > 0 && (
                    <Reveal
                      delay={index * 180 - 60}
                      className="hidden items-center px-4 lg:flex"
                      aria-hidden="true"
                    >
                      <span className="h-px w-full bg-border" />
                    </Reveal>
                  )}
                  <Reveal delay={index * 180}>
                    <article className="group h-full rounded-xl border border-border bg-card p-6 transition-colors duration-300 hover:border-foreground/25">
                      <div className="flex size-9 items-center justify-center rounded-lg border border-border transition-colors duration-300 group-hover:border-foreground/25">
                        <stage.icon className="size-4" />
                      </div>
                      <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        Step {index + 1}
                      </p>
                      <h2 className="mt-1 font-serif text-xl font-semibold">{stage.title}</h2>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{stage.body}</p>
                    </article>
                  </Reveal>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- Capabilities */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-6xl px-5 py-20 lg:px-8 lg:py-28">
            <Reveal>
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                What it does
              </p>
              <h2 className="mt-3 max-w-2xl text-balance font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
                Built around how the work actually happens.
              </h2>
            </Reveal>

            <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
              {CAPABILITIES.map((item, index) => (
                <Reveal key={item.title} delay={index * 90} className="bg-card">
                  <article className="group h-full p-7 transition-colors duration-300 hover:bg-muted/50">
                    <item.icon className="size-4 text-muted-foreground transition-colors duration-300 group-hover:text-foreground" />
                    <h3 className="mt-4 font-serif text-lg font-semibold">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ Assistant */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-6xl px-5 py-20 lg:px-8 lg:py-28">
            <Reveal>
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                The assistant
              </p>
              <h2 className="mt-3 max-w-2xl text-balance font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
                It answers from the record, or it says so.
              </h2>
              <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
                A research assistant is only useful if you can trust what it tells you. This one is built so that
                every figure it quotes can be traced back to a row you entered.
              </p>
            </Reveal>

            <div className="mt-12 grid gap-4 lg:grid-cols-2">
              <Reveal>
                <article className="h-full rounded-xl border border-border bg-card p-7">
                  <div className="flex size-9 items-center justify-center rounded-lg border border-border">
                    <Bot className="size-4" />
                  </div>
                  <h3 className="mt-4 font-serif text-xl font-semibold">Grounded in your measurements</h3>
                  <ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
                    {[
                      'Statistics are computed by the database, never by the model.',
                      'Replicate readings recorded in a single cell are expanded before anything is averaged.',
                      'Every answer reports the readings, rows and dates it was based on.',
                      'When the data cannot answer a question, it says so instead of filling the gap.',
                    ].map((line) => (
                      <li key={line} className="flex gap-3">
                        <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/60" />
                        {line}
                      </li>
                    ))}
                  </ul>
                </article>
              </Reveal>

              <Reveal delay={120}>
                <article className="h-full rounded-xl border border-border bg-card p-7">
                  <div className="flex size-9 items-center justify-center rounded-lg border border-border">
                    <Library className="size-4" />
                  </div>
                  <h3 className="mt-4 font-serif text-xl font-semibold">A reference library it can cite</h3>
                  <ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
                    {[
                      'Upload the papers and references you have approved — nothing else is searched.',
                      'Passages are found by exact term and by meaning, so a question in your own words still reaches the right page.',
                      'Answers cite the document and page they came from.',
                      'Published literature and your own observations are always kept apart.',
                    ].map((line) => (
                      <li key={line} className="flex gap-3">
                        <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/60" />
                        {line}
                      </li>
                    ))}
                  </ul>
                </article>
              </Reveal>
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------------- Access */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-6xl px-5 py-16 lg:px-8">
            <Reveal>
              <div className="flex flex-col items-start justify-between gap-8 rounded-xl border border-border bg-card p-8 lg:flex-row lg:items-center lg:p-10">
                <div>
                  <h2 className="font-serif text-2xl font-semibold">A closed system, on purpose.</h2>
                  <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                    This is an internal tool for one research team, not a public product. Accounts are approved by
                    an administrator, and what each person can see or change is theirs to set.
                  </p>
                </div>
                <Link
                  href="/dashboard"
                  className={cn(buttonVariants({ size: 'lg' }), 'group h-10 shrink-0 gap-2 px-5')}
                >
                  {ctaLabel}
                  <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
              </div>
            </Reveal>

            <Reveal delay={100}>
              <ul className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-3">
                {ASSURANCES.map((item) => (
                  <li key={item.label} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <item.icon className="size-3.5" />
                    {item.label}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-xs text-muted-foreground sm:flex-row lg:px-8">
          <p className="font-mono uppercase tracking-[0.2em]">Field notebook / 2026</p>
          <p>
            <Link href="/terms" className="hover:text-foreground hover:underline">
              Terms of Service
            </Link>
            <span className="mx-2">·</span>
            <Link href="/privacy" className="hover:text-foreground hover:underline">
              Privacy Policy
            </Link>
          </p>
        </div>
      </footer>
    </div>
  )
}
