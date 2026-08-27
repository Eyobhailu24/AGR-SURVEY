import Link from 'next/link'

export const metadata = { title: 'Privacy Policy — Sudan Grass Research Dashboard' }

export default function PrivacyPage() {
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
          <h1 className="mt-1 font-serif text-3xl font-semibold">Privacy Policy</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last updated August 27, 2026.</p>
        </div>

        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p>
            This dashboard is an internal research tool used by a small, invite-only team. This page explains what
            it collects and why, in plain terms.
          </p>

          <h2>What we collect</h2>
          <ul>
            <li>
              <strong>Account info</strong> — your email address and display name, from Google when you sign in.
            </li>
            <li>
              <strong>Role &amp; approval history</strong> — your access level (Pending/Reader/Editor/Super
              Admin/Revoked), and who approved it and when.
            </li>
            <li>
              <strong>Research data you enter</strong> — findings, measurements, and dated notes, each attributed to
              the account that created or last edited it.
            </li>
            <li>
              <strong>Activity log</strong> — a record of who did what and when (created a finding, changed a role,
              ran an export, etc.), visible to Super Admins for oversight.
            </li>
            <li>
              <strong>A photo, only if you use it</strong> — the &ldquo;Import from photo&rdquo; feature sends the
              image you upload to Anthropic&apos;s Claude (via the Vercel AI Gateway) to extract a table of findings.
              The image itself isn&apos;t stored by this dashboard once that request completes; the extracted text
              is shown to you to review before anything is saved.
            </li>
          </ul>
          <p>Nothing here is collected from you passively or without your action — there's no tracking pixel or ad script.</p>

          <h2>Why we collect it</h2>
          <p>
            To run the dashboard: to know who you are and what you're allowed to do, to attribute research entries
            to the person who made them, and to give administrators the oversight they need to keep the data
            trustworthy.
          </p>

          <h2>Who else sees it</h2>
          <p>
            Nothing collected here is sold, and none of it is shared outside the people working on this research
            project. A few third-party services process parts of it on our behalf, only to do the specific thing
            you asked for:
          </p>
          <ul>
            <li>
              <strong>Google</strong> — handles sign-in (so we never see or store your password), and, only when you
              use the export feature, receives the data you're exporting to create a Sheet or Doc in your Google
              Drive.
            </li>
            <li>
              <strong>Anthropic (Claude)</strong>, via the Vercel AI Gateway — receives a photo only when you use
              &ldquo;Import from photo,&rdquo; to extract findings from it.
            </li>
            <li>
              <strong>Neon</strong> — hosts the database everything above lives in.
            </li>
            <li>
              <strong>Vercel</strong> — hosts the app, and in production collects basic, anonymized usage analytics
              (pages visited, no personal data attached).
            </li>
          </ul>

          <h2>How long we keep it</h2>
          <p>
            Research data and your account stay in the system for as long as the project and your access are
            active. The activity log is kept for oversight and is not automatically deleted. If your access is
            revoked, your account record and past contributions remain (research data belongs to the project — see
            the Terms of Service), but you lose the ability to sign in.
          </p>

          <h2>Your choices</h2>
          <p>
            You can ask a Super Admin to review, correct, export, or remove your account information at any time —
            see Team &amp; access for who that is. Removing your account doesn't retroactively remove research data
            you contributed, since that belongs to the project.
          </p>

          <h2>Security</h2>
          <p>
            Sign-in is handled entirely by Google OAuth — this dashboard never sees your Google password. Access
            beyond sign-in is gated by the role system described above, and all traffic is served over HTTPS.
          </p>

          <h2>Children's privacy</h2>
          <p>This dashboard is a research tool for an adult project team and isn't directed at children.</p>

          <h2>Changes</h2>
          <p>
            If this policy changes in a way that matters, the &ldquo;last updated&rdquo; date above will change with
            it.
          </p>

          <h2>Questions</h2>
          <p>Contact your workspace administrator (a Super Admin, under Team &amp; access) with questions.</p>
        </div>
      </div>
    </main>
  )
}
