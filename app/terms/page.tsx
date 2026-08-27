import Link from 'next/link'

export const metadata = { title: 'Terms of Service — Sudan Grass Research Dashboard' }

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-5 py-10 lg:py-16">
        <div>
          <Link href="/" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
            ← Back
          </Link>
          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            Field notebook / 2026
          </p>
          <h1 className="mt-1 font-serif text-3xl font-semibold">Terms of Service</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last updated August 27, 2026.</p>
        </div>

        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p>
            This Sudan Grass Research Dashboard (&ldquo;the dashboard&rdquo;) is an internal tool for recording,
            organizing, and reporting on greenhouse and lab research data. It is not a public product — access is
            invite-only and limited to people working on this research. By signing in, you agree to the terms below.
          </p>

          <h2>Who can use this</h2>
          <p>
            Access requires signing in with a Google account. New sign-ins start at &ldquo;Pending&rdquo; until a
            team administrator approves them with a role (Reader, Editor, or Super Admin). An administrator can
            change or revoke your role at any time, which changes or removes your access immediately.
          </p>

          <h2>What the dashboard is for</h2>
          <p>
            Use it to record findings, lab measurements, and dated notes for the research tabs it&apos;s configured
            with, and to export that data for reporting. It is not for storing anything unrelated to the research
            this team is doing.
          </p>

          <h2>Your responsibilities</h2>
          <ul>
            <li>Enter data in good faith and correct mistakes when you find them — other people rely on it.</li>
            <li>Don&apos;t share your account or your sign-in with anyone else.</li>
            <li>
              Don&apos;t use the CSV/photo import, export, or admin tools to extract data for a purpose outside this
              research project.
            </li>
            <li>Report anything that looks wrong — a bug, a data problem, or access you shouldn&apos;t have.</li>
          </ul>

          <h2>Research data</h2>
          <p>
            Findings, measurements, and notes entered into the dashboard belong to the research project, not to the
            individual who entered them. Editors can edit or delete entries other people created; every change is
            attributed and recorded in the activity log, visible to Super Admins.
          </p>

          <h2>Third-party services this dashboard uses</h2>
          <ul>
            <li>
              <strong>Google</strong> — for sign-in, and, if you use the export feature, for creating Google Sheets
              and Docs in your own Google Drive.
            </li>
            <li>
              <strong>Anthropic (Claude)</strong>, via the Vercel AI Gateway — powers the optional &ldquo;Import from
              photo&rdquo; feature. A photo you upload there is sent to Claude to extract a table of findings from
              it.
            </li>
            <li>
              <strong>Neon</strong> — hosts the Postgres database this dashboard's data lives in.
            </li>
            <li>
              <strong>Vercel</strong> — hosts the application itself, and (in production) provides basic, anonymous
              usage analytics.
            </li>
          </ul>
          <p>See the Privacy Policy for what data each of these actually receives.</p>

          <h2>No warranty</h2>
          <p>
            This is an internal research tool, provided as-is. It&apos;s actively maintained, but there&apos;s no
            uptime guarantee — back up anything you can&apos;t afford to lose via the export feature.
          </p>

          <h2>Changes</h2>
          <p>
            These terms may change as the dashboard changes. Material changes will be reflected in the &ldquo;last
            updated&rdquo; date above.
          </p>

          <h2>Questions</h2>
          <p>Contact your workspace administrator (a Super Admin, under Team &amp; access) with questions.</p>
        </div>
      </div>
    </main>
  )
}
